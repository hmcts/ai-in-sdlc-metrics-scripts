#!/usr/bin/env node

const path = require('path');
const { weeklyData, labels } = require('./data/weeklyData');
const { makeLineChart, makeStackedBar } = require('./charts/chartFactory');
const { createDoc, drawSectionHeader, addChartsGrid } = require('./pdf/layout');

const args = process.argv.slice(2);
let outputFile = 'weekly_metrics.pdf';
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--output' || args[i] === '-o') && args[i + 1]) {
    outputFile = args[i + 1];
    i++;
  }
}
const pdfOutputPath = path.resolve(__dirname, outputFile);

const { makePromptCategoryChart } = require('./charts/chartFactory');
const promptCategories = makePromptCategoryChart(labels, weeklyData);

// Grouped chart definitions
const efficiencyCharts = [
  {
    label: 'Tokens per Story Point',
    buffer: makeLineChart(labels, weeklyData.map(d => d.tokensPerSP), { title: 'Tokens per Story Points', yLabel: 'Tokens per SPs', datasetLabel: 'Tokens/SP' })
  },
  {
    label: 'LOC per Token',
    buffer: makeLineChart(labels, weeklyData.map(d => 10000 * d.locPerToken), { title: 'LOC per 10,0000 Tokens', yLabel: 'Lines of Code per 10K Tokens', datasetLabel: 'LOC/10000Token' })
  },
  {
    label: 'LOC per Merged PR',
    buffer: makeLineChart(labels, weeklyData.map(d => d.locPerPR), { title: 'LOC per Merged PR', yLabel: 'LOC per Merged PR', datasetLabel: 'LOC/PR' })
  },
  {
    label: 'LOC per Developer',
    buffer: makeLineChart(labels, weeklyData.map(d => d.locPerDev), { title: 'LOC per Dev', yLabel: 'LOC per Dev', datasetLabel: 'LOC per Dev' })
  },
  {
    label: 'Tokens per Time to Pass PR',
    buffer: makeLineChart(labels, weeklyData.map(d => d.tokensPerCycleTime), { title: 'Tokens per Time to Pass PR', yLabel: 'Tokens Per Day', datasetLabel: 'Tokens/Day' })
  },
  {
    label: 'Cost per LoC',
    buffer: makeLineChart(labels, weeklyData.map(d => d.costPerLOC), { title: 'Cost per LOC', yLabel: 'Cost per LOC ($)', datasetLabel: 'Cost/LOC' })
  },
  {
    label: 'Cost per PR',
    buffer: makeLineChart(labels, weeklyData.map(d => d.costPerPR), { title: 'Cost per PR', yLabel: 'Cost per PR ($)', datasetLabel: 'Cost/PR' })
  },
  {
    label: 'Cost per Story Point',
    buffer: makeLineChart(labels, weeklyData.map(d => d.costPerSP), { title: 'Cost per Story Point', yLabel: 'Cost per SP ($)', datasetLabel: 'Cost/SP' })
  },
];

const efficiencyCharts2 = [
  {
    label: 'Story Point Velocity',
    buffer: makeLineChart(labels, weeklyData.map(d => d.storyPoints), { title: 'Story Point Velocity', yLabel: 'Story Points', datasetLabel: 'Story Point Velocity' })
  },
  {
    label: 'Number of PRs',
    buffer: makeLineChart(labels, weeklyData.map(d => d.featurePRs), { title: 'Number of PRs', yLabel: 'PRs', datasetLabel: 'Number of PRs' })
  },
];

const qualityCharts = [
  {
    label: 'Test Coverage',
    buffer: makeLineChart(labels, weeklyData.map(d => d.testCoverage), { title: 'Test Coverage', yLabel: 'Test Coverage (%)', datasetLabel: 'Test Coverage (%)' })
  },
  {
    label: 'CVEs',
    buffer: makeLineChart(labels, weeklyData.map(d => d.cves), { title: 'CVEs', yLabel: 'CVEs', datasetLabel: 'CVEs' })
  },
  {
    label: 'Duplicated Lines',
    buffer: makeLineChart(labels, weeklyData.map(d => d.duplicatedLines), { title: 'Duplicated Lines', yLabel: 'Duplicated Lines (%)', datasetLabel: 'Duplicated Lines (%)' })
  },
  {
    label: 'Maintainability',
    buffer: makeLineChart(labels, weeklyData.map(d => d.maintainability), { title: 'Maintainability Rating', yLabel: 'Rating (1=A,5=E)', datasetLabel: 'Maintainability' })
  },
  {
    label: 'Reliability',
    buffer: makeLineChart(labels, weeklyData.map(d => d.reliability), { title: 'Reliability Rating', yLabel: 'Rating (1=A,5=E)', datasetLabel: 'Reliability' })
  },
  {
    label: 'Security',
    buffer: makeLineChart(labels, weeklyData.map(d => d.security), { title: 'Security Rating', yLabel: 'Rating (1=A,5=E)', datasetLabel: 'Security' })
  },
  {
    label: 'Code Smells',
    buffer: makeLineChart(labels, weeklyData.map(d => d.codeSmells), { title: 'Code Smells', yLabel: 'Code Smells', datasetLabel: 'Code Smells' })
  },
];

const satisfactionCharts = [
  {
    label: 'Comments per PR',
    buffer: makeLineChart(labels, weeklyData.map(d => d.commentsPerPR), { title: 'Comments per PR', yLabel: 'Comments per PR', datasetLabel: 'Comments/PR' })
  },
];

const adoptionCharts = [
  {
    label: 'Time to Context Window',
    buffer: makeLineChart(labels, weeklyData.map(d => d.timeToContextWindow), { title: 'Time to Hit Context Window', yLabel: 'Minutes', datasetLabel: 'Minutes' })
  },
  {
    label: 'Manual Compactions',
    buffer: makeLineChart(labels, weeklyData.map(d => d.manualCompactions), { title: 'Manual Compactions', yLabel: 'Count', datasetLabel: 'Manual Compactions' })
  },
  {
    label: 'Prompt Categories',
    buffer: promptCategories,
  },
];

const { doc, stream } = createDoc(pdfOutputPath);

// Efficiency section
doc.addPage();
drawSectionHeader(doc, 'Efficiency Metrics');
addChartsGrid(doc, efficiencyCharts);
doc.addPage();
addChartsGrid(doc, efficiencyCharts2);

// Satisfaction & trust
doc.addPage();
drawSectionHeader(doc, 'Satisfaction and Trust Metrics');
addChartsGrid(doc, satisfactionCharts);

// Adoption & maturity
doc.addPage();
drawSectionHeader(doc, 'Adoption and Maturity Metric');
addChartsGrid(doc, adoptionCharts);

// Quality
doc.addPage();
drawSectionHeader(doc, 'Quality Metric');
addChartsGrid(doc, qualityCharts);

doc.end();
stream.on('finish', () => {
  console.log(`Weekly metrics PDF generated: ${pdfOutputPath}`);
});
