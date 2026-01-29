/**
 * MetricsSchema - JSDoc type definitions for all metric return types
 * Provides clear interfaces for metric collection modules
 */

/**
 * @typedef {Object} CompactionMetrics
 * @property {number} manualCompactions - Manual context window resets
 * @property {number} autoCompactions - Automatic context window compactions
 * @property {number|null} avgTimeToContextWindow - Average minutes to hit context window limit
 */

/**
 * @typedef {Object} CategoryMetrics
 * @property {number} totalPrompts - Total user prompts for the week
 * @property {number} avgPromptLength - Average prompt character length
 * @property {string|null} topCategory - Most common prompt category
 * @property {number} topCategoryCount - Count of prompts in top category
 * @property {string|null} topSubcategory - Most common prompt subcategory
 * @property {number} topSubcategoryCount - Count of prompts in top subcategory
 * @property {Object.<string, Object>} promptCategories - Full category breakdown
 */

/**
 * @typedef {Object} InterruptionMetrics
 * @property {number} interruptions - Total interruptions (user messages during execution)
 * @property {number} interruptionRate - Interruptions per prompt ratio
 * @property {number} prompts - Total prompts used for rate calculation
 * @property {number} toolUses - Total tool use count
 * @property {number} toolErrors - Total tool errors
 * @property {number} errorRate - Errors per tool use ratio
 */

/**
 * @typedef {Object} TokenMetrics
 * @property {number} inputTokens - Input tokens consumed
 * @property {number} cacheCreationTokens - Cache creation tokens
 * @property {number} cacheReadTokens - Cache read tokens
 * @property {number} outputTokens - Output tokens generated
 */

/**
 * @typedef {Object} PRMetrics
 * @property {number} featurePRs - Number of feature pull requests
 * @property {number} locPerPR - Average lines of code per PR
 * @property {number} locPerDev - Average lines of code per developer
 * @property {number} commentsPerPR - Average comments per PR
 * @property {number} totalLOC - Total lines of code for the week
 * @property {Array<Object>} allPRs - Full PR details array
 */

/**
 * @typedef {Object} QualityMetrics
 * @property {number|null} testCoverage - Test coverage percentage
 * @property {number|null} cves - CVE vulnerability count
 * @property {number|null} duplicatedLines - Duplicated lines percentage
 * @property {number|null} maintainability - Maintainability rating (1=A, 5=E)
 * @property {number|null} reliability - Reliability rating (1=A, 5=E)
 * @property {number|null} security - Security rating (1=A, 5=E)
 * @property {number|null} codeSmells - Code smells count
 */

/**
 * @typedef {Object} CostMetrics
 * @property {number} totalCost - Total cost for the week
 * @property {number} claudeCost - Claude-specific cost
 * @property {number|null} costPerLOC - Cost per line of code
 * @property {number|null} costPerPR - Cost per pull request
 * @property {number|null} costPerSP - Cost per story point
 */

/**
 * @typedef {Object} NKTMetrics
 * @property {number|null} nkt - Normalized Knowledge Throughput (NK/T ratio)
 * @property {number|null} cycleTime - Average cycle time in days
 */

/**
 * @typedef {Object} JiraMetrics
 * @property {number} storyPoints - Total story points completed
 * @property {number|null} wipSP - Work in progress story points
 */

/**
 * @typedef {Object} TicketDetails
 * @property {number} prNumber - PR number
 * @property {number} tokens - Total tokens consumed
 * @property {number} storyPoints - Story points for the ticket
 * @property {string} createdAt - PR creation timestamp
 * @property {string} mergedAt - PR merge timestamp
 * @property {string} week - Week name
 */

/**
 * @typedef {Object} WeeklyMetrics
 * Complete weekly metrics object combining all metric categories
 *
 * @property {string} week - Week name (e.g., "Week 1")
 * @property {string} period - Week period display (e.g., "Oct 7-10")
 *
 * Compaction metrics
 * @property {number} manualCompactions
 * @property {number} autoCompactions
 * @property {number|null} avgTimeToContextWindow
 *
 * Category metrics
 * @property {number} totalPrompts
 * @property {number} avgPromptLength
 * @property {string|null} topCategory
 * @property {number} topCategoryCount
 * @property {string|null} topSubcategory
 * @property {number} topSubcategoryCount
 * @property {Object.<string, Object>} promptCategories
 *
 * Interruption metrics
 * @property {number} interruptions
 * @property {number} interruptionRate
 * @property {number} interruptionPrompts
 * @property {number} toolUses
 * @property {number} toolErrors
 * @property {number} errorRate
 *
 * Token metrics
 * @property {number} inputTokens
 * @property {number} cacheCreationTokens
 * @property {number} cacheReadTokens
 * @property {number} outputTokens
 *
 * PR metrics
 * @property {number} featurePRs
 * @property {number} locPerPR
 * @property {number} locPerDev
 * @property {number} commentsPerPR
 * @property {number} totalLOC
 *
 * Quality metrics
 * @property {number|null} testCoverage
 * @property {number|null} cves
 * @property {number|null} duplicatedLines
 * @property {number|null} maintainability
 * @property {number|null} reliability
 * @property {number|null} security
 * @property {number|null} codeSmells
 *
 * Cost metrics
 * @property {number} totalCost
 * @property {number} claudeCost
 * @property {number|null} costPerLOC
 * @property {number|null} costPerPR
 * @property {number|null} costPerSP
 *
 * NK/T metrics
 * @property {number|null} nkt
 * @property {number|null} cycleTime
 *
 * JIRA metrics
 * @property {number} storyPoints
 * @property {number|null} wipSP
 *
 * Derived metrics
 * @property {number|null} tokensPerSP - Tokens per story point
 * @property {number|null} locPerToken - LOC per token
 * @property {number|null} tokensPerCycleTime - Tokens per cycle time day
 *
 * Additional data
 * @property {Object.<string, TicketDetails>} ticketDetails - Ticket-level details
 * @property {string} [note] - Optional note for the week
 */

module.exports = {
  // Type definitions exported for documentation
  // These don't export runtime values, just serve as documentation for IDEs
};
