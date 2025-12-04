// SonarCloud API helpers - centralized quality metrics
const { execSync } = require('child_process');
const CONFIG = require('../../config');

/**
 * Fetch SonarCloud metrics for the latest state of a branch
 * Used for: Overall project quality status
 */
function fetchSonarMetricsLatest(branch = 'master') {
  if (!CONFIG.SONAR_TOKEN) {
    throw new Error('SONAR_TOKEN not set in environment');
  }
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
  const url = `https://sonarcloud.io/api/measures/component?component=${CONFIG.PROJECT_KEY}&branch=${branch}&metricKeys=${METRICS.join(',')}`;
  const response = execSync(`curl -s -u "${CONFIG.SONAR_TOKEN}:" "${url}"`, { encoding: 'utf8' });
  if (!response || !response.trim()) return null;
  const data = JSON.parse(response);
  if (data.component && data.component.measures) {
    const metrics = {};
    data.component.measures.forEach(measure => {
      metrics[measure.metric] = parseFloat(measure.value);
    });
    return metrics;
  }
  return null;
}

/**
 * Fetch historical SonarCloud metrics for a specific week
 * Finds the closest analysis to the end of the week
 */
function fetchSonarMetricsForWeek(week, branch = 'master') {
  if (!CONFIG.SONAR_TOKEN) {
    return null;
  }

  try {
    // Get project analyses history
    const historyUrl = `https://sonarcloud.io/api/project_analyses/search?project=${CONFIG.PROJECT_KEY}&branch=${branch}&ps=100`;
    const historyResponse = execSync(`curl -s "${historyUrl}"`, { encoding: 'utf8' });

    if (!historyResponse || !historyResponse.trim()) {
      return null;
    }

    const historyData = JSON.parse(historyResponse);

    if (!historyData.analyses || historyData.analyses.length === 0) {
      return null;
    }

    // Find analysis closest to the end of the week
    const weekEnd = new Date(week.end);
    weekEnd.setHours(23, 59, 59, 999);

    let closestAnalysis = null;
    let smallestDiff = Infinity;

    historyData.analyses.forEach(analysis => {
      const analysisDate = new Date(analysis.date);
      const diff = Math.abs(analysisDate - weekEnd);

      // Prefer analyses on or before the week end
      if (analysisDate <= weekEnd && diff < smallestDiff) {
        smallestDiff = diff;
        closestAnalysis = analysis;
      }
    });

    // If no analysis found before week end, get the closest one after
    if (!closestAnalysis) {
      historyData.analyses.forEach(analysis => {
        const analysisDate = new Date(analysis.date);
        const diff = Math.abs(analysisDate - weekEnd);
        if (diff < smallestDiff) {
          smallestDiff = diff;
          closestAnalysis = analysis;
        }
      });
    }

    if (!closestAnalysis) {
      return null;
    }

    const analysisDate = new Date(closestAnalysis.date).toISOString().split('T')[0];
    console.log(`    Using SonarCloud analysis from: ${analysisDate}`);

    // Fetch metrics for this specific analysis
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

    const metricsUrl = `https://sonarcloud.io/api/measures/component_tree?component=${CONFIG.PROJECT_KEY}&branch=${branch}&metricKeys=${METRICS.join(',')}&ps=1`;
    const metricsResponse = execSync(`curl -s -u "${CONFIG.SONAR_TOKEN}:" "${metricsUrl}"`, { encoding: 'utf8' });

    if (!metricsResponse || !metricsResponse.trim()) {
      return null;
    }

    const data = JSON.parse(metricsResponse);

    if (data.baseComponent && data.baseComponent.measures) {
      const metrics = {};
      data.baseComponent.measures.forEach(measure => {
        metrics[measure.metric] = parseFloat(measure.value);
      });
      return metrics;
    }

    return null;
  } catch (error) {
    console.log(`    ⚠ Could not fetch historical SonarCloud metrics: ${error.message}`);
    return null;
  }
}

/**
 * Fetch SonarCloud metrics for a specific PR
 * Used for: Per-PR quality analysis
 */
function fetchSonarMetricsForPR(prNumber) {
  if (!CONFIG.SONAR_TOKEN) {
    return null;
  }

  try {
    const url = `https://sonarcloud.io/api/measures/component?component=${CONFIG.PROJECT_KEY}&pullRequest=${prNumber}&metricKeys=${CONFIG.METRICS}`;
    const response = execSync(`curl -s -u "${CONFIG.SONAR_TOKEN}:" "${url}"`, { encoding: 'utf8' });

    if (!response || !response.trim()) {
      return null;
    }

    const data = JSON.parse(response);

    if (data.component && data.component.measures) {
      const metrics = {};
      data.component.measures.forEach(measure => {
        metrics[measure.metric] = parseFloat(measure.value);
      });
      return metrics;
    }
    return null;
  } catch (error) {
    // Silently fail for missing SonarCloud data
    return null;
  }
}

/**
 * Aggregate SonarCloud metrics across multiple PRs
 * Returns averaged metrics
 */
function aggregateSonarMetrics(prNumbers) {
  const metrics = {
    coverage: [],
    vulnerabilities: [],
    duplicated_lines_density: [],
    sqale_rating: [],
    reliability_rating: [],
    security_rating: [],
    bugs: [],
    code_smells: []
  };

  let processedCount = 0;

  prNumbers.forEach(prNumber => {
    const sonarMetrics = fetchSonarMetricsForPR(prNumber);
    if (sonarMetrics) {
      Object.keys(metrics).forEach(metricKey => {
        if (sonarMetrics[metricKey] !== undefined) {
          metrics[metricKey].push(sonarMetrics[metricKey]);
        }
      });
    }

    processedCount++;
    if (processedCount % 10 === 0) {
      process.stdout.write(`\r  Processing SonarCloud metrics: ${processedCount}/${prNumbers.length}...`);
    }

    // Rate limiting
    execSync('sleep 0.3');
  });

  if (prNumbers.length > 0) {
    process.stdout.write(`\r  Processing SonarCloud metrics: ${prNumbers.length}/${prNumbers.length}... Done!\n`);
  }

  // Calculate averages
  const averages = {};
  for (const [key, values] of Object.entries(metrics)) {
    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      averages[key] = sum / values.length;
    } else {
      averages[key] = null;
    }
  }

  return {
    testCoverage: averages.coverage,
    cves: averages.vulnerabilities,
    duplicatedLines: averages.duplicated_lines_density,
    maintainability: averages.sqale_rating,
    reliability: averages.reliability_rating,
    security: averages.security_rating,
    bugs: averages.bugs,
    codeSmells: averages.code_smells
  };
}

module.exports = {
  fetchSonarMetricsLatest,
  fetchSonarMetricsForWeek,
  fetchSonarMetricsForPR,
  aggregateSonarMetrics
};
