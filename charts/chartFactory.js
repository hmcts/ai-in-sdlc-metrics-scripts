
const { createCanvas } = require('canvas');
const { Chart, registerables } = require('chart.js');
const annotationPlugin = require('chartjs-plugin-annotation');
const ChartDataLabels = require('chartjs-plugin-datalabels');
Chart.register(...registerables, annotationPlugin, ChartDataLabels);

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

function makeTokensPerSPScatter(weeklyData) {
  // Color scale from green (low SP) to red (high SP)
  const spColorMap = {
    1: '#2ecc71',  // Green
    2: '#27ae60',  // Dark green
    3: '#f39c12',  // Orange
    5: '#e67e22',  // Dark orange
    8: '#e74c3c',  // Red
    13: '#c0392b', // Dark red
    default: '#8e44ad' // Purple for 10+ SP
  };

  const getColorForSP = (sp) => {
    return spColorMap[sp] || spColorMap.default;
  };

  // Collect all tickets with both tokens and story points
  // Exclude Week 1-3 (incomplete transcript data), start from Week 4 (index 3)
  const datasets = [];
  const spGroups = {};

  weeklyData.forEach((week, weekIndex) => {
    // Skip weeks 1-3 (indices 0-2)
    if (weekIndex < 3) return;
    if (!week.ticketDetails) return;

    Object.entries(week.ticketDetails).forEach(([ticket, details]) => {
      if (details.tokens && details.storyPoints) {
        const sp = details.storyPoints;

        if (!spGroups[sp]) {
          spGroups[sp] = {
            label: `${sp} SP`,
            data: [],
            backgroundColor: getColorForSP(sp),
            borderColor: getColorForSP(sp),
            pointRadius: 5,
            pointHoverRadius: 7
          };
        }

        // Adjust x-axis: Week 4 (index 3) becomes x=0, Week 5 becomes x=1, etc.
        spGroups[sp].data.push({
          x: weekIndex - 3,
          y: details.tokens
        });
      }
    });
  });

  // Convert spGroups to datasets array and sort by SP
  const sortedSPs = Object.keys(spGroups).map(Number).sort((a, b) => a - b);
  sortedSPs.forEach(sp => {
    datasets.push(spGroups[sp]);
  });

  return renderChartToBuffer({
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: 'Tokens per Story Point (by Ticket)'
        },
        legend: {
          display: true,
          position: 'right'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const tokens = context.parsed.y;
              const sp = context.dataset.label;
              return `${sp}: ${tokens.toLocaleString()} tokens`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Week' },
          ticks: {
            stepSize: 1,
            callback: function(value) {
              // Week 4 is x=0, Week 5 is x=1, etc.
              return `W${Math.floor(value) + 4}`;
            }
          }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Tokens' },
          ticks: {
            callback: function(value) {
              return (value / 1000000).toFixed(0) + 'M';
            }
          }
        }
      }
    }
  });
}

function makeNKTLogScatter(weeklyData) {
  // Filter weeks with valid NK/T and cycle time data
  const validWeeks = weeklyData
    .map((week, index) => ({
      week: week.week,
      weekIndex: index,
      nkt: week.nkt,
      cycleTime: week.cycleTime
    }))
    .filter(w => w.nkt && w.cycleTime && w.nkt > 0 && w.cycleTime > 0);

  if (validWeeks.length === 0) {
    // Return empty chart if no data
    return renderChartToBuffer({
      type: 'scatter',
      data: { datasets: [] },
      options: {
        responsive: false,
        plugins: {
          title: { display: true, text: 'log(NK) vs log(T) - No Data' }
        }
      }
    });
  }

  // Calculate log values
  const dataPoints = validWeeks.map(w => ({
    x: Math.log10(w.cycleTime), // log(T)
    y: Math.log10(w.nkt),        // log(NK)
    week: w.week,
    weekIndex: w.weekIndex
  }));

  return renderChartToBuffer({
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Weeks',
        data: dataPoints,
        backgroundColor: '#2196F3',
        borderColor: '#2196F3',
        pointRadius: 6,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: 'log(NK) vs log(T)'
        },
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const point = dataPoints[context.dataIndex];
              return `${point.week}: log(T)=${context.parsed.x.toFixed(2)}, log(NK)=${context.parsed.y.toFixed(2)}`;
            }
          }
        },
        datalabels: {
          display: true,
          align: function(context) {
            const point = dataPoints[context.dataIndex];
            const week = point.week;

            // Manual positioning for each week to avoid overlap
            const positions = {
              'Week 8': 'left',      // Top-left (0.14, 0.87)
              'Week 2': 'top',       // Upper area (0.28, 0.79)
              'Week 5': 'right',     // Upper area (0.32, 0.78)
              'Week 6': 'top',       // Middle (0.54, 0.60)
              'Week 7': 'left',      // Lower-right (0.68, 0.42)
              'Week 4': 'bottom',    // Lower-right (0.71, 0.39)
              'Week 3': 'left'       // Bottom-right (0.84, 0.26) - changed to left to avoid cutoff
            };
            return positions[week] || 'top';
          },
          anchor: 'center',
          offset: 10,
          formatter: function(value, context) {
            const point = dataPoints[context.dataIndex];
            return point.week;
          },
          color: '#000',
          font: {
            size: 9,
            weight: 'bold'
          },
          clip: false
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'log(T) - Cycle Time (days)' },
          ticks: {
            callback: function(value) {
              return value.toFixed(2);
            }
          }
        },
        y: {
          type: 'linear',
          title: { display: true, text: 'log(NK) - Normalized Knowledge' },
          ticks: {
            callback: function(value) {
              return value.toFixed(2);
            }
          }
        }
      }
    }
  });
}

module.exports = { makeLineChart, makeStackedBar, makePromptCategoryChart, makeTokensPerSPScatter, makeNKTLogScatter };
