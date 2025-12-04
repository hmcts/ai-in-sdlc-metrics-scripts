// JIRA API integration utilities
const { execSync } = require('child_process');
const CONFIG = require('../../config');

/**
 * Fetch story points for a single ticket from JIRA
 */
function getStoryPoints(ticketId) {
  if (!CONFIG.JIRA_TOKEN) {
    return null;
  }

  try {
    // customfield_10004 is the story points field in JIRA
    const url = `https://tools.hmcts.net/jira/rest/api/2/issue/${ticketId}?fields=customfield_10004,summary,status`;
    const response = execSync(
      `curl -s -H "Authorization: Bearer ${CONFIG.JIRA_TOKEN}" "${url}"`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    const data = JSON.parse(response);
    return {
      storyPoints: data.fields?.customfield_10004 || null,
      summary: data.fields?.summary || null,
      status: data.fields?.status?.name || null
    };
  } catch (error) {
    console.error(`  Warning: Could not fetch data for ${ticketId}`);
    return null;
  }
}

/**
 * Fetch story points for multiple tickets (with rate limiting)
 */
function getStoryPointsForTickets(ticketIds) {
  const results = {};

  ticketIds.forEach((ticketId, index) => {
    const data = getStoryPoints(ticketId);
    if (data) {
      results[ticketId] = data;
    }

    // Rate limiting
    if (index < ticketIds.length - 1) {
      execSync('sleep 0.2');
    }
  });

  return results;
}

/**
 * Extract JIRA ticket ID from text
 */
function extractJiraTicket(text) {
  if (!text) return null;
  const match = text.match(/([A-Z]+-\d+)/);
  return match ? match[1] : null;
}

/**
 * Fetch story points completed for a week by analyzing PR merge dates
 * This is more reliable than resolutiondate which may not be set consistently
 */
function getStoryPointsCompletedForWeek(week, prTickets) {
  if (!CONFIG.JIRA_TOKEN || !prTickets || prTickets.length === 0) {
    return { storyPoints: 0, issues: [] };
  }

  try {
    let totalSP = 0;
    const issues = [];

    prTickets.forEach(ticketId => {
      const data = getStoryPoints(ticketId);
      if (data && data.storyPoints) {
        totalSP += data.storyPoints;
        issues.push({
          key: ticketId,
          summary: data.summary || '',
          storyPoints: data.storyPoints
        });
      }
    });

    return {
      storyPoints: totalSP,
      issues: issues
    };
  } catch (error) {
    console.error(`  Warning: Could not fetch JIRA data for ${week.name}: ${error.message}`);
    return null;
  }
}

module.exports = {
  getStoryPoints,
  getStoryPointsForTickets,
  extractJiraTicket,
  getStoryPointsCompletedForWeek
};
