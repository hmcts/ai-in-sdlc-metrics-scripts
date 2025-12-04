// Correlate token usage with story points per week
const { extractAllTokens } = require('../../transcripts/utils/tokenExtractor');
const { getStoryPointsForTickets, extractJiraTicket } = require('../../jira/utils/jiraApi');
const { fetchAllPRs } = require('../../github/utils/prAnalysis');
const { isInWeek } = require('../../shared/utils/dateUtils');
const CONFIG = require('../../config');

/**
 * Build ticket -> PR mapping (only merged PRs)
 */
function buildTicketToPRMapping(prs, week) {
  const ticketToPR = {};

  prs.forEach(pr => {
    // Only include MERGED PRs
    if (pr.state !== 'MERGED') return;

    const ticket = extractJiraTicket(pr.title);
    if (!ticket) return;

    const createdAt = new Date(pr.createdAt);

    // Check if PR was created in this week
    if (isInWeek(createdAt, week)) {
      ticketToPR[ticket] = {
        prNumber: pr.number,
        createdAt: pr.createdAt,
        mergedAt: pr.mergedAt,
        week: week.name
      };
    }
  });

  return ticketToPR;
}

/**
 * Calculate tokens per story point for a given week
 * Returns structured data for the orchestrator
 */
async function calculateTokensPerSPForWeek(week) {
  try {
    // 1. Extract all tokens from transcripts
    const allTokensByTicket = await extractAllTokens();

    // 2. Get all PRs and build ticket mapping for this week
    const allPRs = fetchAllPRs();
    const ticketToPR = buildTicketToPRMapping(allPRs, week);

    if (Object.keys(ticketToPR).length === 0) {
      return {
        tokensPerSP: null,
        storyPoints: null,
        totalCost: null,
        costPerLOC: null,
        costPerPR: null,
        costPerSP: null,
        locPerToken: null
      };
    }

    // 3. Fetch story points for tickets with merged PRs
    const ticketIds = Object.keys(ticketToPR);
    const jiraData = getStoryPointsForTickets(ticketIds);

    // 4. Calculate totals for this week
    let weekTotalTokens = 0;
    let weekTotalSP = 0;
    let weekTotalSPAllTickets = 0; // Total SP including tickets without tokens

    ticketIds.forEach(ticket => {
      const prInfo = ticketToPR[ticket];
      const tokens = allTokensByTicket[ticket];
      const jira = jiraData[ticket];

      // Count ALL story points (even without tokens)
      if (jira && jira.storyPoints) {
        weekTotalSPAllTickets += jira.storyPoints;
        prInfo.storyPoints = jira.storyPoints;

        // Only count tokens if they exist
        if (tokens) {
          weekTotalTokens += tokens.total;
          weekTotalSP += jira.storyPoints;
          prInfo.tokens = tokens.total;
        }
      }
    });

    const tokensPerSP = weekTotalSP > 0 ? Math.round(weekTotalTokens / weekTotalSP) : null;

    return {
      tokensPerSP: tokensPerSP,
      storyPoints: weekTotalSPAllTickets > 0 ? weekTotalSPAllTickets : null, // Return ALL story points
      totalTokens: weekTotalTokens > 0 ? weekTotalTokens : null,
      ticketDetails: ticketToPR  // For debugging/detailed analysis
    };
  } catch (error) {
    console.error(`  Error calculating tokens/SP for ${week.name}:`, error.message);
    return {
      tokensPerSP: null,
      storyPoints: null,
      totalTokens: null
    };
  }
}

/**
 * Calculate cost metrics from Bedrock costs CSV
 */
function calculateCostMetrics(week, totalTokens, storyPoints, featurePRs, totalLOC) {
  const { getCostsForWeek } = require('./bedrockCostParser');
  const costs = getCostsForWeek(week);

  // If no cost data available, return nulls
  if (!costs.claudeCost) {
    return {
      totalCost: null,
      costPerLOC: null,
      costPerPR: null,
      costPerSP: null
    };
  }

  // Calculate derived metrics
  const costPerLOC = totalLOC > 0 ? parseFloat((costs.claudeCost / totalLOC).toFixed(4)) : null;
  const costPerPR = featurePRs > 0 ? parseFloat((costs.claudeCost / featurePRs).toFixed(2)) : null;
  const costPerSP = storyPoints > 0 ? parseFloat((costs.claudeCost / storyPoints).toFixed(2)) : null;

  return {
    totalCost: costs.claudeCost,
    costPerLOC: costPerLOC,
    costPerPR: costPerPR,
    costPerSP: costPerSP
  };
}

module.exports = {
  calculateTokensPerSPForWeek,
  calculateCostMetrics,
  buildTicketToPRMapping
};
