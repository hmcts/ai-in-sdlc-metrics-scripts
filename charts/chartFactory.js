
const { createCanvas } = require('canvas');
const { Chart, registerables } = require('chart.js');
const annotationPlugin = require('chartjs-plugin-annotation');
const ChartDataLabels = require('chartjs-plugin-datalabels');
Chart.register(...registerables, annotationPlugin, ChartDataLabels);

// Disable datalabels by default for all charts
Chart.defaults.plugins.datalabels = {
  display: false
};

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
        legend: { display: dummyLineDatasets.length > 0 }, // Only show legend if there are horizontal lines
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
  // High contrast color palette for different story point values
  const spColorMap = {
    1: '#00FF00',  // Bright Green
    2: '#0000FF',  // Blue
    3: '#FF00FF',  // Magenta
    5: '#FFA500',  // Orange
    8: '#FF0000',  // Red
    13: '#800080', // Purple
    default: '#000000' // Black for other values
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
        },
        datalabels: {
          display: true,
          align: function(context) {
            // Alternate alignment to reduce overlap
            return context.dataIndex % 2 === 0 ? 'top' : 'bottom';
          },
          offset: 8,
          formatter: function(value) {
            // Show tokens in millions with 1 decimal place
            return (value.y / 1000000).toFixed(1) + 'M';
          },
          color: '#000',
          font: {
            size: 8,
            weight: 'bold'
          },
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          borderRadius: 3,
          padding: {
            top: 2,
            bottom: 2,
            left: 3,
            right: 3
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
          title: { display: true, text: 'NK vs T - No Data' }
        }
      }
    });
  }

  // Plot NK (constant = 13) against T (cycle time)
  const NK = 13; // N * K = 13 * 1
  const dataPoints = validWeeks.map(w => ({
    x: w.cycleTime, // T (cycle time in days)
    y: NK,          // NK (constant = 13)
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
          text: 'NK vs T'
        },
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const point = dataPoints[context.dataIndex];
              return `${point.week}: T=${context.parsed.x.toFixed(2)} days, NK=${context.parsed.y}`;
            }
          }
        },
        datalabels: {
          display: true,
          align: 'top',
          formatter: function(value, context) {
            // Show week label instead of NK (which is constant at 13)
            const point = dataPoints[context.dataIndex];
            return point.week.replace('Week ', 'W');
          },
          color: '#000',
          font: {
            size: 10,
            weight: 'bold'
          },
          backgroundColor: 'rgba(255, 255, 255, 0.7)',
          borderRadius: 3,
          padding: 2
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'T - Cycle Time (days)' },
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return value.toFixed(1);
            }
          }
        },
        y: {
          type: 'linear',
          title: { display: true, text: 'NK' },
          beginAtZero: true,
          min: 0,
          max: 15,
          ticks: {
            callback: function(value) {
              return value.toFixed(0);
            }
          }
        }
      }
    }
  });
}

function makeInterruptionRateChart(labels, weeklyData) {
  // Calculate interruption rate as: (interruptions / totalPrompts) * 100
  const interruptionRates = weeklyData.map(d => {
    if (!d.totalPrompts || d.totalPrompts === 0) return 0;
    return parseFloat(((d.interruptions || 0) / d.totalPrompts * 100).toFixed(2));
  });

  return makeLineChart(labels, interruptionRates, {
    title: 'User Interruption Rate',
    yLabel: 'Interruption Rate (%)',
    datasetLabel: 'Interruption Rate (%)'
  });
}

module.exports = { makeLineChart, makeStackedBar, makePromptCategoryChart, makeTokensPerSPScatter, makeNKTLogScatter, makeInterruptionRateChart };
