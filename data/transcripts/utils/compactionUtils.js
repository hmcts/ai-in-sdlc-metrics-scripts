// Transcript compaction analysis helpers
const CONFIG = require('../../config');
const { findFiles, readJSONL } = require('../../shared/utils/fileUtils');
const { isInWeek } = require('../../shared/utils/dateUtils');

function detectCompaction(entry) {
  // Check for system compaction types
  if (entry.type === 'compaction' || entry.type === 'system') {
    return {
      type: 'automatic',
      timestamp: entry.timestamp,
      sessionId: entry.sessionId
    };
  }

  // Check message content for compaction indicators
  if (!entry.message || !entry.message.content) return null;

  let textContent = '';
  if (typeof entry.message.content === 'string') {
    textContent = entry.message.content;
  } else if (Array.isArray(entry.message.content)) {
    textContent = entry.message.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join(' ');
  }

  if (!textContent) return null;

  const lower = textContent.toLowerCase();

  // Manual compaction indicators
  if (lower.match(/\/compact|compact history|manually compact|compress context|compress conversation/i)) {
    return {
      type: 'manual',
      timestamp: entry.timestamp,
      sessionId: entry.sessionId
    };
  }

  // Automatic compaction indicators
  if (lower.match(/context window.*exceeded|automatically compacting|auto.*compact|compaction.*triggered/i)) {
    return {
      type: 'automatic',
      timestamp: entry.timestamp,
      sessionId: entry.sessionId
    };
  }

  return null;
}

function analyzeCompactionsForWeek(week) {
  const transcriptsDir = CONFIG.TRANSCRIPTS_DIR;

  if (!transcriptsDir) {
    throw new Error('TRANSCRIPTS_DIR not configured');
  }

  const files = findFiles(transcriptsDir, '.jsonl');
  const compactionData = {
    manualCompactions: 0,
    autoCompactions: 0,
    timeToContextWindow: []
  };

  const sessionMessages = {};
  const firstCompactions = {};

  files.forEach(filePath => {
    const entries = readJSONL(filePath);

    entries.forEach(entry => {
      if (!entry.sessionId || !entry.timestamp) return;
      if (!isInWeek(entry.timestamp, week)) return;

      // Track session messages
      if (!sessionMessages[entry.sessionId]) {
        sessionMessages[entry.sessionId] = [];
      }
      sessionMessages[entry.sessionId].push({
        timestamp: new Date(entry.timestamp).getTime(),
        role: entry.role
      });

      // Detect compaction
      const compaction = detectCompaction(entry);
      if (compaction) {
        if (compaction.type === 'manual') {
          compactionData.manualCompactions++;
        } else {
          compactionData.autoCompactions++;
        }

        // Track first compaction per session
        if (!firstCompactions[entry.sessionId]) {
          firstCompactions[entry.sessionId] = new Date(entry.timestamp).getTime();
        }
      }
    });
  });

  // Calculate time to context window
  Object.keys(firstCompactions).forEach(sessionId => {
    const messages = sessionMessages[sessionId];
    if (!messages || messages.length === 0) return;

    messages.sort((a, b) => a.timestamp - b.timestamp);

    const firstTimestamp = messages[0].timestamp;
    const compactionTimestamp = firstCompactions[sessionId];

    // Filter out idle time (gaps > 30 minutes)
    let activeTime = 0;
    for (let i = 1; i < messages.length; i++) {
      const gap = messages[i].timestamp - messages[i - 1].timestamp;
      if (gap < 30 * 60 * 1000) { // 30 minutes
        activeTime += gap;
      }
      if (messages[i].timestamp >= compactionTimestamp) break;
    }

    const timeInMinutes = activeTime / (1000 * 60);
    compactionData.timeToContextWindow.push(timeInMinutes);
  });

  // Calculate average
  const avgTimeToContextWindow = compactionData.timeToContextWindow.length > 0
    ? compactionData.timeToContextWindow.reduce((a, b) => a + b, 0) / compactionData.timeToContextWindow.length
    : null;

  return {
    manualCompactions: compactionData.manualCompactions,
    autoCompactions: compactionData.autoCompactions,
    avgTimeToContextWindow: avgTimeToContextWindow
  };
}

module.exports = {
  analyzeCompactionsForWeek,
  detectCompaction
};
