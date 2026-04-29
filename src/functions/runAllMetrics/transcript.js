const { readBlob, listBlobs, writeBlob } = require('./blobStorage');

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
  const today = new Date(); today.setHours(23, 59, 59, 999);
  const weeks = [];
  let weekStart = new Date(PROJECT_START);
  const daysToFriday = (5 - weekStart.getDay() + 7) % 7;
  let weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + daysToFriday);
  let weekNum = 1;
  while (weekStart <= today) {
    weeks.push({
      name: `Week ${weekNum}`,
      start: formatDate(weekStart),
      end: formatDate(weekEnd),
      period: formatPeriod(weekStart, weekEnd),
      startMs: weekStart.getTime(),
      endMs: new Date(weekEnd).setHours(23, 59, 59, 999)
    });
    weekNum++;
    weekStart = new Date(weekEnd); weekStart.setDate(weekStart.getDate() + 3);
    weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 4);
  }
  return weeks;
}

function findWeek(timestampMs, weeks) {
  for (const week of weeks) {
    if (timestampMs >= week.startMs && timestampMs <= week.endMs) return week;
  }
  return null;
}

function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter(c => c.type === 'text').map(c => c.text).join(' ');
  return '';
}

// ─── Prompt category helpers ──────────────────────────────────────────────────
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
  /slash command/i, /summarise? the/i
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function collect(context) {
  context.log('--- Transcript metrics ---');

  const weeks = generateWeeks();

  // Per-week accumulators — small objects only, never full entry arrays
  const acc = {};
  for (const week of weeks) {
    acc[week.name] = {
      // tokens
      inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0,
      // compactions
      manualCompactions: 0, autoCompactions: 0,
      sessionMessages: {},   // sessionId -> [{timestamp, role}]
      firstCompactions: {},  // sessionId -> timestampMs
      // prompt categories
      promptLengths: [],
      categoryCount: {},
      // interruptions
      interruptions: 0, toolUses: 0, toolErrors: 0, prompts: 0,
      seenUuids: new Set(),
      // new agentic metrics
      toolBreakdown: {},
      totalEdits: 0, reEdits: 0
    };
  }

  context.log('  Listing transcript blobs...');
  const blobs = await listBlobs('transcripts/');
  const jsonlBlobs = blobs.filter(b => b.name.endsWith('.jsonl') && !b.name.split('/').pop().startsWith('agent-'));
  context.log(`  Found ${jsonlBlobs.length} transcript files — processing one at a time`);

  // Per-ticket token and prompt totals across all blobs
  const tokensByTicket = {};
  const promptsByTicket = {};

  let fileCount = 0;
  for (const blob of jsonlBlobs) {
    let content;
    try { content = await readBlob(blob.name); } catch { continue; }
    if (!content) continue;

    // Track current ticket from gitBranch — resets per blob (per session file)
    let currentTicket = 'UNATTRIBUTED';
    // Track edited files per session for reEditRate
    const sessionEditedFiles = new Set();

    // Parse lines and process immediately — don't accumulate parsed entries
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (!entry.timestamp) continue;

      // Update current ticket from gitBranch (same logic as old tokenExtractor.js)
      if (entry.gitBranch) {
        const m = entry.gitBranch.match(/([A-Z]+-\d+)/i);
        currentTicket = m ? m[1].toUpperCase() : 'UNATTRIBUTED';
      }

      const tsMs = new Date(entry.timestamp).getTime();
      const week = findWeek(tsMs, weeks);
      if (!week) continue;
      const a = acc[week.name];

      // ── Tokens ──────────────────────────────────────────────────────────────
      if (entry.type === 'assistant' && entry.message?.usage) {
        const u = entry.message.usage;
        a.inputTokens           += u.input_tokens || 0;
        a.cacheCreationTokens   += u.cache_creation_input_tokens || 0;
        a.cacheReadTokens       += u.cache_read_input_tokens || 0;
        a.outputTokens          += u.output_tokens || 0;

        // Also attribute to ticket
        const ticketTokens = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0);
        tokensByTicket[currentTicket] = (tokensByTicket[currentTicket] || 0) + ticketTokens;
      }

      // ── Compactions ─────────────────────────────────────────────────────────
      if (entry.sessionId && (entry.type === 'user' || entry.type === 'assistant')) {
        if (!a.sessionMessages[entry.sessionId]) a.sessionMessages[entry.sessionId] = [];
        a.sessionMessages[entry.sessionId].push({ timestamp: tsMs });
      }

      let compType = null;
      if (entry.type === 'compaction') {
        compType = 'automatic';
      } else if (entry.message?.content) {
        const text = extractTextContent(entry.message.content).toLowerCase();
        if (/\/compact|compact history|manually compact|compress context|compress conversation/i.test(text)) compType = 'manual';
        else if (/context window.*exceeded|automatically compacting|auto.*compact|compaction.*triggered|ran out of context|previous conversation that ran out/i.test(text)) compType = 'automatic';
      }
      if (compType) {
        if (compType === 'manual') a.manualCompactions++; else a.autoCompactions++;
        if (entry.sessionId && !a.firstCompactions[entry.sessionId]) a.firstCompactions[entry.sessionId] = tsMs;
      }

      // ── Prompt categories ────────────────────────────────────────────────────
      if (entry.message?.role === 'user' && entry.message.content) {
        const text = extractTextContent(entry.message.content);
        if (text && text.trim().length >= 30 && text !== 'Warmup' &&
            !text.includes('<command-name>') && !text.includes('<local-command-stdout>') &&
            !text.includes('[Request interrupted') &&
            !text.includes('Caveat: The messages below were generated by the user') &&
            !FILTER_PATTERNS.some(p => p.test(text.trim()))) {
          a.promptLengths.push(text.length);
          let cat = 'general';
          for (const [c, pat] of Object.entries(CATEGORIES)) {
            if (c !== 'general' && pat.test(text)) { cat = c; break; }
          }
          a.categoryCount[cat] = (a.categoryCount[cat] || 0) + 1;
        }
      }

      // ── Interruptions ────────────────────────────────────────────────────────
      if (entry.message?.role === 'user' && entry.uuid && !a.seenUuids.has(entry.uuid)) {
        a.seenUuids.add(entry.uuid);
        const text = extractTextContent(entry.message?.content || '');
        if (text && text.trim().length > 0 && text !== 'Warmup') {
          a.prompts++;
          if (currentTicket !== 'UNATTRIBUTED') {
            if (!promptsByTicket[currentTicket]) promptsByTicket[currentTicket] = [];
            promptsByTicket[currentTicket].push(tsMs);
          }
        }
      }

      if (entry.type === 'user' && entry.message?.content) {
        const hasInterrupt = t => t && (t.includes('[Request interrupted by user]') || t.includes('[Request interrupted by user for tool use]'));
        const c = entry.message.content;
        if (typeof c === 'string' && hasInterrupt(c)) a.interruptions++;
        else if (Array.isArray(c)) { for (const item of c) { if (item.type === 'text' && hasInterrupt(item.text)) { a.interruptions++; break; } } }
      }

      if (entry.message?.content) {
        const items = Array.isArray(entry.message.content) ? entry.message.content : [entry.message.content];
        for (const item of items) {
          if (item.type === 'tool_use') {
            a.toolUses++;
            const toolName = item.name || 'unknown';
            a.toolBreakdown[toolName] = (a.toolBreakdown[toolName] || 0) + 1;
            if ((item.name === 'Edit' || item.name === 'Write') && item.input?.file_path) {
              a.totalEdits++;
              if (sessionEditedFiles.has(item.input.file_path)) {
                a.reEdits++;
              } else {
                sessionEditedFiles.add(item.input.file_path);
              }
            }
          }
          if (item.type === 'tool_result' && item.is_error) a.toolErrors++;
        }
      }
    }

    // Explicitly free the blob content string
    content = null;
    fileCount++;
    if (fileCount % 100 === 0) context.log(`  Processed ${fileCount}/${jsonlBlobs.length} files...`);
  }

  context.log(`  Processed all ${fileCount} files — computing metrics`);

  // ── Compute derived metrics and build output ────────────────────────────────
  const transcriptMetrics = [];
  for (const week of weeks) {
    const a = acc[week.name];

    // avgTimeToContextWindow
    const times = [];
    for (const [sessionId, compTime] of Object.entries(a.firstCompactions)) {
      const messages = (a.sessionMessages[sessionId] || []).sort((x, y) => x.timestamp - y.timestamp);
      let activeTime = 0;
      for (let i = 1; i < messages.length; i++) {
        const gap = messages[i].timestamp - messages[i - 1].timestamp;
        if (gap < 30 * 60 * 1000) activeTime += gap;
        if (messages[i].timestamp >= compTime) break;
      }
      times.push(activeTime / (1000 * 60));
    }
    const avgTimeToContextWindow = times.length > 0 ? times.reduce((x, y) => x + y, 0) / times.length : null;

    // prompt categories
    const totalPrompts = a.promptLengths.length;
    const avgPromptLength = totalPrompts > 0 ? Math.round(a.promptLengths.reduce((x, y) => x + y, 0) / totalPrompts) : 0;
    let topCategory = null, topCategoryCount = 0;
    for (const [cat, count] of Object.entries(a.categoryCount)) {
      if (count > topCategoryCount) { topCategory = cat; topCategoryCount = count; }
    }
    const promptCategories = Object.fromEntries(Object.entries(a.categoryCount).map(([k, v]) => [k, { count: v }]));

    // interruptions
    const interruptionRate = a.prompts > 0 ? parseFloat((a.interruptions / a.prompts * 100).toFixed(2)) : 0;
    const errorRate = a.toolUses > 0 ? parseFloat((a.toolErrors / a.toolUses * 100).toFixed(2)) : 0;

    // tool breakdown and agentic metrics
    const readTools  = (a.toolBreakdown['Read'] || 0) + (a.toolBreakdown['Grep'] || 0) + (a.toolBreakdown['Glob'] || 0);
    const writeTools = (a.toolBreakdown['Edit'] || 0) + (a.toolBreakdown['Write'] || 0) + (a.toolBreakdown['Bash'] || 0);
    const readWriteRatio = writeTools > 0 ? parseFloat((readTools / writeTools).toFixed(2)) : null;
    const reEditRate = a.totalEdits > 0 ? parseFloat((a.reEdits / a.totalEdits * 100).toFixed(2)) : 0;

    transcriptMetrics.push({
      week: week.name, period: week.period,
      manualCompactions: a.manualCompactions,
      autoCompactions: a.autoCompactions,
      avgTimeToContextWindow,
      totalPrompts,
      avgPromptLength,
      topCategory,
      topCategoryCount,
      topSubcategory: null, topSubcategoryCount: 0,
      promptCategories,
      interruptions: a.interruptions,
      interruptionRate,
      interruptionPrompts: a.prompts,
      toolUses: a.toolUses,
      toolErrors: a.toolErrors,
      errorRate,
      toolBreakdown: a.toolBreakdown,
      readWriteRatio,
      reEditRate,
      inputTokens: a.inputTokens,
      cacheCreationTokens: a.cacheCreationTokens,
      cacheReadTokens: a.cacheReadTokens,
      outputTokens: a.outputTokens,
      totalTokens: a.inputTokens + a.cacheCreationTokens + a.cacheReadTokens + a.outputTokens
    });
  }

  // Remove UNATTRIBUTED from per-ticket maps (not useful for matching)
  delete tokensByTicket['UNATTRIBUTED'];
  delete promptsByTicket['UNATTRIBUTED'];

  await writeBlob('output/transcript.json', { weeks: transcriptMetrics, tokensByTicket, promptsByTicket });
  context.log(`  ✓ output/transcript.json written (${Object.keys(tokensByTicket).length} tickets with token data)`);
}

module.exports = { collect };
