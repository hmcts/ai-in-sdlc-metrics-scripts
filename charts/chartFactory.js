
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

// Common chart configuration
const DEFAULT_CHART_OPTIONS = {
  responsive: false,
  plugins: {
    title: { display: false },
    legend: { display: false }
  },
  scales: {
    x: { title: { display: true, text: 'Week' } },
    y: { beginAtZero: true }
  }
};

// Color palettes
const SP_COLOR_MAP = {
  1: '#00FF00',  // Bright Green
  2: '#0000FF',  // Blue
  3: '#FF00FF',  // Magenta
  5: '#FFA500',  // Orange
  8: '#FF0000',  // Red
  13: '#800080', // Purple
  default: '#000000' // Black
};

const CATEGORY_COLORS = {
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

const CATEGORY_LABELS = {
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

// Helper function to deep merge chart options
function mergeOptions(customOptions) {
  return {
    responsive: false,
    plugins: {
      ...DEFAULT_CHART_OPTIONS.plugins,
      ...(customOptions.plugins || {})
    },
    scales: {
      ...DEFAULT_CHART_OPTIONS.scales,
      ...(customOptions.scales || {})
    }
  };
}

function renderChartToBuffer(config) {
  const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
  const ctx = canvas.getContext('2d');
  new Chart(ctx, config);
  return canvas.toBuffer('image/png');
}

function makeLineChart(labels, data, opts) {
  const { title, yLabel, horizontalLines, comparisonData, comparisonLabel } = opts;
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

  const datasets = [
    {
      label: opts.datasetLabel || undefined,
      data,
      borderColor: mainLineColor,
      borderWidth: 2,
      fill: false,
      tension: 0.2,
      pointRadius: 3
    }
  ];

  // Add comparison line if provided
  if (comparisonData && comparisonLabel) {
    datasets.push({
      label: comparisonLabel,
      data: comparisonData,
      borderColor: '#FF8C00',
      borderWidth: 2,
      fill: false,
      tension: 0.2,
      pointRadius: 3,
      borderDash: [5, 5],
      spanGaps: true
    });
  }

  datasets.push(...dummyLineDatasets);

  return renderChartToBuffer({
    type: 'line',
    data: {
      labels,
      datasets
    },
    options: mergeOptions({
      plugins: {
        title: { display: !!title, text: title },
        legend: { display: (dummyLineDatasets.length > 0 || comparisonData) },
        ...annotationConfig
      },
      scales: {
        x: { title: { display: true, text: 'Week' } },
        y: { beginAtZero: true, title: { display: !!yLabel, text: yLabel } }
      }
    })
  });
}

function makeStackedBar(labels, datasets, opts) {
  const { title, yLabel } = opts;
  return renderChartToBuffer({
    type: 'bar',
    data: { labels, datasets },
    options: mergeOptions({
      plugins: {
        title: { display: !!title, text: title },
        legend: { display: true }
      },
      scales: {
        x: { stacked: true, title: { display: true, text: 'Week' } },
        y: { stacked: true, beginAtZero: true, title: { display: !!yLabel, text: yLabel } }
      }
    })
  });
}

// Helper: Prepare prompt category datasets
function preparePromptCategoryData(weeklyData) {
  const allCategories = new Set();
  weeklyData.forEach(d => {
    if (d.promptCategories) {
      Object.keys(d.promptCategories).forEach(c => allCategories.add(c));
    }
  });

  // Create datasets with total counts for sorting
  const datasets = Array.from(allCategories).map(cat => {
    const data = weeklyData.map(d =>
      d.promptCategories && d.promptCategories[cat]
        ? d.promptCategories[cat].count || 0
        : 0
    );
    const totalCount = data.reduce((sum, val) => sum + val, 0);

    return {
      label: CATEGORY_LABELS[cat] || cat,
      data,
      backgroundColor: CATEGORY_COLORS[cat] || '#999999',
      totalCount
    };
  });

  // Sort by total count ascending (smallest first, so largest appear at top of stacked bar)
  datasets.sort((a, b) => a.totalCount - b.totalCount);

  // Remove totalCount property before returning
  return datasets.map(({ totalCount, ...rest }) => rest);
}

function makePromptCategoryChart(labels, weeklyData) {
  const datasets = preparePromptCategoryData(weeklyData);

  return makeStackedBar(labels, datasets, {
    title: 'Prompt Categories Breakdown by Week',
    yLabel: 'Number of Prompts',
  });
}

// Helper: Get color for story point value
function getColorForSP(sp) {
  return SP_COLOR_MAP[sp] || SP_COLOR_MAP.default;
}

function makeTokensPerSPWithStdDev(weeklyData) {
  // Step 1: Collect all token values grouped by story point size
  const tokensBySP = {};

  weeklyData.forEach((week, weekIndex) => {
    // Skip weeks 1-3 (incomplete data)
    if (weekIndex < 3) return;

    if (!week.ticketDetails) return;

    Object.entries(week.ticketDetails).forEach(([ticket, details]) => {
      if (details.tokens && details.storyPoints) {
        const sp = details.storyPoints;
        if (!tokensBySP[sp]) {
          tokensBySP[sp] = [];
        }
        tokensBySP[sp].push(details.tokens);
      }
    });
  });

  // Step 2: Calculate statistics for each SP size
  const stats = Object.entries(tokensBySP)
    .map(([sp, tokens]) => {
      const n = tokens.length;
      const mean = tokens.reduce((sum, val) => sum + val, 0) / n;
      const variance = tokens.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
      const stdDev = Math.sqrt(variance);

      return {
        sp: Number(sp),
        mean: mean,
        stdDev: stdDev,
        count: n
      };
    })
    .sort((a, b) => a.sp - b.sp);

  // Step 3: Prepare data for bar chart
  const labels = stats.map(s => `${s.sp} SP`);
  const meanValues = stats.map(s => s.mean);
  const backgroundColors = stats.map(s => getColorForSP(s.sp));

  // Step 4: Create error bar annotations
  const errorBarAnnotations = {};
  stats.forEach((stat, idx) => {
    errorBarAnnotations[`errorBar${idx}`] = {
      type: 'line',
      xMin: idx,
      xMax: idx,
      yMin: stat.mean - stat.stdDev,
      yMax: stat.mean + stat.stdDev,
      borderColor: '#000',
      borderWidth: 2
    };
    // Top cap
    errorBarAnnotations[`errorBarCapTop${idx}`] = {
      type: 'line',
      xMin: idx - 0.1,
      xMax: idx + 0.1,
      yMin: stat.mean + stat.stdDev,
      yMax: stat.mean + stat.stdDev,
      borderColor: '#000',
      borderWidth: 2
    };
    // Bottom cap
    errorBarAnnotations[`errorBarCapBottom${idx}`] = {
      type: 'line',
      xMin: idx - 0.1,
      xMax: idx + 0.1,
      yMin: stat.mean - stat.stdDev,
      yMax: stat.mean - stat.stdDev,
      borderColor: '#000',
      borderWidth: 2
    };
  });

  return renderChartToBuffer({
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Average Tokens',
        data: meanValues,
        backgroundColor: backgroundColors,
        borderColor: backgroundColors,
        borderWidth: 1
      }]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: 'Tokens per Story Point (Mean ± Std Dev)'
        },
        legend: {
          display: false  // Single dataset, no legend needed
        },
        annotation: {
          annotations: errorBarAnnotations
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const stat = stats[context.dataIndex];
              const meanM = (stat.mean / 1000000).toFixed(1);
              const stdDevM = (stat.stdDev / 1000000).toFixed(1);
              return `${meanM}M ± ${stdDevM}M tokens`;
            }
          }
        },
        datalabels: {
          display: true,
          anchor: 'end',
          align: 'top',
          formatter: function(value, context) {
            const stat = stats[context.dataIndex];
            const meanM = (stat.mean / 1000000).toFixed(1);
            const stdDevM = (stat.stdDev / 1000000).toFixed(1);
            return `${meanM}M\n±${stdDevM}M`;
          },
          color: '#000',
          font: {
            size: 9,
            weight: 'bold'
          },
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          borderRadius: 3,
          padding: 4
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Story Points'
          }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Tokens (Mean ± Std Dev)'
          },
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

// Helper: Calculate NK/T ratio for each week
function calculateNKTRatio(weeklyData) {
  const NK = 13; // N * K = 13 * 1

  return weeklyData.map(week => {
    if (week.nkt && week.cycleTime && week.cycleTime > 0) {
      return NK / week.cycleTime;
    }
    return null;
  });
}

function makeNKTLogScatter(labels, weeklyData) {
  const NK = 13;
  const nktRatios = calculateNKTRatio(weeklyData);

  // Check if we have any data
  const hasData = nktRatios.some(ratio => ratio !== null);

  if (!hasData) {
    return renderChartToBuffer({
      type: 'line',
      data: { labels: [], datasets: [] },
      options: mergeOptions({
        plugins: {
          title: { display: true, text: 'NK/T Over Time - No Data' }
        }
      })
    });
  }

  return renderChartToBuffer({
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'NK/T',
        data: nktRatios,
        borderColor: '#7798f1ff',
        backgroundColor: '#7798f1ff',
        borderWidth: 2,
        fill: false,
        tension: 0.2,
        pointRadius: 3,
        pointHoverRadius: 6,
        spanGaps: true
      }]
    },
    options: mergeOptions({
      plugins: {
        title: {
          display: true,
          text: 'NK/T Over Time'
        },
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              if (context.parsed.y === null) return 'No data';
              return `NK/T: ${context.parsed.y.toFixed(2)}`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Week' }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'NK/T Ratio' },
          ticks: {
            callback: function(value) {
              return value.toFixed(1);
            }
          }
        }
      }
    })
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

module.exports = { makeLineChart, makeStackedBar, makePromptCategoryChart, makeTokensPerSPWithStdDev, makeNKTLogScatter, makeInterruptionRateChart };
