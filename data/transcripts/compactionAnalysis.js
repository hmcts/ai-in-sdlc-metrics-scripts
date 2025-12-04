#!/usr/bin/env node

const CONFIG = require('../config');
const { analyzeCompactionsForWeek } = require('./utils/compactionUtils');

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
console.log('COMPACTION ANALYSIS FROM TRANSCRIPTS');
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
      const result = analyzeCompactionsForWeek(week);

      console.log(`  Manual Compactions: ${result.manualCompactions}`);
      console.log(`  Automatic Compactions: ${result.autoCompactions}`);
      console.log(`  Total: ${result.manualCompactions + result.autoCompactions}`);
      console.log(`  Avg Time to Context Window: ${result.avgTimeToContextWindow !== null ? result.avgTimeToContextWindow.toFixed(2) + ' minutes' : 'N/A'}`);
      console.log();
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      console.log();
    }
  });

  console.log('='.repeat(80));
} catch (err) {
  console.error('Error analyzing compactions:', err.message);
  process.exit(1);
}
