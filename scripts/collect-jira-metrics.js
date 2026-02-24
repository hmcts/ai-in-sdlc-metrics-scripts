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
const JIRA_TOKEN = process.env.JIRA_TOKEN;
const JIRA_BASE = 'https://tools.hmcts.net/jira/rest/api/2';

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

// ─── NK/T helpers ─────────────────────────────────────────────────────────────
function calculateBusinessDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function calculateNKT(prDates) {
  if (!prDates || prDates.length === 0) return { nkt: null, cycleTime: null };

  const cycleTimes = prDates
    .filter(pr => pr.mergedAt)
    .map(pr => calculateBusinessDays(new Date(pr.createdAt), new Date(pr.mergedAt)));

  const avgCycleTime = cycleTimes.length > 0
    ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
    : null;

  const N = 13, K = 1, T = avgCycleTime || 1;
  return {
    nkt: parseFloat(((N * K) / T).toFixed(2)),
    cycleTime: avgCycleTime ? parseFloat(avgCycleTime.toFixed(2)) : null
  };
}

// ─── JIRA API helpers ─────────────────────────────────────────────────────────
function getStoryPoints(ticketId) {
  if (!JIRA_TOKEN) return null;
  try {
    const url = `${JIRA_BASE}/issue/${ticketId}?fields=customfield_10004,summary,status`;
    const response = execSync(
      `curl -s -H "Authorization: Bearer ${JIRA_TOKEN}" "${url}"`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    const data = JSON.parse(response);
    return data.fields?.customfield_10004 || null;
  } catch { return null; }
}

function getStoryPointsForTickets(ticketIds) {
  let total = 0;
  ticketIds.forEach((id, i) => {
    const sp = getStoryPoints(id);
    if (sp) total += sp;
    if (i < ticketIds.length - 1) execSync('sleep 0.2');
  });
  return total;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
console.log('='.repeat(80));
console.log('COLLECTING JIRA/NK/T METRICS');
console.log('='.repeat(80));
console.log();

const WEEKS = generateWeeks();

// Read prTickets and prDates from github.json (set by collect-github-metrics.js)
const githubPath = path.join(__dirname, '../output/github.json');
if (!fs.existsSync(githubPath)) {
  console.error('ERROR: output/github.json not found. Run collect-github-metrics.js first.');
  process.exit(1);
}
const githubData = JSON.parse(fs.readFileSync(githubPath, 'utf8'));

const jiraMetrics = [];

for (let i = 0; i < WEEKS.length; i++) {
  const week = WEEKS[i];
  const githubWeek = githubData.weeks[i] || {};
  const prTickets = githubWeek.prTickets || [];
  const prDates = githubWeek.prDates || [];

  console.log(`Processing ${week.name} (${week.period})...`);

  const storyPoints = prTickets.length > 0 ? getStoryPointsForTickets(prTickets) : 0;
  const nktData = calculateNKT(prDates);

  jiraMetrics.push({
    week: week.name, period: week.period,
    storyPoints: storyPoints || null,
    wipSP: null,
    nkt: nktData.nkt,
    cycleTime: nktData.cycleTime
  });

  console.log(`  ✓ ${storyPoints || 'N/A'} SPs, NK/T: ${nktData.nkt ? nktData.nkt.toFixed(2) : 'N/A'}`);
}

const outputDir = path.join(__dirname, '../output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

fs.writeFileSync(
  path.join(outputDir, 'jira.json'),
  JSON.stringify({ weeks: jiraMetrics }, null, 2)
);

console.log();
console.log('✓ JIRA/NK/T metrics saved to output/jira.json');
console.log('='.repeat(80));
