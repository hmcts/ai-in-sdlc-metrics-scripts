#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('='.repeat(80));
console.log('COLLECTING ALL METRICS');
console.log('='.repeat(80));
console.log();

const scripts = [
  'collect-github-metrics.js',
  'collect-sonar-metrics.js',
  'collect-transcript-metrics.js',
  'collect-jira-metrics.js',
  'collect-cost-metrics.js',
  'merge-all-metrics.js'
];

let completed = 0;
const total = scripts.length;

for (const script of scripts) {
  console.log(`[${completed + 1}/${total}] Running ${script}...`);
  console.log();

  try {
    execSync(`node ${path.join(__dirname, script)}`, { stdio: 'inherit' });
    completed++;
    console.log();
  } catch (error) {
    console.error(`\n✗ ${script} failed:`, error.message);
    console.error('Stopping execution.');
    process.exit(1);
  }
}

console.log('='.repeat(80));
console.log(`✓ ALL METRICS COLLECTED (${completed}/${total} scripts completed)`);
console.log('='.repeat(80));
console.log();
console.log('Next step: Generate PDF with `node weekly_metrics_report.js`');
