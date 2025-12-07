#!/usr/bin/env node

const path = require('path');
const { weeklyData, labels } = require('./data/weeklyData');
const { makeLineChart, makeStackedBar, makeTokensPerSPScatter, makeNKTLogScatter } = require('./charts/chartFactory');
const { createDoc, drawSectionHeader, addChartsGrid } = require('./pdf/layoutBuilder');

// Filter out Week 1-3 from transcript-related metrics (incomplete transcript data)
const TRANSCRIPT_EXCLUDE_WEEKS = ['Week 1', 'Week 2', 'Week 3'];

function filterTranscriptData(data) {
  return data.map((value, index) => {
    const week = weeklyData[index];
    return TRANSCRIPT_EXCLUDE_WEEKS.includes(week.week) ? null : value;
  });
}

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

// Filter weeklyData for prompt categories (exclude Week 3)
const filteredWeeklyDataForPrompts = weeklyData.map((week, index) => {
  if (TRANSCRIPT_EXCLUDE_WEEKS.includes(week.week)) {
    return { ...week, promptCategories: {} }; // Empty categories for excluded weeks
  }
  return week;
});

const promptCategories = makePromptCategoryChart(labels, filteredWeeklyDataForPrompts);

// Tokens per SP scatter chart (only weeks with transcript data)
const tokensPerSPScatter = makeTokensPerSPScatter(weeklyData);

// NK/T log scatter chart
const nktLogScatter = makeNKTLogScatter(weeklyData);

// Grouped chart definitions
const efficiencyCharts = [
  {
    label: 'Tokens per Story Point',
    buffer: makeLineChart(labels, filterTranscriptData(weeklyData.map(d => d.tokensPerSP)), { title: 'Tokens per Story Points', yLabel: 'Tokens per SPs', datasetLabel: 'Tokens/SP' })
  },
  {
    label: 'LOC per Token',
    buffer: makeLineChart(labels, filterTranscriptData(weeklyData.map(d => 10000 * d.locPerToken)), { title: 'LOC per 10,0000 Tokens', yLabel: 'Lines of Code per 10K Tokens', datasetLabel: 'LOC/10000Token' })
  },
  {
    label: 'LOC per Merged PR',
    buffer: makeLineChart(labels, weeklyData.map(d => d.locPerPR), { title: 'LOC per Merged PR', yLabel: 'LOC per Merged PR', datasetLabel: 'LOC/PR' })
  },
  {
    label: 'LOC per Developer',
    buffer: makeLineChart(
      labels,
      weeklyData.map(d => d.locPerDev),
      {
        title: 'LOC per Dev',
        yLabel: 'LOC per Dev',
        datasetLabel: 'LOC per Dev',
        horizontalLines: [
          { value: 622, label: 'Pre-agentic CaTH', color: '#7f2c2cff' },
          { value: 345, label: 'HMCTS Standard', color: '#256525ff' },
          { value: 2280, label: 'Agentic Industry Standard', color: '#303094ff' }
        ]
      }
    )
  },
  {
    label: 'Tokens per Time to Pass PR',
    buffer: makeLineChart(labels, filterTranscriptData(weeklyData.map(d => d.tokensPerCycleTime)), { title: 'Tokens per Time to Pass PR', yLabel: 'Tokens Per Day', datasetLabel: 'Tokens/Day' })
  },
  {
    label: 'Cost per LoC',
    buffer: makeLineChart(labels, weeklyData.map(d => d.costPerLOC * 0.750), { title: 'Cost per LOC', yLabel: 'Cost per LOC (£)', datasetLabel: 'Cost/LOC' })
  },
  {
    label: 'Cost per PR',
    buffer: makeLineChart(labels, weeklyData.map(d => d.costPerPR * 0.750), { title: 'Cost per PR', yLabel: 'Cost per PR (£)', datasetLabel: 'Cost/PR' })
  },
  {
    label: 'Cost per Story Point',
    buffer: makeLineChart(labels, weeklyData.map(d => d.costPerSP * 0.750), { title: 'Cost per Story Point', yLabel: 'Cost per SP (£)', datasetLabel: 'Cost/SP' })
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
  {
    label: 'Tokens per SP (by Ticket)',
    buffer: tokensPerSPScatter
  },
  {
    label: 'log(NK) vs log(T)',
    buffer: nktLogScatter
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
    buffer: makeLineChart(labels, filterTranscriptData(weeklyData.map(d => d.timeToContextWindow)), { title: 'Time to Hit Context Window', yLabel: 'Minutes', datasetLabel: 'Minutes' })
  },
  {
    label: 'Compactions',
    buffer: makeStackedBar(labels, [
      {
        label: 'Auto Compactions',
        data: filterTranscriptData(weeklyData.map(d => d.autoCompactions)),
        backgroundColor: '#4472C4'
      },
      {
        label: 'Manual Compactions',
        data: filterTranscriptData(weeklyData.map(d => d.manualCompactions)),
        backgroundColor: '#ED7D31'
      }
    ], { title: 'Context Window Compactions', yLabel: 'Count' })
  },
  {
    label: 'Prompt Categories',
    buffer: promptCategories,
  },
];

const { doc, stream } = createDoc(pdfOutputPath);

// Title Page
doc.addPage();
doc.fontSize(24).fillColor('#182549').text('Weekly Metrics Report', { align: 'center', valign: 'center' });
doc.moveDown();
doc.fontSize(16).fillColor('black').text(`Generated on ${new Date().toLocaleDateString()}`, { align: 'center' });

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
