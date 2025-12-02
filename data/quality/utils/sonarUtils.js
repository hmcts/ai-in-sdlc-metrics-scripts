// SonarCloud API helpers for quality scripts
const { execSync } = require('child_process');
const CONFIG = require('../../config');

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
  console.log('Raw SonarCloud API response:');
  console.log(response);
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

module.exports = { fetchSonarMetricsLatest };
