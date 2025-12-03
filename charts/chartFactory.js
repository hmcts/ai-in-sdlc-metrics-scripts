
const { createCanvas } = require('canvas');
const { Chart, registerables } = require('chart.js');
const annotationPlugin = require('chartjs-plugin-annotation');
Chart.register(...registerables, annotationPlugin);

const CHART_WIDTH = 500;
const CHART_HEIGHT = 250;

function renderChartToBuffer(config) {
  const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
  const ctx = canvas.getContext('2d');
  new Chart(ctx, config);
  return canvas.toBuffer('image/png');
}

function makeLineChart(labels, data, opts) {
  const { title, yLabel, horizontalLines } = opts;
  let annotationConfig = {};
  let dummyLineDatasets = [];
  if (horizontalLines && Array.isArray(horizontalLines)) {
    annotationConfig = {
      annotation: {
        annotations: horizontalLines.map((line, idx) => ({
          type: 'line',
          yMin: line.value,
          yMax: line.value,
          borderColor: line.color,
          borderWidth: 2
        }))
      }
    };
    // Add dummy datasets for legend
    dummyLineDatasets = horizontalLines.map((line, idx) => ({
      label: line.label,
      data: Array(labels.length).fill(null),
      borderColor: line.color,
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      borderDash: [8, 4],
      showLine: false,
      hidden: false
    }));
  }
  let mainLineColor = '#7798f1ff';
  if (horizontalLines && Array.isArray(horizontalLines)) {
    const usedColors = horizontalLines.map(l => l.color);
    if (!usedColors.includes(mainLineColor)) {
      mainLineColor = mainLineColor;
    } else {
      // Pick a color not in usedColors
      const palette = ['#182549', '#FF9800', '#4CAF50', '#9C27B0', '#607D8B'];
      mainLineColor = palette.find(c => !usedColors.includes(c)) || '#182549';
    }
  }
  return renderChartToBuffer({
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: opts.datasetLabel || undefined,
          data,
          borderColor: mainLineColor,
          borderWidth: 2,
          fill: false,
          tension: 0.2,
          pointRadius: 3
        },
        ...dummyLineDatasets
      ]
    },
    options: {
      responsive: false,
      plugins: {
        title: { display: !!title, text: title },
        legend: { display: true },
        ...annotationConfig
      },
      scales: {
        x: { title: { display: true, text: 'Week' } },
        y: { beginAtZero: true, title: { display: !!yLabel, text: yLabel } }
      }
    }
  });
}

function makeStackedBar(labels, datasets, opts) {
  const { title, yLabel } = opts;
  return renderChartToBuffer({
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: false,
      plugins: {
        title: { display: !!title, text: title },
        legend: { display: true }
      },
      scales: {
        x: { stacked: true, title: { display: true, text: 'Week' } },
        y: { stacked: true, beginAtZero: true, title: { display: !!yLabel, text: yLabel } }
      }
    }
  });
}

function makePromptCategoryChart(labels, weeklyData) {
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

  return makeStackedBar(labels, stackedDatasets, {
    title: 'Prompt Categories Breakdown by Week',
    yLabel: 'Number of Prompts',
  });
}

module.exports = { makeLineChart, makeStackedBar, makePromptCategoryChart };
