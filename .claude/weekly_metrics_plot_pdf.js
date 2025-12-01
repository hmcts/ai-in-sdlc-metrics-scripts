#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { createCanvas } = require('canvas');
const { Chart, registerables } = require('chart.js');

Chart.register(...registerables);

// Parse command line arguments
const args = process.argv.slice(2);
let outputFile = 'weekly_metrics.pdf';

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--output' || args[i] === '-o') && args[i + 1]) {
    outputFile = args[i + 1];
    i++;
  }
}

const weeklyData = [
  {
    week: 'Week 1',
    period: 'Oct 7-10',
    featurePRs: 0,
    locPerPR: null,
    locPerDev: 0,
    locPerToken: null,
    commentsPerPR: 0,
    testCoverage: null,
    cves: null,
    duplicatedLines: null,
    maintainability: null,
    reliability: null,
    security: null,
    codeSmells: null,
    nkt: null,
    cycleTime: null,
    tokensPerSP: null,
    tokensPerCycleTime: undefined,
    costPerLOC: null,
    costPerPR: null,
    costPerSP: null,
    storyPoints: null,
    wipSP: null,
    totalCost: 38.71,
    timeToContextWindow: null,
    autoCompactions: 0,
    manualCompactions: 0,
    totalPrompts: 0,
    avgPromptLength: 0,
    topCategory: null,
    topCategoryCount: 0,
    topSubcategory: null,
    topSubcategoryCount: 0,
    promptCategories: {},
    note: ''
  },
  {
    week: 'Week 2',
    period: 'Oct 13-17',
    featurePRs: 5,
    locPerPR: 2488,
    locPerDev: 6220,
    locPerToken: null,
    commentsPerPR: 2,
    testCoverage: null,
    cves: null,
    duplicatedLines: null,
    maintainability: null,
    reliability: null,
    security: null,
    codeSmells: null,
    nkt: 51.92,
    cycleTime: 0.43,
    tokensPerSP: null,
    tokensPerCycleTime: undefined,
    costPerLOC: 0.0132,
    costPerPR: 32.82,
    costPerSP: 13.68,
    storyPoints: 12,
    wipSP: null,
    totalCost: 164.12,
    timeToContextWindow: null,
    autoCompactions: 0,
    manualCompactions: 0,
    totalPrompts: 0,
    avgPromptLength: 0,
    topCategory: null,
    topCategoryCount: 0,
    topSubcategory: null,
    topSubcategoryCount: 0,
    promptCategories: {},
    note: ''
  },
  {
    week: 'Week 3',
    period: 'Oct 20-24',
    featurePRs: 6,
    locPerPR: 1536,
    locPerDev: 4608,
    locPerToken: null,
    commentsPerPR: 1.00,
    testCoverage: 79.86,
    cves: 0,
    duplicatedLines: 0,
    maintainability: 1,
    reliability: 1,
    security: 1,
    codeSmells: 5.2,
    nkt: 125.55,
    cycleTime: 0.96,
    tokensPerSP: null,
    tokensPerCycleTime: undefined,
    costPerLOC: 0.02,
    costPerPR: 30.65,
    costPerSP: 9.2,
    storyPoints: 20,
    wipSP: null,
    totalCost: 183.92,
    timeToContextWindow: null,
    autoCompactions: 0,
    manualCompactions: 0,
    totalPrompts: 0,
    avgPromptLength: 0,
    topCategory: null,
    topCategoryCount: 0,
    topSubcategory: null,
    topSubcategoryCount: 0,
    promptCategories: {},
    note: ''
  },
  {
    week: 'Week 4',
    period: 'Oct 27-31',
    featurePRs: 5,
    locPerPR: 1154,
    locPerDev: 1442,
    locPerToken: null,
    commentsPerPR: 1.00,
    testCoverage: 85.23,
    cves: 0,
    duplicatedLines: 0,
    maintainability: 1,
    reliability: 1,
    security: 1,
    codeSmells: 2.2,
    nkt: 31.81,
    cycleTime: 3.08,
    tokensPerSP: null,
    tokensPerCycleTime: undefined,
    costPerLOC: 0.0399,
    costPerPR: 46.06,
    costPerSP: 19.19,
    storyPoints: 12,
    wipSP: null,
    totalCost: 230.29,
    timeToContextWindow: null,
    autoCompactions: 0,
    manualCompactions: 0,
    totalPrompts: 0,
    avgPromptLength: 0,
    topCategory: null,
    topCategoryCount: 0,
    topSubcategory: null,
    topSubcategoryCount: 0,
    promptCategories: {},
    note: ''
  },
  {
    week: 'Week 5',
    period: 'Nov 3-7',
    featurePRs: 4,
    locPerPR: 1948,
    locPerDev: 3895,
    locPerToken: 0.00001167,
    commentsPerPR: 1.00,
    testCoverage: 89.77,
    cves: 0,
    duplicatedLines: 0,
    maintainability: 1,
    reliability: 1,
    security: 1,
    codeSmells: 3.25,
    nkt: 51.16,
    cycleTime: 1.61,
    tokensPerSP: 51333342,
    tokensPerCycleTime: 103602211,
    costPerLOC: 0.0498,
    costPerPR: 96.9,
    costPerSP: 27.69,
    storyPoints: 14,
    wipSP: null,
    totalCost: 387.59,
    timeToContextWindow: 101.53,
    autoCompactions: 0,
    manualCompactions: 16,
    totalPrompts: 336,
    avgPromptLength: 80,
    topCategory: 'general',
    topCategoryCount: 130,
    topSubcategory: null,
    topSubcategoryCount: 0,
    promptCategories: {
      general: { count: 130 },
      feature_development: { count: 84 },
      bug_fix: { count: 52 },
      testing: { count: 43 },
      version_control: { count: 10 },
      configuration: { count: 7 },
      documentation: { count: 5 },
      code_understanding: { count: 3 },
      code_review: { count: 2 }
    },
    note: ''
  },
  {
    week: 'Week 6',
    period: 'Nov 10-14',
    featurePRs: 5,
    locPerPR: 1878,
    locPerDev: 3130,
    locPerToken: 0.00005129,
    commentsPerPR: 1.60,
    testCoverage: 87.5,
    cves: 0,
    duplicatedLines: 0,
    maintainability: 1,
    reliability: 1,
    security: 1,
    codeSmells: 2,
    nkt: 60.35,
    cycleTime: 2.44,
    tokensPerSP: 11442603,
    tokensPerCycleTime: 15006692,
    costPerLOC: 0.0282,
    costPerPR: 52.91,
    costPerSP: 16.53,
    storyPoints: 16,
    wipSP: null,
    totalCost: 264.53,
    timeToContextWindow: 88.60,
    autoCompactions: 0,
    manualCompactions: 11,
    totalPrompts: 68,
    avgPromptLength: 87,
    topCategory: 'general',
    topCategoryCount: 30,
    topSubcategory: null,
    topSubcategoryCount: 0,
    promptCategories: {
      general: { count: 30 },
      feature_development: { count: 23 },
      bug_fix: { count: 10 },
      testing: { count: 2 },
      version_control: { count: 1 },
      code_review: { count: 1 },
      code_understanding: { count: 1 }
    },
    note: ''
  },
  {
    week: 'Week 7',
    period: 'Nov 17-21',
    featurePRs: 4,
    locPerPR: 4051,
    locPerDev: 8102,
    locPerToken: 0.00001649,
    commentsPerPR: 1.25,
    testCoverage: 92.13,
    cves: 0,
    duplicatedLines: 0.23,
    maintainability: 1,
    reliability: 1,
    security: 1,
    codeSmells: 5.33,
    nkt: 136.58,
    cycleTime: 1.24,
    tokensPerSP: 61419773,
    tokensPerCycleTime: 198128301,
    costPerLOC: 0.0229,
    costPerPR: 92.83,
    costPerSP: 23.21,
    storyPoints: 16,
    wipSP: null,
    totalCost: 371.31,
    timeToContextWindow: 93.80,
    autoCompactions: 0,
    manualCompactions: 28,
    totalPrompts: 175,
    avgPromptLength: 81,
    topCategory: 'general',
    topCategoryCount: 63,
    topSubcategory: null,
    topSubcategoryCount: 0,
    promptCategories: {
      general: { count: 63 },
      feature_development: { count: 53 },
      bug_fix: { count: 47 },
      testing: { count: 7 },
      version_control: { count: 3 },
      documentation: { count: 1 },
      code_review: { count: 1 }
    },
    note: ''
  }
];

const validWeeks = weeklyData.filter(d => d.featurePRs > 0);

const CHART_WIDTH = 500;
const CHART_HEIGHT = 250;

function renderChartToBuffer(config) {
  const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
  const ctx = canvas.getContext('2d');
  new Chart(ctx, config);
  return canvas.toBuffer('image/png');
}

function makeLineChart(labels, data, { title, yLabel, datasetLabel }) {
  return renderChartToBuffer({
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: datasetLabel || yLabel,
        data,
        borderWidth: 2,
        fill: false,
        tension: 0.2,
        pointRadius: 3
      }]
    },
    options: {
      responsive: false,
      plugins: {
        title: { display: !!title, text: title },
        legend: { display: false },
      },
      scales: {
        x: {
          title: { display: true, text: 'Week' }
        },
        y: {
          beginAtZero: true,
          title: { display: !!yLabel, text: yLabel }
        }
      }
    }
  });
}

function makeStackedBar(labels, datasets, { title, yLabel }) {
  return renderChartToBuffer({
    type: 'bar',
    data: {
      labels,
      datasets
    },
    options: {
      responsive: false,
      plugins: {
        title: { display: !!title, text: title },
        legend: { display: true },
      },
      scales: {
        x: {
          stacked: true,
          title: { display: true, text: 'Week' }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          title: { display: !!yLabel, text: yLabel }
        }
      }
    }
  });
}

// Generation of the Pdf
(function generatePdf() {
  const pdfOutputPath = path.resolve(
    __dirname,
    outputFile.endsWith('.pdf') ? outputFile : outputFile + '.pdf'
  );

  const labels = weeklyData.map(d => d.period);

  const doc = new PDFDocument({
    autoFirstPage: false,
    info: {
      Title: 'AI in SDLC Internal Report',
      Author: 'AI Metrics Script',
    },
  });

  const stream = fs.createWriteStream(pdfOutputPath);
  doc.pipe(stream);

  // Cover page
  doc.addPage();
  doc.fontSize(24).text('AI in SDLC Internal Report', { align: 'left' });
  doc.moveDown();
  doc.fontSize(14).text('Performance Analysis Period: October 7 - November 21, 2025');

function addChartsGrid(title, charts) {
  const margin = 40;
  const cellWidthGap = margin;
  const chartsPerPage = 8;
  const cols = 2;

  const cellWidth = (doc.page.width - margin * (cols + 1)) / cols;
  const cellHeight = 180;

  charts.forEach((chart, index) => {
    const pageIndex = Math.floor(index / chartsPerPage);
    const indexOnPage = index % chartsPerPage;
    const col = indexOnPage % cols;
    const row = Math.floor(indexOnPage / cols);

    if (indexOnPage === 0) {
      doc.addPage();
      doc.fontSize(18).text(title, { align: 'left' });
      doc.moveDown(0.5);
    }

    const startY = doc.y;
    const x = margin + col * (cellWidth + cellWidthGap);
    const y = startY + row * (cellHeight);

    doc.image(chart.buffer, x, y, {
      fit: [cellWidth, cellHeight],
      align: 'left',
      valign: 'top'
    });
  });
}

  // Efficiency metrics
  const tokensPerStoryPoint = makeLineChart(
    labels,
    weeklyData.map(d => d.tokensPerSP),
    { title: 'Tokens per Story Points', yLabel: 'Tokens per SPs', datasetLabel: 'Tokens/SP' }
  );

  const locPerToken = makeLineChart(
    labels,
    weeklyData.map(d => 10000 * d.locPerToken),
    { title: 'LOC per 10,0000 Tokens', yLabel: 'Lines of Code per 10K Tokens', datasetLabel: 'LOC/10000Token' }
  );

  const locPerPR = makeLineChart(
    labels,
    weeklyData.map(d => d.locPerPR),
    { title: 'LOC per Merged PR', yLabel: 'LOC per Merged PR', datasetLabel: 'LOC/PR' }
  );

  const locPerDev = makeLineChart(
    labels,
    weeklyData.map(d => d.locPerDev),
    { title: 'LOC per Dev', yLabel: 'LOC per Dev', datasetLabel: 'LOC per Dev' }
  );
  
  const tokensPerCycleTime = makeLineChart(
    labels,
    weeklyData.map(d => d.tokensPerCycleTime),
    { title: 'Tokens per Time to Pass PR', yLabel: 'Tokens Per Day', datasetLabel: 'Tokens/Day' }
  );

  const costPerLOC = makeLineChart(
    labels,
    weeklyData.map(d => d.costPerLOC),
    { title: 'Cost per LOC', yLabel: 'Cost per LOC ($)', datasetLabel: 'Cost/LOC' }
  );

  const costPerPR = makeLineChart(
    labels,
    weeklyData.map(d => d.costPerPR),
    { title: 'Cost per PR', yLabel: 'Cost per PR ($)', datasetLabel: 'Cost/PR' }
  );

  const costPerSP = makeLineChart(
    labels,
    weeklyData.map(d => d.costPerSP),
    { title: 'Cost per Story Point', yLabel: 'Cost per SP ($)', datasetLabel: 'Cost/SP' }
  );

  const storyPointVelocity = makeLineChart(
    labels,
    weeklyData.map(d => d.storyPoints),
    { title: 'Story Point Velocity', yLabel: 'Story Points', datasetLabel: 'Story Point Velocity' }
  );
  
  const featurePRs = makeLineChart(
    labels,
    weeklyData.map(d => d.featurePRs),
    { title: 'Number of PRs', yLabel: 'PRs', datasetLabel: 'Number of PRs' }
  );

  // Quality metrics
  const commentsPerPR = makeLineChart(
    labels,
    weeklyData.map(d => d.commentsPerPR),
    { title: 'Comments per PR', yLabel: 'Comments per PR', datasetLabel: 'Comments/PR' }
  );

  const testCoverage = makeLineChart(
    labels,
    weeklyData.map(d => d.testCoverage),
    { title: 'Test Coverage', yLabel: 'Test Coverage (%)', datasetLabel: 'Test Coverage (%)' }
  );

  const cves = makeLineChart(
    labels,
    weeklyData.map(d => d.cves),
    { title: 'CVEs', yLabel: 'CVEs', datasetLabel: 'CVEs' }
  );

  const dupLines = makeLineChart(
    labels,
    weeklyData.map(d => d.duplicatedLines),
    { title: 'Duplicated Lines', yLabel: 'Duplicated Lines (%)', datasetLabel: 'Duplicated Lines (%)' }
  );

  const maintain = makeLineChart(
    labels,
    weeklyData.map(d => d.maintainability),
    { title: 'Maintainability Rating', yLabel: 'Rating (1=A,5=E)', datasetLabel: 'Maintainability' }
  );

  const reliab = makeLineChart(
    labels,
    weeklyData.map(d => d.reliability),
    { title: 'Reliability Rating', yLabel: 'Rating (1=A,5=E)', datasetLabel: 'Reliability' }
  );

  const security = makeLineChart(
    labels,
    weeklyData.map(d => d.security),
    { title: 'Security Rating', yLabel: 'Rating (1=A,5=E)', datasetLabel: 'Security' }
  );

  const codeSmells = makeLineChart(
    labels,
    weeklyData.map(d => d.codeSmells),
    { title: 'Code Smells', yLabel: 'Code Smells', datasetLabel: 'Code Smells' }
  );

  // Adoption & maturity metrics
  const timeToContext = makeLineChart(
    labels,
    weeklyData.map(d => d.timeToContextWindow),
    { title: 'Time to Hit Context Window', yLabel: 'Minutes', datasetLabel: 'Minutes' }
  );

  const autoComp = makeLineChart(
    labels,
    weeklyData.map(d => d.autoCompactions),
    { title: 'Auto Compactions', yLabel: 'Count', datasetLabel: 'Auto Compactions' }
  );

  // Prompt categories stacked bar
  const categoryColors = {
    feature_development: '#4CAF50',
    bug_fix: '#FF5722',
    general: '#9E9E9E',
    code_understanding: '#2196F3',
    testing: '#FF9800',
    refactoring: '#9C27B0',
    documentation: '#00BCD4',
    code_review: '#607D8B',
    version_control: '#795548',
    configuration: '#E91E63',
  };

  const categoryLabels = {
    feature_development: 'Feature Development',
    bug_fix: 'Bug Fix',
    general: 'General',
    code_understanding: 'Code Understanding',
    testing: 'Testing',
    refactoring: 'Refactoring',
    documentation: 'Documentation',
    code_review: 'Code Review',
    version_control: 'Version Control',
    configuration: 'Configuration',
  };

  const allCategories = new Set();
  weeklyData.forEach(d => {
    if (d.promptCategories) {
      Object.keys(d.promptCategories).forEach(c => allCategories.add(c));
    }
  });

  const stackedDatasets = Array.from(allCategories).map(cat => ({
    label: categoryLabels[cat] || cat,
    data: weeklyData.map(d =>
      d.promptCategories && d.promptCategories[cat]
        ? d.promptCategories[cat].count || 0
        : 0
    ),
    backgroundColor: categoryColors[cat] || '#999999',
  }));

  const promptCategoriesBuf = makeStackedBar(labels, stackedDatasets, {
    title: 'Prompt Categories Breakdown by Week',
    yLabel: 'Number of Prompts',
  });

  addChartsGrid('Efficiency', [
    { label: 'Tokens per Story Point', buffer: tokensPerStoryPoint},
    { label: 'LOC per Token', buffer: locPerToken},
    { label: 'LOC per Merged PR', buffer: locPerPR},
    { label: 'LOC per Developer', buffer: locPerDev },
    { label: 'Tokens per Time to Pass PR', buffer: tokensPerCycleTime},
    { label: 'Cost per LoC', buffer: costPerLOC },
    { label: 'Cost per PR', buffer: costPerPR },
    { label: 'Cost per Story Point', buffer: costPerSP },
    { label: 'Story Point Velocity', buffer: storyPointVelocity },
    { label: 'Number of PRs', buffer: featurePRs },
  ]);
  
  addChartsGrid('Satisfaction and Trust', [
    { label: 'Comments per PR', buffer: commentsPerPR },
  ]);

  addChartsGrid('Adoption & maturity', [
    { label: 'Time to Context Window', buffer: timeToContext },
    { label: 'Auto Compactions', buffer: autoComp },
    { label: 'Prompt Categories', buffer: promptCategoriesBuf },
  ]);
  
  addChartsGrid('Quality', [
    { label: 'Test Coverage', buffer: testCoverage },
    { label: 'CVEs', buffer: cves },
    { label: 'Duplicated Lines', buffer: dupLines },
    { label: 'Maintainability', buffer: maintain },
    { label: 'Reliability', buffer: reliab },
    { label: 'Security', buffer: security },
    { label: 'Code Smells', buffer: codeSmells },
  ]);

  doc.end();

  stream.on('finish', () => {
    console.log(`Weekly metrics PDF generated: ${pdfOutputPath}`);
  });
})();
