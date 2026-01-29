/**
 * Extract JIRA ticket ID from text
 * Deduplicates logic previously in prUtils.js:18 and jiraApi.js:57
 *
 * @param {string} text - Text to extract from (PR title, branch name, etc.)
 * @returns {string|null} JIRA ticket ID (e.g., "VIBE-123") or null if no match
 *
 * @example
 * extractJiraTicket('VIBE-123: Add new feature') // Returns 'VIBE-123'
 * extractJiraTicket('Fix bug in login flow') // Returns null
 */
function extractJiraTicket(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const match = text.match(/([A-Z]+-\d+)/);
  return match ? match[1] : null;
}

module.exports = { extractJiraTicket };
