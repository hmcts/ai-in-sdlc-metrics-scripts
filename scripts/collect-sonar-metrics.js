#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Load .env ────────────────────────────────────────────────────────────────
(function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
    });
  }
})();

// ─── Configuration ─────────────────────────────────────────────────────────────
const SONAR_TOKEN = process.env.SONAR_TOKEN;
const PROJECT_KEY = 'hmcts.cath';
const SONAR_METRICS = ['coverage', 'vulnerabilities', 'sqale_rating', 'reliability_rating', 'security_rating', 'bugs', 'code_smells', 'duplicated_lines_density'];

function generateWeeks() {
  const PROJECT_START = '2025-10-07';
  const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function padded(n) { return String(n).padStart(2, '0'); }
  function formatDate(d) { return `${d.getFullYear()}-${padded(d.getMonth()+1)}-${padded(d.getDate())}`; }
  function formatPeriod(s, e) {
    const start = `${MONTH_ABBR[s.getMonth()]} ${s.getDate()}`;
    if (s.getMonth() === e.getMonth()) return `${start}-${e.getDate()}`;
    return `${start}-${MONTH_ABBR[e.getMonth()]} ${e.getDate()}`;
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const weeks = [];

  let weekStart = new Date(PROJECT_START);
  // Find the Friday of the first week
  const daysToFriday = (5 - weekStart.getDay() + 7) % 7;
  let weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + daysToFriday);

  let weekNum = 1;
  while (weekStart <= today) {
    weeks.push({
      name: `Week ${weekNum}`,
      start: formatDate(weekStart),
      end: formatDate(weekEnd),
      period: formatPeriod(weekStart, weekEnd)
    });
    weekNum++;
    // Next Monday = Friday + 3 days
    weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() + 3);
    // Next Friday = Monday + 4 days
    weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 4);
  }
  return weeks;
}

// ─── SonarCloud API (fetches full history once, filters per week) ──────────────
let sonarHistoryCache = null;

function fetchSonarHistory() {
  if (sonarHistoryCache) return sonarHistoryCache;
  if (!SONAR_TOKEN) {
    console.log('  ⚠ SONAR_TOKEN not set — will use preserved data only');
    return null;
  }
  try {
    const url = `https://sonarcloud.io/api/measures/search_history?component=${PROJECT_KEY}&branch=master&metrics=${SONAR_METRICS.join(',')}&ps=500`;
    const response = execSync(`curl -s -u "${SONAR_TOKEN}:" "${url}"`, { encoding: 'utf8' });
    if (!response || !response.trim()) return null;
    const data = JSON.parse(response);
    sonarHistoryCache = data.measures || [];
    console.log(`  ✓ Fetched SonarCloud history (${sonarHistoryCache.length} metrics)`);
    return sonarHistoryCache;
  } catch (error) {
    console.log(`  ⚠ Could not fetch SonarCloud history: ${error.message}`);
    return null;
  }
}

function getSonarMetricsForWeek(week) {
  const measures = fetchSonarHistory();
  if (!measures) return null;

  const weekEnd = new Date(week.end);
  weekEnd.setHours(23, 59, 59, 999);

  const result = {};
  for (const measure of measures) {
    const candidates = (measure.history || []).filter(h => new Date(h.date) <= weekEnd);
    result[measure.metric] = candidates.length ? parseFloat(candidates[candidates.length - 1].value) : null;
  }

  // Log which date was used (using coverage as representative)
  const coverageMeasure = measures.find(m => m.metric === 'coverage');
  if (coverageMeasure) {
    const candidates = (coverageMeasure.history || []).filter(h => new Date(h.date) <= weekEnd);
    if (candidates.length > 0) {
      const usedDate = new Date(candidates[candidates.length - 1].date).toISOString().split('T')[0];
      console.log(`    Using SonarCloud analysis from: ${usedDate}`);
    }
  }

  const hasAnyData = Object.values(result).some(v => v !== null);
  return hasAnyData ? result : null;
}

// ─── Preserved sonar data (fallback when API returns null for old weeks) ───────
// Priority: weeklyData.json -> output/sonar.json
function loadPreservedSonarData() {
  const sources = [];
  const weeklyJsonPath = path.join(__dirname, '../data/weeklyData.json');
  const sonarJsonPath = path.join(__dirname, '../output/sonar.json');

  if (fs.existsSync(weeklyJsonPath)) {
    try { sources.push(JSON.parse(fs.readFileSync(weeklyJsonPath, 'utf8')).weeklyData || []); } catch (e) {}
  }
  if (fs.existsSync(sonarJsonPath)) {
    try { sources.push(JSON.parse(fs.readFileSync(sonarJsonPath, 'utf8')).weeks || []); } catch (e) {}
  }

  const sonarFields = ['testCoverage', 'cves', 'duplicatedLines', 'maintainability', 'reliability', 'security', 'bugs', 'codeSmells'];
  const bestData = {};
  for (const source of sources) {
    for (const entry of source) {
      if (!entry.week) continue;
      if (!bestData[entry.week]) bestData[entry.week] = {};
      for (const field of sonarFields) {
        if (entry[field] != null && bestData[entry.week][field] == null) {
          bestData[entry.week][field] = entry[field];
        }
      }
    }
  }
  return bestData;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
console.log('='.repeat(80));
console.log('COLLECTING SONARCLOUD METRICS');
console.log('='.repeat(80));
console.log();

const preservedSonarData = loadPreservedSonarData();
const sonarMetrics = [];

for (const week of generateWeeks()) {
  console.log(`Processing ${week.name} (${week.period})...`);

  const raw = getSonarMetricsForWeek(week);
  const p = preservedSonarData[week.name] || {};

  const metrics = {
    testCoverage:    (raw?.coverage               ?? null) ?? p.testCoverage    ?? null,
    cves:            (raw?.vulnerabilities          ?? null) ?? p.cves            ?? null,
    duplicatedLines: (raw?.duplicated_lines_density ?? null) ?? p.duplicatedLines ?? null,
    maintainability: (raw?.sqale_rating             ?? null) ?? p.maintainability ?? null,
    reliability:     (raw?.reliability_rating       ?? null) ?? p.reliability     ?? null,
    security:        (raw?.security_rating          ?? null) ?? p.security        ?? null,
    bugs:            (raw?.bugs                     ?? null) ?? p.bugs            ?? null,
    codeSmells:      (raw?.code_smells              ?? null) ?? p.codeSmells      ?? null
  };

  const source = raw ? '✓ Branch API' : '↩ Preserved';
  sonarMetrics.push({ week: week.name, period: week.period, ...metrics });
  console.log(`  ${source}: Coverage ${metrics.testCoverage ? metrics.testCoverage.toFixed(1) : 'N/A'}%, CVEs: ${metrics.cves ?? 'N/A'}`);
}

const outputDir = path.join(__dirname, '../output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

fs.writeFileSync(
  path.join(outputDir, 'sonar.json'),
  JSON.stringify({ weeks: sonarMetrics }, null, 2)
);

console.log();
console.log('✓ SonarCloud metrics saved to output/sonar.json');
console.log('='.repeat(80));
