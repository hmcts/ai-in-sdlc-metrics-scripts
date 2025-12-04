// PR analysis utility functions
const { execSync } = require('child_process');
const CONFIG = require('../../config');

// Exclude these developers (infrastructure/setup work)
const EXCLUDED_DEVELOPERS = [
  'linosnort',
  'linus-norton',
  'linusnorton',
  'ashwini-mv',
  'melvchance'
];

/**
 * Extract JIRA ticket ID from text
 */
function extractJiraTicket(text) {
  if (!text) return null;
  const match = text.match(/([A-Z]+-\d+)/);
  return match ? match[1] : null;
}

/**
 * Check if PR is a dependency update
 */
function isDependencyUpdate(title) {
  if (!title) return false;
  const lowerTitle = title.toLowerCase();
  return lowerTitle.includes('update dependency') ||
         lowerTitle.includes('update prisma') ||
         lowerTitle.includes('update vitest') ||
         lowerTitle.includes('update node.js') ||
         lowerTitle.includes('update github') ||
         lowerTitle.includes('update actions/');
}

/**
 * Check if PR is for an excluded ticket
 */
function isExcludedTicket(title) {
  if (!title) return false;
  return CONFIG.EXCLUDED_TICKETS.some(ticket => title.includes(ticket));
}

/**
 * Check if developer is excluded
 */
function isExcludedDeveloper(authorLogin) {
  if (!authorLogin) return false;
  return EXCLUDED_DEVELOPERS.some(
    excluded => authorLogin.toLowerCase().includes(excluded)
  );
}

/**
 * Fetch PR details including comments and LOC changes
 */
function fetchPRDetails(prNumber) {
  try {
    const prJson = execSync(
      `gh pr view ${prNumber} --repo ${CONFIG.REPO} --json number,title,author,comments,reviews,state,additions,deletions`,
      { encoding: 'utf8' }
    );
    return JSON.parse(prJson);
  } catch (error) {
    console.error(`Error fetching PR details for #${prNumber}:`, error.message);
    return null;
  }
}

/**
 * Count developer comments (excluding bots and AI assistants)
 */
function countDeveloperComments(pr) {
  const botUsernames = ['coderabbitai', 'github-actions', 'dependabot', 'renovate'];

  const developerComments = pr.comments.filter(comment => {
    if (comment.author.is_bot) return false;
    const username = comment.author.login ? comment.author.login.toLowerCase() : '';
    return !botUsernames.some(bot => username.includes(bot));
  });

  const developerReviews = pr.reviews ? pr.reviews.filter(review => {
    if (review.author.is_bot) return false;
    const username = review.author.login ? review.author.login.toLowerCase() : '';
    return !botUsernames.some(bot => username.includes(bot));
  }) : [];

  let reviewCommentCount = 0;
  developerReviews.forEach(review => {
    if (review.body && review.body.trim()) {
      reviewCommentCount++;
    }
  });

  return {
    issueComments: developerComments.length,
    reviewComments: reviewCommentCount,
    total: developerComments.length + reviewCommentCount
  };
}

/**
 * Filter PRs for a specific week
 */
function filterPRsForWeek(allPRs, week) {
  const startDate = new Date(week.start);
  const endDate = new Date(week.end);
  endDate.setHours(23, 59, 59, 999);

  return allPRs.filter(pr => {
    // Check date range
    const createdAt = pr.createdAt ? new Date(pr.createdAt) : null;
    if (!createdAt || createdAt < startDate || createdAt > endDate) {
      return false;
    }

    // Skip bot PRs
    if (pr.author && pr.author.is_bot) {
      return false;
    }

    // Skip dependency updates
    if (isDependencyUpdate(pr.title)) {
      return false;
    }

    // Skip excluded tickets
    if (isExcludedTicket(pr.title)) {
      return false;
    }

    // Skip excluded developers
    if (pr.author && isExcludedDeveloper(pr.author.login)) {
      return false;
    }

    // Only include merged PRs
    return pr.state === 'MERGED';
  });
}

/**
 * Calculate LOC per developer for given PRs
 */
function calculateLocPerDev(prs) {
  const devLOC = {};

  prs.forEach(pr => {
    const login = pr.author.login;
    const loc = (pr.additions || 0) + (pr.deletions || 0);

    if (!devLOC[login]) {
      devLOC[login] = { prs: 0, additions: 0, deletions: 0, totalLOC: 0 };
    }

    devLOC[login].prs++;
    devLOC[login].additions += pr.additions || 0;
    devLOC[login].deletions += pr.deletions || 0;
    devLOC[login].totalLOC += loc;
  });

  const devCount = Object.keys(devLOC).length;
  const totalLOC = Object.values(devLOC).reduce((sum, d) => sum + d.totalLOC, 0);
  const avgLOCPerDev = devCount > 0 ? totalLOC / devCount : 0;

  return {
    devCount,
    totalLOC,
    avgLOCPerDev: Math.round(avgLOCPerDev),
    devLOC
  };
}

module.exports = {
  extractJiraTicket,
  isDependencyUpdate,
  isExcludedTicket,
  isExcludedDeveloper,
  fetchPRDetails,
  countDeveloperComments,
  filterPRsForWeek,
  calculateLocPerDev,
  EXCLUDED_DEVELOPERS
};
