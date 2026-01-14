#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const CONFIG = require('../config');
const { analyzePromptCategoriesForWeek } = require('./utils/categoryUtils');

console.log('='.repeat(80));
console.log('UPDATING PROMPT CATEGORIES IN weeklyData.js');
console.log('='.repeat(80));
console.log();

// Read current weeklyData.js
const weeklyDataPath = path.join(__dirname, '../weeklyData.js');
const weeklyDataContent = fs.readFileSync(weeklyDataPath, 'utf8');

// Parse to extract the weeklyData array
const { weeklyData } = require('../weeklyData');

console.log(`Found ${weeklyData.length} weeks in weeklyData.js`);
console.log();

// Update prompt categories for each week
const updatedWeeklyData = weeklyData.map((weekEntry, index) => {
  const week = CONFIG.WEEKS[index];

  if (!week) {
    console.log(`Warning: No config found for index ${index}`);
    return weekEntry;
  }

  console.log(`Updating ${week.name}...`);

  try {
    const result = analyzePromptCategoriesForWeek(week);

    console.log(`  Old: ${weekEntry.totalPrompts} prompts, top: ${weekEntry.topCategory} (${weekEntry.topCategoryCount})`);
    console.log(`  New: ${result.totalPrompts} prompts, top: ${result.topCategory} (${result.topCategoryCount})`);

    return {
      ...weekEntry,
      totalPrompts: result.totalPrompts,
      avgPromptLength: result.avgPromptLength,
      topCategory: result.topCategory,
      topCategoryCount: result.topCategoryCount,
      promptCategories: result.promptCategories
    };
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    return weekEntry;
  }
});

console.log();
console.log('Generating updated weeklyData.js...');

// Generate the file content
const validWeeks = weeklyData.filter(w => w.featurePRs > 0).map(w => w.week);

const fileContent = `const weeklyData = [
${updatedWeeklyData.map(w => `  {
    week: '${w.week}',
    period: '${w.period}',
    featurePRs: ${w.featurePRs},
    locPerPR: ${w.locPerPR},
    locPerDev: ${w.locPerDev},
    locPerToken: ${w.locPerToken},
    commentsPerPR: ${w.commentsPerPR},
    testCoverage: ${w.testCoverage},
    cves: ${w.cves},
    duplicatedLines: ${w.duplicatedLines},
    maintainability: ${w.maintainability},
    reliability: ${w.reliability},
    security: ${w.security},
    codeSmells: ${w.codeSmells},
    nkt: ${w.nkt},
    cycleTime: ${w.cycleTime},
    tokensPerSP: ${w.tokensPerSP},
    tokensPerCycleTime: ${w.tokensPerCycleTime},
    costPerLOC: ${w.costPerLOC},
    costPerPR: ${w.costPerPR},
    costPerSP: ${w.costPerSP},
    storyPoints: ${w.storyPoints},
    wipSP: ${w.wipSP},
    totalCost: ${w.totalCost},
    timeToContextWindow: ${w.timeToContextWindow},
    autoCompactions: ${w.autoCompactions},
    manualCompactions: ${w.manualCompactions},
    totalPrompts: ${w.totalPrompts},
    avgPromptLength: ${w.avgPromptLength},
    topCategory: ${w.topCategory ? `'${w.topCategory}'` : 'null'},
    topCategoryCount: ${w.topCategoryCount},
    topSubcategory: ${w.topSubcategory ? `'${w.topSubcategory}'` : 'null'},
    topSubcategoryCount: ${w.topSubcategoryCount},
    promptCategories: ${JSON.stringify(w.promptCategories)},
    ticketDetails: ${JSON.stringify(w.ticketDetails)},
    interruptions: ${w.interruptions},
    interruptionRate: ${w.interruptionRate},
    interruptionPrompts: ${w.interruptionPrompts},
    toolUses: ${w.toolUses},
    toolErrors: ${w.toolErrors},
    errorRate: ${w.errorRate},
    inputTokens: ${w.inputTokens},
    cacheCreationTokens: ${w.cacheCreationTokens},
    cacheReadTokens: ${w.cacheReadTokens},
    outputTokens: ${w.outputTokens},
    note: '${w.note}'
  }`).join(',\n')}
];

const labels = weeklyData.map(d => d.period);
const validWeeks = ${JSON.stringify(validWeeks)};

module.exports = { weeklyData, labels, validWeeks };
`;

// Write the updated file
fs.writeFileSync(weeklyDataPath, fileContent, 'utf8');

console.log('✓ weeklyData.js updated successfully!');
console.log();
console.log('='.repeat(80));
