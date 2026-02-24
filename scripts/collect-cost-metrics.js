#!/usr/bin/env node

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
const BEDROCK_COSTS_FILE = process.env.BEDROCK_COSTS_FILE ||
  path.join(__dirname, '../data/Costs/merged-bedrock-costs.csv');

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

// ─── Bedrock CSV parser ────────────────────────────────────────────────────────
function parseBedrockCosts() {
  if (!fs.existsSync(BEDROCK_COSTS_FILE)) {
    console.log(`  ⚠ Bedrock costs file not found: ${BEDROCK_COSTS_FILE}`);
    return [];
  }

  try {
    const content = fs.readFileSync(BEDROCK_COSTS_FILE, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, ''));
    const claudeSonnetIdx = headers.findIndex(h => h.includes('Claude Sonnet 4'));
    const claudeHaiku3Idx = headers.findIndex(h => h.includes('Claude 3 Haiku'));
    const claudeHaiku4Idx = headers.findIndex(h => h.includes('Claude Haiku 4'));
    const totalCostIdx = headers.findIndex(h => h.includes('Total costs'));

    const costs = [];
    for (let i = 2; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.replace(/^"|"$/g, ''));
      if (values.length < 2) continue;
      const dateStr = values[0];
      if (!dateStr || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) continue;

      const claudeCost =
        (parseFloat(values[claudeSonnetIdx]) || 0) +
        (claudeHaiku3Idx >= 0 ? parseFloat(values[claudeHaiku3Idx]) || 0 : 0) +
        (claudeHaiku4Idx >= 0 ? parseFloat(values[claudeHaiku4Idx]) || 0 : 0);

      costs.push({ date: new Date(dateStr), claudeCost });
    }
    return costs;
  } catch (error) {
    console.error(`  ⚠ Error parsing Bedrock costs: ${error.message}`);
    return [];
  }
}

function getCostsForWeek(week, allCosts) {
  if (allCosts.length === 0) return null;

  const startDate = new Date(week.start);
  const endDate = new Date(week.end);
  endDate.setHours(23, 59, 59, 999);

  const weekCost = allCosts
    .filter(e => e.date >= startDate && e.date <= endDate)
    .reduce((sum, e) => sum + e.claudeCost, 0);

  return weekCost > 0 ? parseFloat(weekCost.toFixed(2)) : null;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
console.log('='.repeat(80));
console.log('COLLECTING COST METRICS');
console.log('='.repeat(80));
console.log();

const allCosts = parseBedrockCosts();
console.log(`  Loaded ${allCosts.length} cost entries from CSV`);
console.log();

const costMetrics = [];

for (const week of generateWeeks()) {
  console.log(`Processing ${week.name} (${week.period})...`);

  const totalCost = getCostsForWeek(week, allCosts);

  costMetrics.push({
    week: week.name,
    period: week.period,
    totalCost
  });

  console.log(`  ✓ Total cost: $${totalCost ? totalCost.toFixed(2) : 'N/A'}`);
}

const outputDir = path.join(__dirname, '../output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

fs.writeFileSync(
  path.join(outputDir, 'cost.json'),
  JSON.stringify({ weeks: costMetrics }, null, 2)
);

console.log();
console.log('✓ Cost metrics saved to output/cost.json');
console.log('='.repeat(80));
