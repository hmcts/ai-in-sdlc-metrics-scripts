#!/usr/bin/env node

/**
 * PIP Repos LOC per Developer Analysis
 *
 * Calculates average LOC per week for developers working on the original
 * CaTH Service (PIP repos) during the baseline period.
 *
 * Uses the same outlier filtering logic as baseline_loc_per_dev.js
 *
 * Usage:
 *   node collectPipLocPerDev.js [--start YYYY-MM-DD] [--end YYYY-MM-DD]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // PIP Repositories (Original CaTH Service)
  REPOS: [
    'hmcts/pip-publication-services',
    'hmcts/pip-account-management',
    'hmcts/pip-data-management',
    'hmcts/pip-frontend'
  ],

  // Baseline period (same as CaTH team baseline)
  DEFAULT_START: '2025-06-01',
  DEFAULT_END: '2025-08-31',

  // Output file
  OUTPUT_FILE: path.join(__dirname, 'pip-loc-per-dev-output.json'),

  // Outlier threshold - same as baseline_loc_per_dev.js
  // Excludes PRs with total LOC changes exceeding 95th percentile
  OUTLIER_THRESHOLD: 1595,

  // Developers to exclude from the baseline calculation
  EXCLUDED_DEVELOPERS: ['ashwini-mv', 'ashwinipawar93', 'linusnorton'],
};

// ============================================================================
// COMMAND LINE ARGUMENT PARSING
// ============================================================================

const args = process.argv.slice(2);
let startDate = CONFIG.DEFAULT_START;
let endDate = CONFIG.DEFAULT_END;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--start' || args[i] === '-s') && args[i + 1]) {
    startDate = args[i + 1];
    i++;
  } else if ((args[i] === '--end' || args[i] === '-e') && args[i + 1]) {
    endDate = args[i + 1];
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node collectPipLocPerDev.js [options]');
    console.log();
    console.log('Options:');
    console.log('  --start, -s <date>   Start date (YYYY-MM-DD) [default: 2025-06-01]');
    console.log('  --end, -e <date>     End date (YYYY-MM-DD) [default: 2025-08-31]');
    console.log('  --help, -h           Show this help message');
    console.log();
    console.log('Example:');
    console.log('  node collectPipLocPerDev.js --start 2025-06-01 --end 2025-08-31');
    process.exit(0);
  }
}

// Parse and validate dates
const START_DATE = new Date(startDate + 'T00:00:00Z');
const END_DATE = new Date(endDate + 'T23:59:59Z');

if (isNaN(START_DATE.getTime()) || isNaN(END_DATE.getTime())) {
  console.error('Error: Invalid date format. Please use YYYY-MM-DD');
  process.exit(1);
}

if (START_DATE > END_DATE) {
  console.error('Error: Start date must be before end date');
  process.exit(1);
}

// Calculate number of weeks in the period
const DAYS_IN_PERIOD = Math.ceil((END_DATE - START_DATE) / (1000 * 60 * 60 * 24));
const WEEKS_IN_PERIOD = DAYS_IN_PERIOD / 7;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch all merged PRs for a repository in the date range
 * Excludes bot PRs and dependency updates
 */
function fetchPRsForRepo(repo, startDate, endDate) {
  try {
    console.log(`  Fetching merged PRs from ${repo}...`);

    const cmd = `gh pr list --repo ${repo} --state merged --limit 1000 --json number,author,additions,deletions,createdAt,mergedAt,title`;

    const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    const allPRs = JSON.parse(output);

    // Filter by date range and exclude bots
    const filteredPRs = allPRs.filter(pr => {
      // Filter by creation date
      if (!pr.createdAt) return false;
      const createdDate = new Date(pr.createdAt);
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!(createdDate >= start && createdDate <= end)) {
        return false;
      }

      // Exclude bot PRs
      const author = pr.author?.login || '';
      if (author.includes('[bot]') || author === 'renovate' || author === 'dependabot') {
        return false;
      }

      // Exclude dependency update PRs
      const titleLower = pr.title?.toLowerCase() || '';
      if (titleLower.includes('update dependency') ||
          titleLower.includes('bump') ||
          titleLower.includes('renovate') ||
          titleLower.includes('dependabot')) {
        return false;
      }

      return true;
    });

    console.log(`  Found ${filteredPRs.length} merged PRs (excluding bots)`);

    return filteredPRs.map(pr => ({
      number: pr.number,
      author: pr.author.login,
      additions: pr.additions || 0,
      deletions: pr.deletions || 0,
      createdAt: pr.createdAt,
      mergedAt: pr.mergedAt,
      title: pr.title,
      repo: repo
    }));

  } catch (error) {
    console.error(`  Error fetching PRs from ${repo}:`, error.message);
    return [];
  }
}

/**
 * Get ISO week number from a date
 */
function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
}

/**
 * Calculate statistics for all developers
 * Excludes outlier PRs that exceed the threshold
 * Uses ACTIVE WEEKS (weeks where developer had at least 1 PR) instead of total period
 */
function calculateDeveloperStats(prs, weeksInPeriod, outlierThreshold, excludedDevelopers = []) {
  const devStats = {};

  // First pass: track ALL PRs (including outliers) for active week calculation
  prs.forEach(pr => {
    const author = pr.author;

    // Skip excluded developers
    if (excludedDevelopers.includes(author)) {
      return;
    }

    if (!devStats[author]) {
      devStats[author] = {
        totalAdditions: 0,
        totalDeletions: 0,
        totalLOC: 0,
        prCount: 0,
        outlierPRsExcluded: 0,
        avgLocPerWeek: 0,
        avgLocPerPR: 0,
        activeWeeks: new Set(),
        repos: new Set()
      };
    }

    // Track which week this PR was created in (for active weeks calculation)
    const weekNumber = getWeekNumber(pr.createdAt);
    devStats[author].activeWeeks.add(weekNumber);

    const prTotalLOC = pr.additions + pr.deletions;

    // Check if this PR is an outlier
    if (prTotalLOC > outlierThreshold) {
      devStats[author].outlierPRsExcluded++;
      // Skip this PR for LOC counting, but we still counted it for active weeks
      return;
    }

    devStats[author].totalAdditions += pr.additions;
    devStats[author].totalDeletions += pr.deletions;
    devStats[author].totalLOC += prTotalLOC;
    devStats[author].prCount++;
    devStats[author].repos.add(pr.repo);
  });

  // Calculate averages using ACTIVE WEEKS
  Object.keys(devStats).forEach(dev => {
    const stats = devStats[dev];
    const activeWeeksCount = stats.activeWeeks.size;

    // Use active weeks instead of total period for LOC/week calculation
    stats.avgLocPerWeek = activeWeeksCount > 0 ? stats.totalLOC / activeWeeksCount : 0;
    stats.avgLocPerPR = stats.prCount > 0 ? stats.totalLOC / stats.prCount : 0;
    stats.activeWeeksCount = activeWeeksCount;

    // Convert Sets to Arrays for JSON serialization
    stats.repos = Array.from(stats.repos);
    stats.activeWeeks = Array.from(stats.activeWeeks).sort();
  });

  return devStats;
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

console.log('='.repeat(80));
console.log('PIP REPOS LOC PER DEVELOPER ANALYSIS');
console.log(`Period: ${startDate} to ${endDate}`);
console.log(`Duration: ${WEEKS_IN_PERIOD.toFixed(2)} weeks`);
console.log('='.repeat(80));
console.log();

console.log('PIP Repositories:');
CONFIG.REPOS.forEach(repo => console.log(`  - ${repo}`));
console.log();

// Collect all PRs from all PIP repositories
let allPRs = [];

console.log('Fetching data from repositories...');
console.log();

for (const repo of CONFIG.REPOS) {
  console.log(`Processing ${repo}...`);

  const prs = fetchPRsForRepo(repo, startDate, endDate);
  allPRs = allPRs.concat(prs);

  console.log();

  // Small delay to avoid rate limiting
  execSync('sleep 0.5');
}

console.log('='.repeat(80));
console.log(`Total PRs collected: ${allPRs.length}`);
console.log('='.repeat(80));
console.log();

// Calculate statistics with outlier filtering
const devStats = calculateDeveloperStats(allPRs, WEEKS_IN_PERIOD, CONFIG.OUTLIER_THRESHOLD, CONFIG.EXCLUDED_DEVELOPERS);

// Sort developers by total LOC (descending)
const sortedDevs = Object.keys(devStats).sort((a, b) =>
  devStats[b].totalLOC - devStats[a].totalLOC
);

// Calculate summary statistics
const totalPRsCounted = Object.values(devStats).reduce((sum, dev) => sum + dev.prCount, 0);
const totalOutliersExcluded = Object.values(devStats).reduce((sum, dev) => sum + dev.outlierPRsExcluded, 0);
const totalDevelopers = Object.keys(devStats).length;

// Calculate average across all developers
const avgLocPerWeekAcrossDevs = Object.values(devStats).reduce((sum, dev) => sum + dev.avgLocPerWeek, 0) / totalDevelopers;
const avgLocPerPRAcrossDevs = Object.values(devStats).reduce((sum, dev) => sum + dev.avgLocPerPR, 0) / totalDevelopers;

// Print results
console.log('='.repeat(80));
console.log('RESULTS: LOC PER ACTIVE WEEK BY DEVELOPER (Outliers Excluded)');
console.log('='.repeat(80));
console.log();
console.log('NOTE: LOC per week is calculated using ACTIVE WEEKS (weeks with at least 1 PR)');
console.log('      This provides a more accurate measure of productivity.');
console.log();

sortedDevs.forEach(dev => {
  const stats = devStats[dev];

  console.log(`Developer: ${dev}`);
  console.log(`  Active Weeks: ${stats.activeWeeksCount} (out of ${WEEKS_IN_PERIOD.toFixed(2)} total weeks)`);
  console.log(`  PRs Merged: ${stats.prCount}`);
  console.log(`  Outlier PRs Excluded: ${stats.outlierPRsExcluded} (>${CONFIG.OUTLIER_THRESHOLD.toLocaleString()} LOC)`);
  console.log(`  Total Additions: ${stats.totalAdditions.toLocaleString()}`);
  console.log(`  Total Deletions: ${stats.totalDeletions.toLocaleString()}`);
  console.log(`  Total LOC Changed: ${stats.totalLOC.toLocaleString()}`);
  console.log(`  Average LOC per Active Week: ${Math.round(stats.avgLocPerWeek).toLocaleString()}`);
  console.log(`  Average LOC per PR: ${Math.round(stats.avgLocPerPR).toLocaleString()}`);
  console.log(`  Repos Contributed To: ${stats.repos.join(', ')}`);
  console.log();
});

// Print average across all developers
console.log('='.repeat(80));
console.log('AVERAGE ACROSS ALL DEVELOPERS');
console.log('='.repeat(80));
console.log();
console.log(`  Total Developers: ${totalDevelopers}`);
console.log(`  Average LOC per Active Week: ${Math.round(avgLocPerWeekAcrossDevs).toLocaleString()}`);
console.log(`  Average LOC per PR: ${Math.round(avgLocPerPRAcrossDevs).toLocaleString()}`);
console.log();
console.log('  (Active week = a week where the developer created at least 1 PR)');
console.log();

// Save results to JSON
const results = {
  summary: {
    period: `${startDate} to ${endDate}`,
    weeksAnalyzed: WEEKS_IN_PERIOD,
    outlierThreshold: CONFIG.OUTLIER_THRESHOLD,
    totalPRsCollected: allPRs.length,
    totalPRsCounted: totalPRsCounted,
    totalOutliersExcluded: totalOutliersExcluded,
    totalDevelopers: totalDevelopers,
    averageAcrossAllDevelopers: {
      avgLocPerWeek: Math.round(avgLocPerWeekAcrossDevs),
      avgLocPerPR: Math.round(avgLocPerPRAcrossDevs)
    }
  },
  metadata: {
    repositories: CONFIG.REPOS,
    startDate: startDate,
    endDate: endDate,
    daysInPeriod: DAYS_IN_PERIOD,
    weeksInPeriod: WEEKS_IN_PERIOD,
    outlierThreshold: CONFIG.OUTLIER_THRESHOLD,
    generatedAt: new Date().toISOString()
  },
  developerStats: devStats,
  allPRs: allPRs.map(pr => ({
    repo: pr.repo,
    number: pr.number,
    author: pr.author,
    title: pr.title,
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt,
    additions: pr.additions,
    deletions: pr.deletions,
    totalLOC: pr.additions + pr.deletions
  }))
};

fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(results, null, 2));

console.log('='.repeat(80));
console.log(`Results saved to: ${CONFIG.OUTPUT_FILE}`);
console.log('='.repeat(80));
console.log();

// Print key metric for chart
console.log('='.repeat(80));
console.log('FOR WEEKLY METRICS CHART');
console.log('='.repeat(80));
console.log();
console.log(`Original CaTH Service (PIP Repos) LOC per Dev: ${Math.round(avgLocPerWeekAcrossDevs)} LOC/active week`);
console.log();
console.log('This represents the average LOC per week across all developers,');
console.log('calculated using only their ACTIVE weeks (weeks with at least 1 PR).');
console.log();
