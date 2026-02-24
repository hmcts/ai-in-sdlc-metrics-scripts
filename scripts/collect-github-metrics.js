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
const REPO = 'hmcts/cath-service';

const EXCLUDED_DEVELOPERS = ['linosnort', 'linus-norton', 'linusnorton', 'ashwini-mv', 'melvchance', 'jla1002'];

const EXCLUDED_TICKETS = [
  'VIBE-207','VIBE-163','VIBE-164','VIBE-165','VIBE-170','VIBE-171','VIBE-172','VIBE-173',
  'VIBE-176','VIBE-182','VIBE-193','VIBE-194','VIBE-197','VIBE-198','VIBE-211','VIBE-212',
  'VIBE-213','VIBE-217','VIBE-218'
];

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

// ─── PR filtering helpers ──────────────────────────────────────────────────────
function extractJiraTicket(text) {
  if (!text) return null;
  const m = text.match(/([A-Z]+-\d+)/);
  return m ? m[1] : null;
}

function isDependencyUpdate(title) {
  if (!title) return false;
  const lower = title.toLowerCase();
  return lower.includes('update dependency') || lower.includes('update prisma') ||
         lower.includes('update vitest') || lower.includes('update node.js') ||
         lower.includes('update github') || lower.includes('update actions/');
}

function filterPRsForWeek(allPRs, week) {
  const startDate = new Date(week.start);
  const endDate = new Date(week.end);
  endDate.setHours(23, 59, 59, 999);

  return allPRs.filter(pr => {
    const createdAt = pr.createdAt ? new Date(pr.createdAt) : null;
    if (!createdAt || createdAt < startDate || createdAt > endDate) return false;
    if (pr.author && pr.author.is_bot) return false;
    if (isDependencyUpdate(pr.title)) return false;
    if (EXCLUDED_TICKETS.some(t => (pr.title || '').includes(t))) return false;
    if (pr.author && EXCLUDED_DEVELOPERS.some(e => (pr.author.login || '').toLowerCase().includes(e))) return false;
    if (!extractJiraTicket(pr.title)) return false;
    return pr.state === 'MERGED';
  });
}

function calculateLocPerDev(prs) {
  const devLOC = {};
  prs.forEach(pr => {
    const login = pr.author.login;
    const loc = (pr.additions || 0) + (pr.deletions || 0);
    if (!devLOC[login]) devLOC[login] = 0;
    devLOC[login] += loc;
  });
  const devCount = Object.keys(devLOC).length;
  const totalLOC = Object.values(devLOC).reduce((s, v) => s + v, 0);
  return { devCount, avgLOCPerDev: devCount > 0 ? Math.round(totalLOC / devCount) : 0 };
}

function fetchPRDetails(prNumber) {
  try {
    return JSON.parse(execSync(
      `gh pr view ${prNumber} --repo ${REPO} --json number,title,author,comments,reviews,state,additions,deletions`,
      { encoding: 'utf8' }
    ));
  } catch { return null; }
}

function countDeveloperComments(pr) {
  const bots = ['coderabbitai', 'github-actions', 'dependabot', 'renovate'];
  const notBot = a => !a.is_bot && !bots.some(b => (a.login || '').toLowerCase().includes(b));
  const commentCount = (pr.comments || []).filter(c => notBot(c.author)).length;
  const reviewCount = (pr.reviews || []).filter(r => notBot(r.author) && r.body && r.body.trim()).length;
  return commentCount + reviewCount;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
console.log('='.repeat(80));
console.log('COLLECTING GITHUB METRICS');
console.log('='.repeat(80));
console.log();

console.log('  Fetching PRs from GitHub...');
const allPRs = JSON.parse(execSync(
  `gh pr list --repo ${REPO} --search "created:>=${generateWeeks()[0].start}" --limit 500 --json number,title,state,author,createdAt,mergedAt,additions,deletions --state all`,
  { encoding: 'utf8' }
));
console.log(`  Fetched ${allPRs.length} total PRs`);
console.log();

const githubMetrics = [];

for (const week of generateWeeks()) {
  console.log(`Processing ${week.name} (${week.period})...`);

  const featurePRs = filterPRsForWeek(allPRs, week);

  if (featurePRs.length === 0) {
    githubMetrics.push({
      week: week.name, period: week.period,
      featurePRs: 0, locPerPR: null, locPerDev: 0, commentsPerPR: null,
      prTickets: [], prDates: []
    });
    console.log(`  ✓ No PRs this week`);
    continue;
  }

  const locMetrics = calculateLocPerDev(featurePRs);
  const totalLOC = featurePRs.reduce((s, pr) => s + (pr.additions || 0) + (pr.deletions || 0), 0);
  const avgLocPerPR = Math.round(totalLOC / featurePRs.length);

  const commentCounts = featurePRs.map(pr => {
    const detail = fetchPRDetails(pr.number);
    return detail ? countDeveloperComments(detail) : null;
  }).filter(c => c !== null);

  const avgComments = commentCounts.length > 0
    ? parseFloat((commentCounts.reduce((s, c) => s + c, 0) / commentCounts.length).toFixed(2))
    : null;

  // prTickets and prDates are passed to jira script to avoid duplicate GitHub API calls
  const prTickets = featurePRs.map(pr => extractJiraTicket(pr.title)).filter(Boolean);
  const prDates = featurePRs.map(pr => ({ createdAt: pr.createdAt, mergedAt: pr.mergedAt }));

  githubMetrics.push({
    week: week.name, period: week.period,
    featurePRs: featurePRs.length,
    locPerPR: avgLocPerPR,
    locPerDev: locMetrics.avgLOCPerDev,
    commentsPerPR: avgComments,
    prTickets,
    prDates
  });

  console.log(`  ✓ ${featurePRs.length} PRs, ${locMetrics.avgLOCPerDev} LOC/dev`);
}

const outputDir = path.join(__dirname, '../output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

fs.writeFileSync(
  path.join(outputDir, 'github.json'),
  JSON.stringify({ weeks: githubMetrics }, null, 2)
);

console.log();
console.log('✓ GitHub metrics saved to output/github.json');
console.log('='.repeat(80));
