#!/usr/bin/env node

const path = require('path');
const { weeklyData, labels } = require('./data/weeklyData');
const { makeLineChart, makeStackedBar, makeTokensPerSPWithStdDev, makeNKTLogScatter, makeInterruptionRateChart } = require('./charts/chartFactory');
const { createDoc, drawSectionHeader, addChartsGrid } = require('./pdf/layoutBuilder');

// Filter out Week 1-3 from transcript-related metrics (incomplete transcript data)
const TRANSCRIPT_EXCLUDE_WEEKS = ['Week 1', 'Week 2', 'Week 3'];
// Filter out Week 11-13 from all metrics (w/c 15th, 22nd, 29th December onwards)
const DECEMBER_EXCLUDE_WEEKS = ['Week 11', 'Week 12', 'Week 13'];

// Create filtered labels array (only weeks 1-10)
const filteredLabels = labels.slice(0, 10);

function filterTranscriptData(data) {
  return data.slice(0, 10).map((value, index) => {
    const week = weeklyData[index];
    return TRANSCRIPT_EXCLUDE_WEEKS.includes(week.week) ? null : value;
  });
}

function filterDecemberData(data) {
  return data.slice(0, 10);
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

// Filter weeklyData for prompt categories (exclude Week 1-3 and 11-13)
const filteredWeeklyDataForPrompts = weeklyData.slice(0, 10).map((week, index) => {
  if (TRANSCRIPT_EXCLUDE_WEEKS.includes(week.week)) {
    return { ...week, promptCategories: {} }; // Empty categories for excluded weeks
  }
  return week;
});

const promptCategories = makePromptCategoryChart(filteredLabels, filteredWeeklyDataForPrompts);

// Tokens per SP bar chart with mean ± std dev (no December filtering per user request)
const tokensPerSPScatter = makeTokensPerSPWithStdDev(weeklyData);

// Filter weeklyData for December exclusion (only include weeks 1-10)
const filteredWeeklyDataForDecember = weeklyData.slice(0, 10);

// NK/T log scatter chart (exclude December weeks)
const nktLogScatter = makeNKTLogScatter(filteredWeeklyDataForDecember);

// Interruption rate chart (exclude December weeks)
const interruptionRateChart = makeInterruptionRateChart(filteredLabels, filteredWeeklyDataForDecember);

// Load PIP repos comparison data
const pipMetrics = require('./data/comparisons/pip-metrics-output.json');

// Extract week-by-week data from PIP repos (convert null to 0)
const pipCodeSmellsPerWeek = pipMetrics.map(w => w.avgCodeSmellsPerPR !== null ? w.avgCodeSmellsPerPR : 0);
const pipDuplicatedLinesPerWeek = pipMetrics.map(w => w.avgDuplicatedLinesPerPR !== null ? w.avgDuplicatedLinesPerPR : 0);
const pipPRsPerWeek = pipMetrics.map(w => w.totalPRs);

// Grouped chart definitions
const efficiencyCharts = [
  {
    label: 'Tokens per Story Point',
    buffer: makeLineChart(filteredLabels, filterTranscriptData(weeklyData.map(d => d.tokensPerSP)), { title: 'Tokens per Story Points', yLabel: 'Tokens per SPs', datasetLabel: 'Tokens/SP' })
  },
  {
    label: 'LOC per Token',
    buffer: makeLineChart(filteredLabels, filterTranscriptData(weeklyData.map(d => 10000 * d.locPerToken)), { title: 'LOC per 10,0000 Tokens', yLabel: 'Lines of Code per 10K Tokens', datasetLabel: 'LOC/10000Token' })
  },
  {
    label: 'LOC per Merged PR',
    buffer: makeLineChart(filteredLabels, filterDecemberData(weeklyData.map(d => d.locPerPR)), { title: 'LOC per Merged PR', yLabel: 'LOC per Merged PR', datasetLabel: 'LOC/PR' })
  },
  {
    label: 'LOC per Developer',
    buffer: makeLineChart(
      filteredLabels,
      filterDecemberData(weeklyData.map(d => d.locPerDev)),
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
    buffer: makeLineChart(filteredLabels, filterTranscriptData(weeklyData.map(d => d.tokensPerCycleTime)), { title: 'Tokens per Time to Pass PR', yLabel: 'Tokens Per Day', datasetLabel: 'Tokens/Day' })
  },
  {
    label: 'Cost per LoC',
    buffer: makeLineChart(filteredLabels, filterDecemberData(weeklyData.map(d => d.costPerLOC * 0.750)), { title: 'Cost per LOC', yLabel: 'Cost per LOC (£)', datasetLabel: 'Cost/LOC' })
  },
  {
    label: 'Cost per PR',
    buffer: makeLineChart(filteredLabels, filterDecemberData(weeklyData.map(d => d.costPerPR * 0.750)), { title: 'Cost per PR', yLabel: 'Cost per PR (£)', datasetLabel: 'Cost/PR' })
  },
  {
    label: 'Cost per Story Point',
    buffer: makeLineChart(filteredLabels, filterDecemberData(weeklyData.map(d => d.costPerSP * 0.750)), { title: 'Cost per Story Point', yLabel: 'Cost per SP (£)', datasetLabel: 'Cost/SP' })
  },
];

const efficiencyCharts2 = [
  {
    label: 'Story Point Velocity',
    buffer: makeLineChart(filteredLabels, filterDecemberData(weeklyData.map(d => d.storyPoints)), { title: 'Story Point Velocity', yLabel: 'Story Points', datasetLabel: 'Story Point Velocity' })
  },
  {
    label: 'Number of PRs',
    buffer: makeLineChart(
      filteredLabels,
      filterDecemberData(weeklyData.map(d => d.featurePRs)),
      {
        title: 'Number of PRs',
        yLabel: 'PRs',
        datasetLabel: 'Number of PRs',
        comparisonData: pipPRsPerWeek,
        comparisonLabel: 'Original CaTH Service'
      }
    )
  },
  {
    label: 'Tokens per SP (by Ticket)',
    buffer: tokensPerSPScatter
  },
  {
    label: 'NK vs T',
    buffer: nktLogScatter
  },
];

const qualityCharts = [
  {
    label: 'Test Coverage',
    buffer: makeLineChart(filteredLabels, filterDecemberData(weeklyData.map(d => d.testCoverage)), { title: 'Test Coverage', yLabel: 'Test Coverage (%)', datasetLabel: 'Test Coverage (%)' })
  },
  {
    label: 'CVEs',
    buffer: makeLineChart(filteredLabels, filterDecemberData(weeklyData.map(d => d.cves)), { title: 'CVEs', yLabel: 'CVEs', datasetLabel: 'CVEs' })
  },
  {
    label: 'Duplicated Lines',
    buffer: makeLineChart(
      filteredLabels,
      filterDecemberData(weeklyData.map(d => d.duplicatedLines)),
      {
        title: 'Duplicated Lines',
        yLabel: 'Duplicated Lines (%)',
        datasetLabel: 'Duplicated Lines (%)',
        comparisonData: pipDuplicatedLinesPerWeek,
        comparisonLabel: 'Original CaTH Service'
      }
    )
  },
  {
    label: 'Maintainability',
    buffer: makeLineChart(filteredLabels, filterDecemberData(weeklyData.map(d => d.maintainability)), { title: 'Maintainability Rating', yLabel: 'Rating (1=A,5=E)', datasetLabel: 'Maintainability' })
  },
  {
    label: 'Reliability',
    buffer: makeLineChart(filteredLabels, filterDecemberData(weeklyData.map(d => d.reliability)), { title: 'Reliability Rating', yLabel: 'Rating (1=A,5=E)', datasetLabel: 'Reliability' })
  },
  {
    label: 'Security',
    buffer: makeLineChart(filteredLabels, filterDecemberData(weeklyData.map(d => d.security)), { title: 'Security Rating', yLabel: 'Rating (1=A,5=E)', datasetLabel: 'Security' })
  },
  {
    label: 'Code Smells',
    buffer: makeLineChart(
      filteredLabels,
      filterDecemberData(weeklyData.map(d => d.codeSmells)),
      {
        title: 'Code Smells',
        yLabel: 'Code Smells',
        datasetLabel: 'Code Smells',
        comparisonData: pipCodeSmellsPerWeek,
        comparisonLabel: 'Original CaTH Service'
      }
    )
  },
];

const satisfactionCharts = [
  {
    label: 'Comments per PR',
    buffer: makeLineChart(filteredLabels, filterDecemberData(weeklyData.map(d => d.commentsPerPR)), { title: 'Comments per PR', yLabel: 'Comments per PR', datasetLabel: 'Comments/PR' })
  },
];

const adoptionCharts = [
  {
    label: 'Interruption Rate',
    buffer: interruptionRateChart
  },
  {
    label: 'Token Type Breakdown',
    buffer: makeStackedBar(filteredLabels, [
      {
        label: 'Input',
        data: filterTranscriptData(weeklyData.map(d => d.inputTokens)),
        backgroundColor: '#4472C4'
      },
      {
        label: 'Cache Creation',
        data: filterTranscriptData(weeklyData.map(d => d.cacheCreationTokens)),
        backgroundColor: '#ED7D31'
      },
      {
        label: 'Cache Read',
        data: filterTranscriptData(weeklyData.map(d => d.cacheReadTokens)),
        backgroundColor: '#70AD47'
      },
      {
        label: 'Output',
        data: filterTranscriptData(weeklyData.map(d => d.outputTokens)),
        backgroundColor: '#FFC000'
      }
    ], { title: 'Token Type Breakdown by Week', yLabel: 'Tokens' })
  },
  {
    label: 'Time to Context Window',
    buffer: makeLineChart(filteredLabels, filterTranscriptData(weeklyData.map(d => d.timeToContextWindow)), { title: 'Time to Hit Context Window', yLabel: 'Minutes', datasetLabel: 'Minutes' })
  },
  {
    label: 'Compactions',
    buffer: makeStackedBar(filteredLabels, [
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
