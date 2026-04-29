const https = require('https');
const { writeBlob } = require('./blobStorage');

const REPO = 'hmcts/cath-service';
const CUTOVER_DATE = '2026-02-02'; // Week 18 — JIRA decommissioned, switch to GitHub Projects
const EXCLUDED_DEVELOPERS = ['linosnort', 'linus-norton', 'linusnorton', 'ashwini-mv', 'melvchance', 'jla1002', 'sarahlittlejohn'];
const EXCLUDED_TICKETS = [
  'VIBE-207','VIBE-163','VIBE-164','VIBE-165','VIBE-170','VIBE-171','VIBE-172','VIBE-173',
  'VIBE-176','VIBE-182','VIBE-193','VIBE-194','VIBE-197','VIBE-198','VIBE-211','VIBE-212',
  'VIBE-213','VIBE-217','VIBE-218'
];

// ─── Week generation ──────────────────────────────────────────────────────────
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
  const daysToFriday = (5 - weekStart.getDay() + 7) % 7;
  let weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + daysToFriday);
  let weekNum = 1;
  while (weekStart <= today) {
    weeks.push({ name: `Week ${weekNum}`, start: formatDate(weekStart), end: formatDate(weekEnd), period: formatPeriod(weekStart, weekEnd) });
    weekNum++;
    weekStart = new Date(weekEnd); weekStart.setDate(weekStart.getDate() + 3);
    weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 4);
  }
  return weeks;
}

// ─── GitHub REST API helpers ──────────────────────────────────────────────────
function githubGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'User-Agent': 'empirical-metrics-bot',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`GitHub ${path} → ${res.statusCode}: ${body.slice(0, 200)}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchAllPRs(since) {
  const all = [];
  let page = 1;
  while (true) {
    const prs = await githubGet(`/repos/${REPO}/pulls?state=closed&per_page=100&page=${page}&sort=created&direction=asc`);
    if (!prs.length) break;
    for (const pr of prs) {
      if (new Date(pr.created_at) < new Date(since)) continue;
      all.push(pr);
    }
    if (prs.length < 100) break;
    page++;
  }
  return all;
}

async function fetchPRDetail(number) {
  try { return await githubGet(`/repos/${REPO}/pulls/${number}`); } catch { return null; }
}

async function fetchPRReviews(number) {
  try { return await githubGet(`/repos/${REPO}/pulls/${number}/reviews`); } catch { return []; }
}

async function fetchPRComments(number) {
  try { return await githubGet(`/repos/${REPO}/issues/${number}/comments`); } catch { return []; }
}

async function fetchPRCommits(number) {
  try { return await githubGet(`/repos/${REPO}/pulls/${number}/commits?per_page=100`); } catch { return []; }
}

async function fetchCheckRuns(sha) {
  try {
    const res = await githubGet(`/repos/${REPO}/commits/${sha}/check-runs?per_page=100`);
    return res.check_runs || [];
  } catch { return []; }
}

// Checks that are never meaningful for build pass/fail on this repo
const SKIPPED_CHECK_NAMES = /^claude(-ready|-spec|-plan|-analyse)?$/i;

function relevantRuns(runs) {
  return runs.filter(r =>
    r.status === 'completed' &&
    !SKIPPED_CHECK_NAMES.test(r.name) &&
    r.conclusion !== 'skipped' &&
    r.conclusion !== 'neutral' &&
    r.conclusion !== 'cancelled'
  );
}

// Returns { ciFixRounds, firstFailureTs, firstPassTs } for a PR.
// ciFixRounds = index of first fully-passing commit (0 = passed first time).
// firstFailureTs = completed_at of the earliest failing check run across all commits before the pass.
// firstPassTs = completed_at of the last check run on the first fully-passing commit.
async function fetchPRCiData(number) {
  const commits = await fetchPRCommits(number);
  if (!Array.isArray(commits) || !commits.length) return null;

  let firstFailureTs = null;

  for (let i = 0; i < commits.length; i++) {
    const runs = relevantRuns(await fetchCheckRuns(commits[i].sha));
    if (runs.length === 0) continue;

    if (runs.every(r => r.conclusion === 'success')) {
      const firstPassTs = runs
        .map(r => r.completed_at ? new Date(r.completed_at).getTime() : null)
        .filter(Boolean)
        .reduce((max, t) => Math.max(max, t), 0) || null;
      return { ciFixRounds: i, firstFailureTs, firstPassTs };
    }

    // Track earliest failure timestamp across pre-pass commits
    for (const r of runs) {
      if (r.conclusion === 'failure' && r.completed_at) {
        const ts = new Date(r.completed_at).getTime();
        if (firstFailureTs === null || ts < firstFailureTs) firstFailureTs = ts;
      }
    }
  }
  return null;
}

// ─── PR filtering helpers ─────────────────────────────────────────────────────
function extractJiraTicket(text) {
  if (!text) return null;
  const m = text.match(/([A-Z]+-\d+)/);
  return m ? m[1] : null;
}

function extractLinkedIssueNumber(body) {
  if (!body) return null;
  const m = body.match(/(?:closes?|fixes?|resolves?)\s+#(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function isDependencyUpdate(title) {
  if (!title) return false;
  const lower = title.toLowerCase();
  return lower.includes('update dependency') || lower.includes('update prisma') ||
         lower.includes('update vitest') || lower.includes('update node.js') ||
         lower.includes('update github') || lower.includes('update actions/');
}

function isBot(user) {
  return user && (user.type === 'Bot' || (user.login || '').toLowerCase().includes('[bot]'));
}

function filterPRsForWeek(allPRs, week) {
  const startDate = new Date(week.start);
  const endDate = new Date(week.end);
  endDate.setHours(23, 59, 59, 999);
  const isPostCutover = week.start >= CUTOVER_DATE;
  return allPRs.filter(pr => {
    const createdAt = pr.created_at ? new Date(pr.created_at) : null;
    if (!createdAt || createdAt < startDate || createdAt > endDate) return false;
    if (isBot(pr.user)) return false;
    if (isDependencyUpdate(pr.title)) return false;
    if (EXCLUDED_TICKETS.some(t => (pr.title || '').includes(t))) return false;
    if (EXCLUDED_DEVELOPERS.some(e => (pr.user?.login || '').toLowerCase().includes(e))) return false;
    // Pre-cutover: require VIBE ID in title (historical consistency)
    // Post-cutover: include all feature PRs regardless of ticket format
    if (!isPostCutover && !extractJiraTicket(pr.title)) return false;
    return pr.merged_at !== null;
  });
}

function calculateLocPerDev(prs) {
  const devLOC = {};
  prs.forEach(pr => {
    const login = pr.user.login;
    const loc = (pr.additions || 0) + (pr.deletions || 0);
    if (!devLOC[login]) devLOC[login] = 0;
    devLOC[login] += loc;
  });
  const devCount = Object.keys(devLOC).length;
  const totalLOC = Object.values(devLOC).reduce((s, v) => s + v, 0);
  return { devCount, avgLOCPerDev: devCount > 0 ? Math.round(totalLOC / devCount) : 0 };
}

function countDeveloperComments(reviews, comments) {
  const bots = ['coderabbitai', 'github-actions', 'dependabot', 'renovate'];
  const notBot = u => !isBot(u) && !bots.some(b => (u?.login || '').toLowerCase().includes(b));
  const reviewCount = (reviews || []).filter(r => notBot(r.user) && r.body && r.body.trim()).length;
  const commentCount = (comments || []).filter(c => notBot(c.user)).length;
  return reviewCount + commentCount;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function collect(context) {
  context.log('--- GitHub metrics ---');
  const weeks = generateWeeks();

  context.log('  Fetching PRs from GitHub REST API...');
  const allPRs = await fetchAllPRs(weeks[0].start);
  context.log(`  Fetched ${allPRs.length} total closed PRs`);

  const githubMetrics = [];

  for (const week of weeks) {
    const featurePRs = filterPRsForWeek(allPRs, week);

    if (featurePRs.length === 0) {
      githubMetrics.push({ week: week.name, period: week.period, featurePRs: 0, locPerPR: null, locPerDev: 0, commentsPerPR: null, prTickets: [], prDates: [] });
      continue;
    }

    // Fetch individual PR details for additions/deletions + reviews/comments
    const detailed = await Promise.all(featurePRs.map(async pr => {
      const [detail, reviews, comments] = await Promise.all([
        fetchPRDetail(pr.number),
        fetchPRReviews(pr.number),
        fetchPRComments(pr.number)
      ]);
      return { ...pr, additions: detail?.additions || 0, deletions: detail?.deletions || 0, reviews, comments };
    }));

    const locMetrics = calculateLocPerDev(detailed);
    const totalLOC = detailed.reduce((s, pr) => s + (pr.additions || 0) + (pr.deletions || 0), 0);
    const avgLocPerPR = Math.round(totalLOC / detailed.length);
    const commentCounts = detailed.map(pr => countDeveloperComments(pr.reviews, pr.comments));
    const avgComments = parseFloat((commentCounts.reduce((s, c) => s + c, 0) / commentCounts.length).toFixed(2));

    const ciData = await Promise.all(detailed.map(pr => fetchPRCiData(pr.number)));
    const validRounds = ciData.filter(d => d !== null).map(d => d.ciFixRounds);
    const avgCiFixRounds = validRounds.length > 0
      ? parseFloat((validRounds.reduce((s, r) => s + r, 0) / validRounds.length).toFixed(2))
      : null;

    const prTickets = detailed.map(pr => extractJiraTicket(pr.title)).filter(Boolean);
    const prDates = detailed.map(pr => ({ createdAt: pr.created_at, mergedAt: pr.merged_at }));
    const prIssueNumbers = week.start >= CUTOVER_DATE
      ? detailed.map(pr => extractLinkedIssueNumber(pr.body)).filter(Boolean)
      : [];
    const prNumbers = week.start >= CUTOVER_DATE
      ? detailed.map(pr => pr.number)
      : [];

    // CI windows for prompts-to-pass-build join in merge.js — only PRs with a failure
    const prCiWindows = detailed
      .map((pr, i) => {
        const d = ciData[i];
        if (!d || d.firstFailureTs === null) return null;
        return { ticket: extractJiraTicket(pr.title), firstFailureTs: d.firstFailureTs, firstPassTs: d.firstPassTs };
      })
      .filter(Boolean);

    githubMetrics.push({ week: week.name, period: week.period, weekStart: week.start, weekEnd: week.end, featurePRs: detailed.length, locPerPR: avgLocPerPR, locPerDev: locMetrics.avgLOCPerDev, devCount: locMetrics.devCount, commentsPerPR: avgComments, avgCiFixRounds, prTickets, prIssueNumbers, prNumbers, prDates, prCiWindows });
    context.log(`  ${week.name}: ${detailed.length} PRs, ${locMetrics.avgLOCPerDev} LOC/dev, avgCiFixRounds=${avgCiFixRounds}`);
  }

  await writeBlob('output/github.json', { weeks: githubMetrics });
  context.log('  ✓ output/github.json written');
}

module.exports = { collect };
