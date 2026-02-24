#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

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
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR ||
  path.join(__dirname, '../data/transcripts/files');

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

// ─── Shared helpers ────────────────────────────────────────────────────────────
function isInWeek(timestamp, week) {
  const date = new Date(timestamp);
  const startDate = new Date(week.start);
  const endDate = new Date(week.end);
  endDate.setHours(23, 59, 59, 999);
  return date >= startDate && date <= endDate;
}

function findFiles(dir, extension) {
  const files = [];
  function traverse(p) {
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const fp = path.join(p, entry.name);
      if (entry.isDirectory()) traverse(fp);
      else if (entry.name.endsWith(extension)) files.push(fp);
    }
  }
  traverse(dir);
  return files;
}

function readJSONL(filePath) {
  return fs.readFileSync(filePath, 'utf-8').trim().split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter(c => c.type === 'text').map(c => c.text).join(' ');
  return '';
}

// ─── Compaction analysis ───────────────────────────────────────────────────────
function detectCompaction(entry) {
  if (entry.type === 'compaction' || entry.type === 'system') {
    return { type: 'automatic', timestamp: entry.timestamp };
  }
  if (!entry.message?.content) return null;

  const text = extractTextContent(entry.message.content).toLowerCase();
  if (!text) return null;

  if (/\/compact|compact history|manually compact|compress context|compress conversation/i.test(text))
    return { type: 'manual', timestamp: entry.timestamp };
  if (/context window.*exceeded|automatically compacting|auto.*compact|compaction.*triggered/i.test(text))
    return { type: 'automatic', timestamp: entry.timestamp };
  return null;
}

function analyzeCompactionsForWeek(week) {
  if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    return { manualCompactions: 0, autoCompactions: 0, avgTimeToContextWindow: null };
  }

  const files = findFiles(TRANSCRIPTS_DIR, '.jsonl');
  let manualCompactions = 0, autoCompactions = 0;
  const sessionMessages = {}, firstCompactions = {};

  for (const filePath of files) {
    for (const entry of readJSONL(filePath)) {
      if (!entry.sessionId || !entry.timestamp) continue;
      if (!isInWeek(entry.timestamp, week)) continue;

      if (!sessionMessages[entry.sessionId]) sessionMessages[entry.sessionId] = [];
      sessionMessages[entry.sessionId].push({
        timestamp: new Date(entry.timestamp).getTime(),
        role: entry.role
      });

      const comp = detectCompaction(entry);
      if (comp) {
        if (comp.type === 'manual') manualCompactions++;
        else autoCompactions++;
        if (!firstCompactions[entry.sessionId]) {
          firstCompactions[entry.sessionId] = new Date(entry.timestamp).getTime();
        }
      }
    }
  }

  const times = [];
  for (const [sessionId, compTime] of Object.entries(firstCompactions)) {
    const messages = (sessionMessages[sessionId] || []).sort((a, b) => a.timestamp - b.timestamp);
    if (!messages.length) continue;
    let activeTime = 0;
    for (let i = 1; i < messages.length; i++) {
      const gap = messages[i].timestamp - messages[i - 1].timestamp;
      if (gap < 30 * 60 * 1000) activeTime += gap;
      if (messages[i].timestamp >= compTime) break;
    }
    times.push(activeTime / (1000 * 60));
  }

  return {
    manualCompactions,
    autoCompactions,
    avgTimeToContextWindow: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : null
  };
}

// ─── Prompt category analysis ─────────────────────────────────────────────────
const CATEGORIES = {
  feature_development: /implement|add feature|create|build|develop|new feature/i,
  bug_fix:             /fix|bug|error|issue|problem|broken|debug/i,
  testing:             /test|spec|jest|playwright|unit test|e2e|integration test/i,
  refactoring:         /refactor|reorganize|restructure|clean up|improve code/i,
  documentation:       /document|readme|comment|doc|explain|describe/i,
  code_review:         /review|check|validate|verify|examine/i,
  code_understanding:  /how does|what does|explain|understand|clarify/i,
  version_control:     /commit|push|pull|merge|branch|git/i,
  configuration:       /config|setup|install|configure|environment/i,
  general:             /.*/
};

const FILTER_PATTERNS = [
  /^(yes|no|ok|okay|thanks|thank you|sure|proceed|continue|carry on)$/i,
  /^(hello|hi|hey)$/i,
  /claude (--version|hooks?|marketplace|settings)/i,
  /slash command/i,
  /summarise? the/i
];

function classifyPrompt(text) {
  if (!text || typeof text !== 'string') return 'general';
  for (const [cat, pat] of Object.entries(CATEGORIES)) {
    if (cat === 'general') continue;
    if (pat.test(text)) return cat;
  }
  return 'general';
}

function analyzePromptCategoriesForWeek(week) {
  if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    return { totalPrompts: 0, avgPromptLength: 0, topCategory: null, topCategoryCount: 0,
             topSubcategory: null, topSubcategoryCount: 0, promptCategories: {} };
  }

  const files = findFiles(TRANSCRIPTS_DIR, '.jsonl');
  const categoryCount = {};
  const promptLengths = [];
  let totalPrompts = 0;

  for (const filePath of files) {
    for (const entry of readJSONL(filePath)) {
      if (!entry.timestamp || !isInWeek(entry.timestamp, week)) continue;
      if (!entry.message || entry.message.role !== 'user' || !entry.message.content) continue;

      const textContent = extractTextContent(entry.message.content);
      if (!textContent || textContent.trim().length === 0 || textContent === 'Warmup') continue;

      if (textContent.includes('<command-name>') || textContent.includes('<local-command-stdout>') ||
          textContent.includes('[Request interrupted') || textContent.includes('<command-message>') ||
          textContent.includes('Caveat: The messages below were generated by the user')) continue;

      if (textContent.trim().length < 30) continue;
      if (FILTER_PATTERNS.some(p => p.test(textContent.trim()))) continue;

      totalPrompts++;
      promptLengths.push(textContent.length);
      const cat = classifyPrompt(textContent);
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    }
  }

  const avgPromptLength = promptLengths.length > 0
    ? Math.round(promptLengths.reduce((a, b) => a + b, 0) / promptLengths.length)
    : 0;

  let topCategory = null, topCategoryCount = 0;
  for (const [cat, count] of Object.entries(categoryCount)) {
    if (count > topCategoryCount) { topCategory = cat; topCategoryCount = count; }
  }

  const promptCategories = {};
  for (const [cat, count] of Object.entries(categoryCount)) promptCategories[cat] = { count };

  return { totalPrompts, avgPromptLength, topCategory, topCategoryCount,
           topSubcategory: null, topSubcategoryCount: 0, promptCategories };
}

// ─── Interruption metrics ─────────────────────────────────────────────────────
async function analyzeFileForInterruptions(filePath, startDate, endDate) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
  let interruptions = 0, toolUses = 0, toolErrors = 0, prompts = 0;
  const seenIds = new Set();

  for await (const line of rl) {
    try {
      const entry = JSON.parse(line);
      if (entry.timestamp) {
        const d = new Date(entry.timestamp);
        if (d < startDate || d > endDate) continue;
      }

      if (entry.message?.role === 'user' && entry.uuid && !seenIds.has(entry.uuid)) {
        seenIds.add(entry.uuid);
        const text = extractTextContent(entry.message.content);
        if (text && text.trim().length > 0 && text !== 'Warmup') prompts++;
      }

      if (entry.type === 'user' && entry.message?.content) {
        const content = entry.message.content;
        const hasInterrupt = t => t && (
          t.includes('[Request interrupted by user]') ||
          t.includes('[Request interrupted by user for tool use]')
        );
        if (typeof content === 'string' && hasInterrupt(content)) interruptions++;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'text' && hasInterrupt(item.text)) { interruptions++; break; }
          }
        }
      }

      if (entry.message?.content) {
        const content = Array.isArray(entry.message.content)
          ? entry.message.content : [entry.message.content];
        for (const item of content) {
          if (item.type === 'tool_use') toolUses++;
          if (item.type === 'tool_result' && item.is_error) toolErrors++;
        }
      }
    } catch { /* skip */ }
  }

  return { interruptions, toolUses, toolErrors, prompts };
}

async function calculateInterruptionsForWeek(week) {
  const startDate = new Date(week.start);
  const endDate = new Date(week.end);
  endDate.setHours(23, 59, 59, 999);

  if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    return { interruptions: 0, toolUses: 0, toolErrors: 0, prompts: 0, interruptionRate: 0, errorRate: 0 };
  }

  let totalInterruptions = 0, totalToolUses = 0, totalToolErrors = 0, totalPrompts = 0;

  const entries = fs.readdirSync(TRANSCRIPTS_DIR, { withFileTypes: true });
  let workspaceDirs = [];

  if (entries[0]?.isDirectory() && entries[0].name.startsWith('-')) {
    workspaceDirs = entries.filter(d => d.isDirectory()).map(d => path.join(TRANSCRIPTS_DIR, d.name));
  } else {
    const devDirs = entries.filter(d => d.isDirectory()).map(d => path.join(TRANSCRIPTS_DIR, d.name));
    for (const devDir of devDirs) {
      workspaceDirs.push(...fs.readdirSync(devDir, { withFileTypes: true })
        .filter(d => d.isDirectory()).map(d => path.join(devDir, d.name)));
    }
  }

  for (const wsDir of workspaceDirs) {
    const files = fs.readdirSync(wsDir).filter(f => f.endsWith('.jsonl')).map(f => path.join(wsDir, f));
    for (const file of files) {
      try {
        const m = await analyzeFileForInterruptions(file, startDate, endDate);
        if (m.toolUses > 0 || m.interruptions > 0 || m.prompts > 0) {
          totalInterruptions += m.interruptions;
          totalToolUses += m.toolUses;
          totalToolErrors += m.toolErrors;
          totalPrompts += m.prompts;
        }
      } catch { /* skip */ }
    }
  }

  return {
    interruptions: totalInterruptions,
    toolUses: totalToolUses,
    toolErrors: totalToolErrors,
    prompts: totalPrompts,
    interruptionRate: totalPrompts > 0 ? parseFloat((totalInterruptions / totalPrompts * 100).toFixed(2)) : 0,
    errorRate: totalToolUses > 0 ? parseFloat((totalToolErrors / totalToolUses * 100).toFixed(2)) : 0
  };
}

// ─── Token breakdown ──────────────────────────────────────────────────────────
async function processFileForTokens(filePath, week) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  const totals = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };

  for await (const line of rl) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'assistant' && entry.message?.usage && isInWeek(entry.timestamp, week)) {
        const u = entry.message.usage;
        totals.input_tokens += u.input_tokens || 0;
        totals.cache_creation_input_tokens += u.cache_creation_input_tokens || 0;
        totals.cache_read_input_tokens += u.cache_read_input_tokens || 0;
        totals.output_tokens += u.output_tokens || 0;
      }
    } catch { /* skip */ }
  }
  return totals;
}

async function calculateTokenBreakdownForWeek(week) {
  if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    return { inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  // Filter out agent- prefixed files (sub-agent transcripts, not user sessions)
  const files = findFiles(TRANSCRIPTS_DIR, '.jsonl').filter(f => !path.basename(f).startsWith('agent-'));
  const totals = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };

  for (const file of files) {
    const t = await processFileForTokens(file, week);
    totals.input_tokens += t.input_tokens;
    totals.cache_creation_input_tokens += t.cache_creation_input_tokens;
    totals.cache_read_input_tokens += t.cache_read_input_tokens;
    totals.output_tokens += t.output_tokens;
  }

  return {
    inputTokens: totals.input_tokens,
    cacheCreationTokens: totals.cache_creation_input_tokens,
    cacheReadTokens: totals.cache_read_input_tokens,
    outputTokens: totals.output_tokens,
    totalTokens: totals.input_tokens + totals.cache_creation_input_tokens +
                 totals.cache_read_input_tokens + totals.output_tokens
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────────
console.log('='.repeat(80));
console.log('COLLECTING TRANSCRIPT METRICS');
console.log('='.repeat(80));
console.log();

async function collectMetrics() {
  const transcriptMetrics = [];

  for (const week of generateWeeks()) {
    console.log(`Processing ${week.name} (${week.period})...`);

    const compactions = analyzeCompactionsForWeek(week);
    const categories = analyzePromptCategoriesForWeek(week);
    const interruptions = await calculateInterruptionsForWeek(week);
    const tokens = await calculateTokenBreakdownForWeek(week);

    transcriptMetrics.push({
      week: week.name,
      period: week.period,

      // Compactions
      manualCompactions: compactions.manualCompactions,
      autoCompactions: compactions.autoCompactions,
      avgTimeToContextWindow: compactions.avgTimeToContextWindow,

      // Categories
      totalPrompts: categories.totalPrompts,
      avgPromptLength: categories.avgPromptLength,
      topCategory: categories.topCategory,
      topCategoryCount: categories.topCategoryCount,
      topSubcategory: categories.topSubcategory,
      topSubcategoryCount: categories.topSubcategoryCount,
      promptCategories: categories.promptCategories,

      // Interruptions
      interruptions: interruptions.interruptions,
      interruptionRate: interruptions.interruptionRate,
      interruptionPrompts: interruptions.prompts,
      toolUses: interruptions.toolUses,
      toolErrors: interruptions.toolErrors,
      errorRate: interruptions.errorRate,

      // Tokens
      inputTokens: tokens.inputTokens,
      cacheCreationTokens: tokens.cacheCreationTokens,
      cacheReadTokens: tokens.cacheReadTokens,
      outputTokens: tokens.outputTokens,
      totalTokens: tokens.totalTokens
    });

    console.log(`  ✓ ${categories.totalPrompts} prompts, ${tokens.totalTokens || 0} tokens`);
  }

  const outputDir = path.join(__dirname, '../output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    path.join(outputDir, 'transcript.json'),
    JSON.stringify({ weeks: transcriptMetrics }, null, 2)
  );

  console.log();
  console.log('✓ Transcript metrics saved to output/transcript.json');
  console.log('='.repeat(80));
}

collectMetrics().catch(error => {
  console.error('Error collecting transcript metrics:', error);
  process.exit(1);
});
