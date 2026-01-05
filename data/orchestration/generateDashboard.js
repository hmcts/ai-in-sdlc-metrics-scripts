#!/usr/bin/env node

const CONFIG = require('../config');
const { analyzeCompactionsForWeek } = require('../transcripts/utils/compactionUtils');
const { analyzePromptCategoriesForWeek } = require('../transcripts/utils/categoryUtils');
const { calculateInterruptionsForWeek } = require('../transcripts/utils/interruptionMetrics');
const { fetchSonarMetricsForWeek } = require('../quality/utils/sonarUtils');
const { analyzePRsForWeek } = require('../github/utils/prAnalysis');
const { calculateNKTForWeek } = require('../github/utils/nktMetrics');
const { calculateTokensPerSPForWeek, calculateCostMetrics } = require('../analytics/utils/tokensPerSP');
const { getStoryPointsCompletedForWeek } = require('../jira/utils/jiraApi');
const { buildWeeklyData } = require('./utils/weeklyDataBuilder');
const { calculateTokenBreakdownForWeek } = require('../costForecasting/tokenBreakdownUtils');

console.log('='.repeat(80));
console.log('GENERATING DASHBOARD DATA');
console.log('='.repeat(80));
console.log();

const weeklyMetrics = [];

// Process each week
async function processWeeks() {
for (const week of CONFIG.WEEKS) {
  console.log(`Processing ${week.name} (${week.period})...`);

  const metrics = {
    week: week.name,
    period: week.period
  };

  try {
    // Transcript metrics
    console.log(`  Analyzing transcripts...`);
    try {
      const compactions = analyzeCompactionsForWeek(week);
      Object.assign(metrics, compactions);
      console.log(`    ✓ Compactions: ${compactions.manualCompactions} manual, ${compactions.autoCompactions} auto`);
    } catch (err) {
      console.log(`    ⚠ Compactions: ${err.message}`);
    }

    try {
      const categories = analyzePromptCategoriesForWeek(week);
      Object.assign(metrics, categories);
      console.log(`    ✓ Prompts: ${categories.totalPrompts} total, top: ${categories.topCategory}`);
    } catch (err) {
      console.log(`    ⚠ Prompt categories: ${err.message}`);
    }

    try {
      const interruptions = await calculateInterruptionsForWeek(week, CONFIG.TRANSCRIPTS_DIR);
      Object.assign(metrics, interruptions);
      console.log(`    ✓ Interruptions: ${interruptions.interruptions}/${interruptions.prompts} prompts (${interruptions.interruptionRate}%), Errors: ${interruptions.toolErrors}/${interruptions.toolUses} (${interruptions.errorRate}%)`);
    } catch (err) {
      console.log(`    ⚠ Interruptions: ${err.message}`);
    }

    try {
      const tokenBreakdown = await calculateTokenBreakdownForWeek(week);
      Object.assign(metrics, tokenBreakdown);
      if (tokenBreakdown.totalTokensBreakdown) {
        console.log(`    ✓ Token breakdown: ${tokenBreakdown.totalTokensBreakdown.toLocaleString()} total (Input: ${tokenBreakdown.inputTokens.toLocaleString()}, Cache Read: ${tokenBreakdown.cacheReadTokens.toLocaleString()})`);
      }
    } catch (err) {
      console.log(`    ⚠ Token breakdown: ${err.message}`);
    }

    // GitHub/PR metrics
    console.log(`  Analyzing GitHub PRs...`);
    try {
      const prData = analyzePRsForWeek(week);
      Object.assign(metrics, prData);
      console.log(`    ✓ PRs: ${prData.featurePRs}, LOC/PR: ${prData.locPerPR}, LOC/Dev: ${prData.locPerDev}`);
    } catch (err) {
      console.log(`    ⚠ PR analysis: ${err.message}`);
    }

    // NK/T metrics
    console.log(`  Calculating NK/T metrics...`);
    try {
      const nktData = calculateNKTForWeek(week);
      Object.assign(metrics, nktData);
      console.log(`    ✓ NK/T: ${nktData.nkt}, Cycle Time: ${nktData.cycleTime} days`);
    } catch (err) {
      console.log(`    ⚠ NK/T calculation: ${err.message}`);
    }

    // Story points completed (from JIRA - based on PRs merged this week)
    console.log(`  Fetching story points from JIRA...`);
    try {
      // Get tickets from PRs merged this week (prData should have this)
      const prTickets = metrics.prTickets || []; // We need to add this to prAnalysis
      const jiraData = getStoryPointsCompletedForWeek(week, prTickets);
      if (jiraData && jiraData.storyPoints > 0) {
        metrics.storyPoints = jiraData.storyPoints;
        console.log(`    ✓ Story Points: ${jiraData.storyPoints} (${jiraData.issues.length} issues completed)`);
      } else {
        metrics.storyPoints = null;
        console.log(`    ⚠ No story points completed this week`);
      }
    } catch (err) {
      console.log(`    ⚠ JIRA fetch: ${err.message}`);
      metrics.storyPoints = null;
    }

    // Tokens per story point (transcript-based)
    console.log(`  Calculating tokens per story point...`);
    try {
      const tokenSPData = await calculateTokensPerSPForWeek(week);

      // Use tokens and tokensPerSP from transcript data, but NOT storyPoints (we got that from JIRA above)
      metrics.tokensPerSP = tokenSPData.tokensPerSP;
      metrics.totalTokens = tokenSPData.totalTokens;

      // Save ticket-level details for scatter plots and detailed analysis
      metrics.ticketDetails = tokenSPData.ticketDetails || {};

      // Calculate derived metrics (tokens per LOC, LOC per token, etc.)
      if (tokenSPData.totalTokens && metrics.featurePRs && metrics.locPerPR) {
        const totalLOC = metrics.featurePRs * metrics.locPerPR;
        metrics.locPerToken = parseFloat((totalLOC / tokenSPData.totalTokens).toFixed(8));
        metrics.tokensPerCycleTime = metrics.cycleTime
          ? Math.round(tokenSPData.totalTokens / metrics.cycleTime)
          : undefined;
      }

      if (tokenSPData.tokensPerSP) {
        console.log(`    ✓ Tokens/SP: ${tokenSPData.tokensPerSP.toLocaleString()}`);
      } else {
        console.log(`    ⚠ No token/SP data available`);
      }
    } catch (err) {
      console.log(`    ⚠ Tokens/SP calculation: ${err.message}`);
      metrics.ticketDetails = {};
    }

    // Cost metrics (from Bedrock costs CSV)
    console.log(`  Calculating cost metrics...`);
    try {
      const totalLOC = metrics.featurePRs && metrics.locPerPR ? metrics.featurePRs * metrics.locPerPR : 0;
      const costData = calculateCostMetrics(week, metrics.totalTokens, metrics.storyPoints, metrics.featurePRs, totalLOC);

      metrics.totalCost = costData.totalCost;
      metrics.costPerLOC = costData.costPerLOC;
      metrics.costPerPR = costData.costPerPR;
      metrics.costPerSP = costData.costPerSP;

      if (costData.totalCost) {
        console.log(`    ✓ Total Cost: $${costData.totalCost.toFixed(2)}, Cost/SP: $${costData.costPerSP || 'N/A'}`);
      } else {
        console.log(`    ⚠ No cost data available for this week`);
      }
    } catch (err) {
      console.log(`    ⚠ Cost calculation: ${err.message}`);
      metrics.totalCost = null;
      metrics.costPerLOC = null;
      metrics.costPerPR = null;
      metrics.costPerSP = null;
    }

    // Quality metrics (SonarCloud) - hardcoded for Weeks 1-7, per-PR averages for Week 8+
    console.log(`  Fetching quality metrics...`);

    // Hardcoded historical SonarCloud metrics (per-PR averages from old weekly_metrics_plot.js)
    const hardcodedQualityMetrics = {
      'Week 1': { testCoverage: null, cves: null, duplicatedLines: null, maintainability: null, reliability: null, security: null, codeSmells: null },
      'Week 2': { testCoverage: null, cves: null, duplicatedLines: null, maintainability: null, reliability: null, security: null, codeSmells: null },
      'Week 3': { testCoverage: 79.86, cves: 0, duplicatedLines: 0, maintainability: 1, reliability: 1, security: 1, codeSmells: 5.2 },
      'Week 4': { testCoverage: 85.23, cves: 0, duplicatedLines: 0, maintainability: 1, reliability: 1, security: 1, codeSmells: 2.2 },
      'Week 5': { testCoverage: 89.77, cves: 0, duplicatedLines: 0, maintainability: 1, reliability: 1, security: 1, codeSmells: 3.25 },
      'Week 6': { testCoverage: 87.5, cves: 0, duplicatedLines: 0, maintainability: 1, reliability: 1, security: 1, codeSmells: 2 },
      'Week 7': { testCoverage: 92.13, cves: 0, duplicatedLines: 0.23, maintainability: 1, reliability: 1, security: 1, codeSmells: 5.33 }
    };

    try {
      // Use hardcoded values for Weeks 1-7 (per-PR averages from old system)
      if (hardcodedQualityMetrics[week.name]) {
        const quality = hardcodedQualityMetrics[week.name];
        metrics.testCoverage = quality.testCoverage;
        metrics.cves = quality.cves;
        metrics.duplicatedLines = quality.duplicatedLines;
        metrics.maintainability = quality.maintainability;
        metrics.reliability = quality.reliability;
        metrics.security = quality.security;
        metrics.codeSmells = quality.codeSmells;

        if (quality.testCoverage !== null) {
          console.log(`    ✓ Coverage: ${quality.testCoverage?.toFixed(1)}%, CVEs: ${quality.cves} (hardcoded)`);
        } else {
          console.log(`    ⚠ No quality metrics available (hardcoded)`);
        }
      } else {
        // For Week 8 and beyond, use per-PR averages already calculated in analyzePRsForWeek()
        // These were calculated using aggregateSonarMetrics() in prAnalysis.js
        if (metrics.testCoverage !== null) {
          console.log(`    ✓ Coverage: ${metrics.testCoverage?.toFixed(1)}%, Code Smells: ${metrics.codeSmells?.toFixed(1)} (per-PR avg)`);
        } else {
          console.log(`    ⚠ No quality metrics available`);
        }
      }
    } catch (err) {
      console.log(`    ⚠ Quality metrics: ${err.message}`);
    }

    weeklyMetrics.push(metrics);
    console.log(`  ✓ Collected metrics for ${week.name}`);
  } catch (err) {
    console.error(`  ✗ Error: ${err.message}`);
  }

  console.log();
}

// Auto-generate weeklyData.js
console.log('Generating data/weeklyData.js...');
try {
  const outputPath = buildWeeklyData(weeklyMetrics);
  console.log(`✓ Successfully generated: ${outputPath}`);
} catch (err) {
  console.error(`✗ Error generating weeklyData.js: ${err.message}`);
  process.exit(1);
}

console.log();
console.log('='.repeat(80));
console.log('DONE!');
console.log('='.repeat(80));
console.log();
console.log('Next steps:');
console.log('  1. Review data/weeklyData.js to verify metrics');
console.log('  2. Run: node weekly_metrics_report.js to generate PDF');
}

// Run the async process
processWeeks().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
