#!/usr/bin/env node

const CONFIG = require('../config');
const { analyzePromptCategoriesForWeek } = require('./utils/categoryUtils');

// CLI arg parsing
const args = process.argv.slice(2);
let weekName = null;
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--week' || args[i] === '-w') && args[i + 1]) {
    weekName = args[i + 1];
    i++;
  }
}

// Execute and display
console.log('='.repeat(80));
console.log('PROMPT CATEGORY ANALYSIS FROM TRANSCRIPTS');
console.log('='.repeat(80));
console.log();

try {
  const weeks = weekName
    ? CONFIG.WEEKS.filter(w => w.name === weekName)
    : CONFIG.WEEKS;

  if (weeks.length === 0) {
    console.error(`Error: Week "${weekName}" not found in config`);
    process.exit(1);
  }

  weeks.forEach(week => {
    console.log(`${week.name} (${week.period}):`);

    try {
      const result = analyzePromptCategoriesForWeek(week);

      console.log(`  Total Prompts: ${result.totalPrompts}`);
      console.log(`  Avg Prompt Length: ${result.avgPromptLength} characters`);
      console.log(`  Top Category: ${result.topCategory} (${result.topCategoryCount} prompts)`);
      console.log();
      console.log('  Category Breakdown:');

      Object.entries(result.promptCategories)
        .sort((a, b) => b[1].count - a[1].count)
        .forEach(([cat, data]) => {
          console.log(`    ${cat}: ${data.count}`);
        });

      console.log();
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      console.log();
    }
  });

  console.log('='.repeat(80));
} catch (err) {
  console.error('Error analyzing prompt categories:', err.message);
  process.exit(1);
}
