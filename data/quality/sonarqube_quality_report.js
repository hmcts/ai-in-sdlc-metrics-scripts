#!/usr/bin/env node

const CONFIG = require('../config');
const { fetchSonarMetricsLatest } = require('./utils/sonarUtils');
const METRICS = [
  'coverage',
  'vulnerabilities',
  'sqale_rating',
  'reliability_rating',
  'security_rating',
  'bugs',
  'code_smells',
  'duplicated_lines_density'
];

const args = process.argv.slice(2);
let branch = 'master';
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--branch' || args[i] === '-b') && args[i + 1]) {
    branch = args[i + 1];
    i++;
  }
}

console.log(`Fetching latest SonarQube metrics for branch: ${branch}`);
try {
  const metrics = fetchSonarMetricsLatest(branch);
  console.log('SonarQube Quality Metrics:');
  METRICS.forEach(metric => {
    console.log(`${metric}: ${metrics[metric] !== undefined && metrics[metric] !== null ? metrics[metric].toFixed(2) : 'N/A'}`);
  });
} catch (err) {
  console.error('Error fetching metrics:', err.message);
}
