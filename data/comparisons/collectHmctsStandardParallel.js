#!/usr/bin/env node

/**
 * HMCTS Organization-Wide LOC per Developer Analysis (Parallel Version)
 *
 * Optimized version that processes repos in parallel for faster execution.
 * Uses the same methodology as collectPipLocPerDev.js.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  ORG: 'hmcts',
  DEFAULT_START: '2025-06-01',
  DEFAULT_END: '2025-08-31',
  OUTPUT_FILE: path.join(__dirname, 'hmcts-standard-output.json'),
  OUTLIER_THRESHOLD: 1595,
  MIN_PRS_PER_DEV: 3,

  // Parallel processing settings
  CONCURRENT_REPOS: 30,  // Process 30 repos at a time
  TIMEOUT_PER_REPO: 15000,  // 15 second timeout per repo
};

// Parse command line args
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
  }
}

const START_DATE = new Date(startDate + 'T00:00:00Z');
const END_DATE = new Date(endDate + 'T23:59:59Z');
const DAYS_IN_PERIOD = Math.ceil((END_DATE - START_DATE) / (1000 * 60 * 60 * 24));
const WEEKS_IN_PERIOD = DAYS_IN_PERIOD / 7;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
}

function getAllRepos() {
  console.log('Fetching HMCTS repositories...');

  try {
    const cmd = `gh repo list ${CONFIG.ORG} --limit 1000 --json name --jq '.[].name'`;
    const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    const repos = output.trim().split('\n').filter(r => r);

    console.log(`  Found ${repos.length} total repositories`);
    return repos.map(r => `${CONFIG.ORG}/${r}`);
  } catch (error) {
    console.error('  Error fetching repositories:', error.message);
    return [];
  }
}

/**
 * Fetch PRs with timeout protection
 */
function fetchPRsForRepoWithTimeout(repo, startDate, endDate, timeoutMs) {
  try {
    // Don't use 'timeout' command (not available on macOS), just use Node timeout
    const cmd = `gh pr list --repo ${repo} --state merged --limit 1000 --json number,author,additions,deletions,createdAt,mergedAt,title`;

    const output = execSync(cmd, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],  // Capture stderr to see errors
      timeout: timeoutMs
    });

    const allPRs = JSON.parse(output);

    // Filter by date range and exclude bots
    const filteredPRs = allPRs.filter(pr => {
      if (!pr.createdAt) return false;
      const createdDate = new Date(pr.createdAt);
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!(createdDate >= start && createdDate <= end)) return false;

      const author = pr.author?.login || '';
      if (author.includes('[bot]') || author === 'renovate' || author === 'dependabot') {
        return false;
      }

      const titleLower = pr.title?.toLowerCase() || '';
      if (titleLower.includes('update dependency') ||
          titleLower.includes('bump') ||
          titleLower.includes('renovate') ||
          titleLower.includes('dependabot')) {
        return false;
      }

      return true;
    });

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
    // Log first few errors to help debug
    if (Math.random() < 0.01) {  // Log ~1% of errors
      console.error(`  [DEBUG] Error fetching ${repo}: ${error.message.substring(0, 100)}`);
    }
    return [];
  }
}

/**
 * Process repos in batches concurrently
 */
async function processBatch(repos, startDate, endDate) {
  const promises = repos.map(repo =>
    new Promise((resolve) => {
      // Use setImmediate to prevent blocking
      setImmediate(() => {
        const prs = fetchPRsForRepoWithTimeout(repo, startDate, endDate, CONFIG.TIMEOUT_PER_REPO);
        resolve({ repo, prs });
      });
    })
  );

  return Promise.all(promises);
}

/**
 * Process all repos in parallel batches
 */
async function processAllReposInParallel(repos, startDate, endDate) {
  const allPRs = [];
  let reposWithPRs = 0;
  let processedCount = 0;

  console.log(`Processing ${repos.length} repositories in batches of ${CONFIG.CONCURRENT_REPOS}...`);
  console.log();

  // Split repos into batches
  for (let i = 0; i < repos.length; i += CONFIG.CONCURRENT_REPOS) {
    const batch = repos.slice(i, i + CONFIG.CONCURRENT_REPOS);
    const results = await processBatch(batch, startDate, endDate);

    for (const { repo, prs } of results) {
      processedCount++;
      if (prs.length > 0) {
        reposWithPRs++;
        allPRs.push(...prs);
      }

      // Progress update after EVERY repo
      const percentage = ((processedCount / repos.length) * 100).toFixed(1);
      const elapsed = ((Date.now() - global.startTime) / 1000).toFixed(0);
      console.log(`  [${elapsed}s] ${processedCount}/${repos.length} (${percentage}%), ${reposWithPRs} with PRs, ${allPRs.length} PRs`);
    }
  }

  return { allPRs, reposWithPRs };
}

function calculateDeveloperStats(prs, weeksInPeriod, outlierThreshold) {
  const devStats = {};

  prs.forEach(pr => {
    const author = pr.author;

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

    const weekNumber = getWeekNumber(pr.createdAt);
    devStats[author].activeWeeks.add(weekNumber);

    const prTotalLOC = pr.additions + pr.deletions;

    if (prTotalLOC > outlierThreshold) {
      devStats[author].outlierPRsExcluded++;
      return;
    }

    devStats[author].totalAdditions += pr.additions;
    devStats[author].totalDeletions += pr.deletions;
    devStats[author].totalLOC += prTotalLOC;
    devStats[author].prCount++;
    devStats[author].repos.add(pr.repo);
  });

  Object.keys(devStats).forEach(dev => {
    const stats = devStats[dev];
    const activeWeeksCount = stats.activeWeeks.size;

    stats.avgLocPerWeek = activeWeeksCount > 0 ? stats.totalLOC / activeWeeksCount : 0;
    stats.avgLocPerPR = stats.prCount > 0 ? stats.totalLOC / stats.prCount : 0;
    stats.activeWeeksCount = activeWeeksCount;

    stats.repos = Array.from(stats.repos);
    stats.activeWeeks = Array.from(stats.activeWeeks).sort();
  });

  return devStats;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('='.repeat(80));
  console.log('HMCTS ORGANIZATION-WIDE LOC PER DEVELOPER ANALYSIS (PARALLEL)');
  console.log(`Period: ${startDate} to ${endDate}`);
  console.log(`Duration: ${WEEKS_IN_PERIOD.toFixed(2)} weeks`);
  console.log(`Concurrent repos: ${CONFIG.CONCURRENT_REPOS}`);
  console.log(`Timeout per repo: ${CONFIG.TIMEOUT_PER_REPO}ms`);
  console.log('='.repeat(80));
  console.log();

  const allRepos = getAllRepos();

  if (allRepos.length === 0) {
    console.error('No repositories found');
    process.exit(1);
  }

  const startTime = Date.now();
  global.startTime = startTime;  // Make available for progress logging

  // Process repos in parallel
  const { allPRs, reposWithPRs } = await processAllReposInParallel(allRepos, startDate, endDate);

  const processingTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log();
  console.log('='.repeat(80));
  console.log(`Processing completed in ${processingTime} minutes`);
  console.log(`Repositories with PRs: ${reposWithPRs} (out of ${allRepos.length} total)`);
  console.log(`Total PRs collected: ${allPRs.length}`);
  console.log('='.repeat(80));
  console.log();

  if (allPRs.length === 0) {
    console.error('No PRs found in the period');
    process.exit(1);
  }

  // Calculate statistics
  const devStats = calculateDeveloperStats(allPRs, WEEKS_IN_PERIOD, CONFIG.OUTLIER_THRESHOLD);

  // Filter qualified developers
  const qualifiedDevs = Object.keys(devStats).filter(dev =>
    devStats[dev].prCount >= CONFIG.MIN_PRS_PER_DEV
  );

  console.log(`Developers with at least ${CONFIG.MIN_PRS_PER_DEV} PRs: ${qualifiedDevs.length}`);
  console.log();

  // Sort by total LOC
  const sortedDevs = qualifiedDevs.sort((a, b) =>
    devStats[b].totalLOC - devStats[a].totalLOC
  );

  // Calculate averages
  const totalPRsCounted = qualifiedDevs.reduce((sum, dev) => sum + devStats[dev].prCount, 0);
  const totalOutliersExcluded = qualifiedDevs.reduce((sum, dev) => sum + devStats[dev].outlierPRsExcluded, 0);
  const totalDevelopers = qualifiedDevs.length;

  const avgLocPerWeekAcrossDevs = qualifiedDevs.reduce((sum, dev) => sum + devStats[dev].avgLocPerWeek, 0) / totalDevelopers;
  const avgLocPerPRAcrossDevs = qualifiedDevs.reduce((sum, dev) => sum + devStats[dev].avgLocPerPR, 0) / totalDevelopers;

  // Print top 20
  console.log('='.repeat(80));
  console.log('TOP 20 DEVELOPERS BY TOTAL LOC (Outliers Excluded)');
  console.log('='.repeat(80));
  console.log();

  sortedDevs.slice(0, 20).forEach((dev, index) => {
    const stats = devStats[dev];
    console.log(`${index + 1}. Developer: ${dev}`);
    console.log(`   Active Weeks: ${stats.activeWeeksCount} (out of ${WEEKS_IN_PERIOD.toFixed(2)} total)`);
    console.log(`   PRs Merged: ${stats.prCount}`);
    console.log(`   Total LOC: ${stats.totalLOC.toLocaleString()}`);
    console.log(`   Avg LOC/Active Week: ${Math.round(stats.avgLocPerWeek).toLocaleString()}`);
    console.log(`   Repos: ${stats.repos.length}`);
    console.log();
  });

  // Print summary
  console.log('='.repeat(80));
  console.log('HMCTS ORGANIZATION-WIDE AVERAGE');
  console.log('='.repeat(80));
  console.log();
  console.log(`  Total Qualified Developers: ${totalDevelopers}`);
  console.log(`  Total PRs Counted: ${totalPRsCounted.toLocaleString()}`);
  console.log(`  Total Outliers Excluded: ${totalOutliersExcluded.toLocaleString()}`);
  console.log(`  Average LOC per Active Week: ${Math.round(avgLocPerWeekAcrossDevs).toLocaleString()}`);
  console.log(`  Average LOC per PR: ${Math.round(avgLocPerPRAcrossDevs).toLocaleString()}`);
  console.log();

  // Save results
  const results = {
    summary: {
      period: `${startDate} to ${endDate}`,
      weeksAnalyzed: WEEKS_IN_PERIOD,
      outlierThreshold: CONFIG.OUTLIER_THRESHOLD,
      minPRsPerDev: CONFIG.MIN_PRS_PER_DEV,
      totalRepositories: allRepos.length,
      repositoriesWithPRs: reposWithPRs,
      totalPRsCollected: allPRs.length,
      totalPRsCounted: totalPRsCounted,
      totalOutliersExcluded: totalOutliersExcluded,
      totalDevelopers: totalDevelopers,
      processingTimeMinutes: parseFloat(processingTime),
      averageAcrossAllDevelopers: {
        avgLocPerWeek: Math.round(avgLocPerWeekAcrossDevs),
        avgLocPerPR: Math.round(avgLocPerPRAcrossDevs)
      }
    },
    metadata: {
      organization: CONFIG.ORG,
      startDate: startDate,
      endDate: endDate,
      generatedAt: new Date().toISOString()
    },
    developerStats: Object.fromEntries(
      qualifiedDevs.map(dev => [dev, devStats[dev]])
    )
  };

  fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(results, null, 2));

  console.log('='.repeat(80));
  console.log(`Results saved to: ${CONFIG.OUTPUT_FILE}`);
  console.log('='.repeat(80));
  console.log();

  console.log('='.repeat(80));
  console.log('FOR WEEKLY METRICS CHART');
  console.log('='.repeat(80));
  console.log();
  console.log(`HMCTS Standard LOC per Dev: ${Math.round(avgLocPerWeekAcrossDevs)} LOC/active week`);
  console.log();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
