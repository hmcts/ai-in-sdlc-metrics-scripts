// Auto-generate data/weeklyData.js from collected metrics
const fs = require('fs');
const path = require('path');

function buildWeeklyData(weeklyMetrics) {
  const weeklyDataPath = path.join(__dirname, '../../../data/weeklyData.js');

  // Format data for weeklyData.js
  const dataStr = weeklyMetrics.map(w => `  {
    week: '${w.week}',
    period: '${w.period}',
    featurePRs: ${w.featurePRs !== undefined ? w.featurePRs : 0},
    locPerPR: ${w.locPerPR !== undefined ? w.locPerPR : 'null'},
    locPerDev: ${w.locPerDev !== undefined ? w.locPerDev : 0},
    locPerToken: ${w.locPerToken !== undefined ? w.locPerToken : 'null'},
    commentsPerPR: ${w.commentsPerPR !== undefined && w.commentsPerPR !== null ? w.commentsPerPR.toFixed(2) : 'null'},
    testCoverage: ${w.testCoverage !== undefined ? w.testCoverage : 'null'},
    cves: ${w.cves !== undefined ? w.cves : 'null'},
    duplicatedLines: ${w.duplicatedLines !== undefined ? w.duplicatedLines : 'null'},
    maintainability: ${w.maintainability !== undefined ? w.maintainability : 'null'},
    reliability: ${w.reliability !== undefined ? w.reliability : 'null'},
    security: ${w.security !== undefined ? w.security : 'null'},
    codeSmells: ${w.codeSmells !== undefined ? w.codeSmells : 'null'},
    nkt: ${w.nkt !== undefined ? w.nkt : 'null'},
    cycleTime: ${w.cycleTime !== undefined ? w.cycleTime : 'null'},
    tokensPerSP: ${w.tokensPerSP !== undefined ? w.tokensPerSP : 'null'},
    tokensPerCycleTime: ${w.tokensPerCycleTime !== undefined ? w.tokensPerCycleTime : 'undefined'},
    costPerLOC: ${w.costPerLOC !== undefined ? w.costPerLOC : 'null'},
    costPerPR: ${w.costPerPR !== undefined ? w.costPerPR : 'null'},
    costPerSP: ${w.costPerSP !== undefined ? w.costPerSP : 'null'},
    storyPoints: ${w.storyPoints !== undefined ? w.storyPoints : 'null'},
    wipSP: ${w.wipSP !== undefined ? w.wipSP : 'null'},
    totalCost: ${w.totalCost !== undefined ? w.totalCost : 0},
    timeToContextWindow: ${w.avgTimeToContextWindow !== undefined ? w.avgTimeToContextWindow : 'null'},
    autoCompactions: ${w.autoCompactions !== undefined ? w.autoCompactions : 0},
    manualCompactions: ${w.manualCompactions !== undefined ? w.manualCompactions : 0},
    totalPrompts: ${w.totalPrompts !== undefined ? w.totalPrompts : 0},
    avgPromptLength: ${w.avgPromptLength !== undefined ? w.avgPromptLength : 0},
    topCategory: ${w.topCategory ? `'${w.topCategory}'` : 'null'},
    topCategoryCount: ${w.topCategoryCount !== undefined ? w.topCategoryCount : 0},
    topSubcategory: ${w.topSubcategory ? `'${w.topSubcategory}'` : 'null'},
    topSubcategoryCount: ${w.topSubcategoryCount !== undefined ? w.topSubcategoryCount : 0},
    promptCategories: ${w.promptCategories ? JSON.stringify(w.promptCategories) : 'null'},
    note: '${w.note || ''}'
  }`).join(',\n');

  const content = `const weeklyData = [
${dataStr}
];

const labels = weeklyData.map(d => d.period);
const validWeeks = weeklyData.filter(d => d.featurePRs > 0);

module.exports = { weeklyData, labels, validWeeks };
`;

  fs.writeFileSync(weeklyDataPath, content);
  return weeklyDataPath;
}

module.exports = { buildWeeklyData };
