#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('='.repeat(80));
console.log('MERGING ALL METRICS');
console.log('='.repeat(80));
console.log();

// Read all category JSONs
console.log('Reading category JSON files...');
const github = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/github.json'), 'utf8'));
const sonar = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/sonar.json'), 'utf8'));
const transcript = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/transcript.json'), 'utf8'));
const jira = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/jira.json'), 'utf8'));
const cost = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/cost.json'), 'utf8'));

// Merge by week
console.log('Merging metrics by week...');
const merged = github.weeks.map((githubWeek, index) => {
  // Strip pipeline-only fields that shouldn't appear in the final output
  const { prTickets, prDates, ...githubFields } = githubWeek;

  const week = {
    ...githubFields,
    ...sonar.weeks[index],
    ...transcript.weeks[index],
    ...jira.weeks[index],
    ...cost.weeks[index]
  };

  // Calculate cross-category derived metrics
  // Cost per LOC
  if (week.totalCost && week.locPerDev && week.locPerDev > 0) {
    week.costPerLOC = week.totalCost / week.locPerDev;
  }

  // Cost per PR (rounded to 2dp to match original)
  if (week.totalCost && week.featurePRs && week.featurePRs > 0) {
    week.costPerPR = Math.round((week.totalCost / week.featurePRs) * 100) / 100;
  }

  // Cost per Story Point
  if (week.totalCost && week.storyPoints && week.storyPoints > 0) {
    week.costPerSP = week.totalCost / week.storyPoints;
  }

  // Tokens per Story Point
  if (week.totalTokens && week.storyPoints && week.storyPoints > 0) {
    week.tokensPerSP = week.totalTokens / week.storyPoints;
  }

  // Tokens per Cycle Time (Tokens per Day)
  if (week.tokensPerSP && week.cycleTime && week.cycleTime > 0) {
    week.tokensPerCycleTime = week.tokensPerSP / week.cycleTime;
  }

  // LOC per Token (per 10,000 tokens for readability)
  if (week.locPerDev && week.totalTokens && week.totalTokens > 0) {
    week.locPerToken = week.locPerDev / week.totalTokens;
  }

  return week;
});

// Calculate statistics on derived metrics
console.log('Calculating cross-category derived metrics...');
const derivedMetricsCount = merged.reduce((acc, week) => {
  if (week.costPerSP) acc.costPerSP++;
  if (week.tokensPerSP) acc.tokensPerSP++;
  if (week.costPerLOC) acc.costPerLOC++;
  if (week.costPerPR) acc.costPerPR++;
  if (week.tokensPerCycleTime) acc.tokensPerCycleTime++;
  if (week.locPerToken) acc.locPerToken++;
  return acc;
}, { costPerSP: 0, tokensPerSP: 0, costPerLOC: 0, costPerPR: 0, tokensPerCycleTime: 0, locPerToken: 0 });

// Add labels and validWeeks
const outputData = {
  weeklyData: merged,
  labels: merged.map(d => d.period),
  validWeeks: merged.filter(d => d.featurePRs && d.featurePRs > 0)
};

// Write final merged JSON
const outputPath = path.join(__dirname, '../data/weeklyData.json');
fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));

console.log();
console.log(`✓ Merged all metrics into data/weeklyData.json`);
console.log(`  Total weeks: ${merged.length}`);
console.log(`  Valid weeks (with PRs): ${outputData.validWeeks.length}`);
console.log(`  Derived metrics calculated:`);
console.log(`    - Cost per SP: ${derivedMetricsCount.costPerSP} weeks`);
console.log(`    - Tokens per SP: ${derivedMetricsCount.tokensPerSP} weeks`);
console.log(`    - Cost per LOC: ${derivedMetricsCount.costPerLOC} weeks`);
console.log(`    - Cost per PR: ${derivedMetricsCount.costPerPR} weeks`);
console.log(`    - Tokens per Cycle Time: ${derivedMetricsCount.tokensPerCycleTime} weeks`);
console.log(`    - LOC per Token: ${derivedMetricsCount.locPerToken} weeks`);
console.log('='.repeat(80));
