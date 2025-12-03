// Comprehensive PR analysis for a given week
const { execSync } = require('child_process');
const CONFIG = require('../../config');
const { filterPRsForWeek, fetchPRDetails, countDeveloperComments, extractJiraTicket, calculateLocPerDev } = require('./prUtils');
const { aggregateSonarMetrics } = require('../../quality/utils/sonarUtils');

/**
 * Fetch all PRs from repository (cached for performance)
 */
let cachedPRs = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function fetchAllPRs() {
  const now = Date.now();

  // Return cached data if still valid
  if (cachedPRs && cacheTimestamp && (now - cacheTimestamp < CACHE_TTL)) {
    return cachedPRs;
  }

  console.log('  Fetching PRs from GitHub...');
  const searchQuery = 'created:>=2025-10-01';
  const prListJson = execSync(
    `gh pr list --repo ${CONFIG.REPO} --search "${searchQuery}" --limit 500 --json number,title,state,author,createdAt,mergedAt,additions,deletions --state all`,
    { encoding: 'utf8' }
  );

  cachedPRs = JSON.parse(prListJson);
  cacheTimestamp = now;

  return cachedPRs;
}

/**
 * Analyze PRs for a given week
 * Returns structured metrics for the orchestrator
 */
function analyzePRsForWeek(week) {
  const allPRs = fetchAllPRs();
  const featurePRs = filterPRsForWeek(allPRs, week);

  if (featurePRs.length === 0) {
    return {
      featurePRs: 0,
      locPerPR: null,
      locPerDev: 0,
      commentsPerPR: null,
      testCoverage: null,
      cves: null,
      duplicatedLines: null,
      maintainability: null,
      reliability: null,
      security: null,
      bugs: null,
      codeSmells: null
    };
  }

  // Calculate LOC metrics
  const locMetrics = calculateLocPerDev(featurePRs);
  const totalLOC = featurePRs.reduce((sum, pr) => sum + (pr.additions || 0) + (pr.deletions || 0), 0);
  const avgLocPerPR = Math.round(totalLOC / featurePRs.length);

  // Fetch comments for each PR
  const commentCounts = [];
  featurePRs.forEach(pr => {
    const prDetail = fetchPRDetails(pr.number);
    if (prDetail) {
      const comments = countDeveloperComments(prDetail);
      commentCounts.push(comments.total);
    }
  });

  const avgComments = commentCounts.length > 0
    ? commentCounts.reduce((sum, count) => sum + count, 0) / commentCounts.length
    : null;

  // Fetch SonarCloud metrics
  const prNumbers = featurePRs.map(pr => pr.number);
  const sonarMetrics = aggregateSonarMetrics(prNumbers);

  // Extract JIRA tickets from PR titles
  const { extractJiraTicket } = require('../../jira/utils/jiraApi');
  const prTickets = featurePRs
    .map(pr => extractJiraTicket(pr.title))
    .filter(ticket => ticket !== null);

  return {
    featurePRs: featurePRs.length,
    locPerPR: avgLocPerPR,
    locPerDev: locMetrics.avgLOCPerDev,
    commentsPerPR: avgComments ? parseFloat(avgComments.toFixed(2)) : null,
    testCoverage: sonarMetrics.testCoverage ? parseFloat(sonarMetrics.testCoverage.toFixed(2)) : null,
    cves: sonarMetrics.cves !== null ? Math.round(sonarMetrics.cves) : null,
    duplicatedLines: sonarMetrics.duplicatedLines ? parseFloat(sonarMetrics.duplicatedLines.toFixed(2)) : null,
    maintainability: sonarMetrics.maintainability ? parseFloat(sonarMetrics.maintainability.toFixed(2)) : null,
    reliability: sonarMetrics.reliability ? parseFloat(sonarMetrics.reliability.toFixed(2)) : null,
    security: sonarMetrics.security ? parseFloat(sonarMetrics.security.toFixed(2)) : null,
    bugs: sonarMetrics.bugs ? parseFloat(sonarMetrics.bugs.toFixed(2)) : null,
    codeSmells: sonarMetrics.codeSmells ? parseFloat(sonarMetrics.codeSmells.toFixed(2)) : null,
    prTickets: prTickets // Add tickets for JIRA story points lookup
  };
}

module.exports = {
  analyzePRsForWeek,
  fetchAllPRs
};
