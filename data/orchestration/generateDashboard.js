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

  // Initialize metrics object for this week
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

    // Current metrics are directly in the metrics object

    // Story points completed (from JIRA - based on PRs merged this week)
    console.log(`  Fetching story points from JIRA...`);
    try {
      // Get tickets from PRs merged this week (prData should have this)
      const prTickets = metrics.prTickets || []; // We need to add this to prAnalysis
      const jiraData = getStoryPointsCompletedForWeek(week, prTickets);
      const jiraMetrics = {
        storyPoints: jiraData && jiraData.storyPoints > 0 ? jiraData.storyPoints : 0,
        wipSP: null  // Optional field
      };
      Object.assign(metrics, jiraMetrics);

      if (jiraMetrics.storyPoints > 0) {
        console.log(`    ✓ Story Points: ${jiraMetrics.storyPoints} (${jiraData.issues.length} issues completed)`);
      } else {
        console.log(`    ⚠ No story points completed this week`);
      }
    } catch (err) {
      console.log(`    ⚠ JIRA fetch: ${err.message}`);
      Object.assign(metrics, { storyPoints: 0, wipSP: null });
    }

    // Tokens per story point (transcript-based)
    console.log(`  Calculating tokens per story point...`);
    try {
      const tokenSPData = await calculateTokensPerSPForWeek(week);

      // Add tokensPerSP, totalTokens, and ticketDetails directly to metrics
      // (These aren't part of a specific schema, they're cross-cutting)
      metrics.tokensPerSP = tokenSPData.tokensPerSP;
      metrics.totalTokens = tokenSPData.totalTokens;
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

      const costMetrics = {
        totalCost: costData.totalCost || 0,
        claudeCost: costData.totalCost || 0,  // Assuming all costs are Claude for now
        costPerLOC: costData.costPerLOC,
        costPerPR: costData.costPerPR,
        costPerSP: costData.costPerSP
      };
      Object.assign(metrics, costMetrics);

      if (costData.totalCost) {
        console.log(`    ✓ Total Cost: $${costData.totalCost.toFixed(2)}, Cost/SP: $${costData.costPerSP || 'N/A'}`);
      } else {
        console.log(`    ⚠ No cost data available for this week`);
      }
    } catch (err) {
      console.log(`    ⚠ Cost calculation: ${err.message}`);
      Object.assign(metrics, {
        totalCost: 0,
        claudeCost: 0,
        costPerLOC: null,
        costPerPR: null,
        costPerSP: null
      });
    }

    // Quality metrics (SonarCloud) - hardcoded for Weeks 1-8, per-PR averages for Week 9+
    console.log(`  Fetching quality metrics...`);

    // Hardcoded historical SonarCloud metrics (per-PR averages from old weekly_metrics_plot.js)
    const hardcodedQualityMetrics = {
      'Week 1': { testCoverage: null, cves: null, duplicatedLines: null, maintainability: null, reliability: null, security: null, codeSmells: null },
      'Week 2': { testCoverage: null, cves: null, duplicatedLines: null, maintainability: null, reliability: null, security: null, codeSmells: null },
      'Week 3': { testCoverage: 79.86, cves: 0, duplicatedLines: 0, maintainability: 1, reliability: 1, security: 1, codeSmells: 5.2 },
      'Week 4': { testCoverage: 85.23, cves: 0, duplicatedLines: 0, maintainability: 1, reliability: 1, security: 1, codeSmells: 2.2 },
      'Week 5': { testCoverage: 89.77, cves: 0, duplicatedLines: 0, maintainability: 1, reliability: 1, security: 1, codeSmells: 3.25 },
      'Week 6': { testCoverage: 87.5, cves: 0, duplicatedLines: 0, maintainability: 1, reliability: 1, security: 1, codeSmells: 2 },
      'Week 7': { testCoverage: 92.13, cves: 0, duplicatedLines: 0.23, maintainability: 1, reliability: 1, security: 1, codeSmells: 5.33 },
      'Week 8': { testCoverage: 89.83, cves: 0, duplicatedLines: 0.83, maintainability: 1, reliability: 1, security: 1, codeSmells: 5.25 }
    };

    try {
      let qualityMetrics;
      // Use hardcoded values for Weeks 1-8 (per-PR averages from old system)
      if (hardcodedQualityMetrics[week.name]) {
        qualityMetrics = hardcodedQualityMetrics[week.name];

        if (qualityMetrics.testCoverage !== null) {
          console.log(`    ✓ Coverage: ${qualityMetrics.testCoverage?.toFixed(1)}%, CVEs: ${qualityMetrics.cves} (hardcoded)`);
        } else {
          console.log(`    ⚠ No quality metrics available (hardcoded)`);
        }
      } else {
        // For Week 9 and beyond, use per-PR averages already calculated in analyzePRsForWeek()
        // Extract quality metrics from prData (already in metrics)
        qualityMetrics = {
          testCoverage: metrics.testCoverage || null,
          cves: metrics.cves || null,
          duplicatedLines: metrics.duplicatedLines || null,
          maintainability: metrics.maintainability || null,
          reliability: metrics.reliability || null,
          security: metrics.security || null,
          codeSmells: metrics.codeSmells || null
        };

        if (qualityMetrics.testCoverage !== null) {
          console.log(`    ✓ Coverage: ${qualityMetrics.testCoverage?.toFixed(1)}%, Code Smells: ${qualityMetrics.codeSmells?.toFixed(1)} (per-PR avg)`);
        } else {
          console.log(`    ⚠ No quality metrics available`);
        }
      }

      Object.assign(metrics, qualityMetrics);
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

// Auto-generate weeklyData.json
console.log('Generating data/weeklyData.json...');
try {
  const outputPath = buildWeeklyData(weeklyMetrics);
  console.log(`✓ Successfully generated: ${outputPath}`);
} catch (err) {
  console.error(`✗ Error generating weeklyData.json: ${err.message}`);
  process.exit(1);
}

console.log();
console.log('='.repeat(80));
console.log('DONE!');
console.log('='.repeat(80));
console.log();
console.log('Next steps:');
console.log('  1. Review data/weeklyData.json to verify metrics');
console.log('  2. Run: node weekly_metrics_report.js to generate PDF');
}

// Run the async process
processWeeks().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
