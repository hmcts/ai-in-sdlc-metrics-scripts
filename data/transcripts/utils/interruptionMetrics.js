// Extract user interruption metrics from Claude Code transcripts
const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Analyze a single transcript file for interruptions within a date range
 */
async function analyzeTranscriptForInterruptions(filePath, startDate, endDate) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream });

  let interruptions = 0;
  let toolUses = 0;
  let toolErrors = 0;
  let prompts = 0;
  const seenMessageIds = new Set();

  for await (const line of rl) {
    try {
      const entry = JSON.parse(line);

      // Skip entries outside the date range
      if (entry.timestamp) {
        const entryDate = new Date(entry.timestamp);
        if (entryDate < startDate || entryDate > endDate) {
          continue;
        }
      }

      // Count prompts (actual user-typed messages, not system responses)
      if (entry.message?.role === 'user' && entry.uuid) {
        if (!seenMessageIds.has(entry.uuid)) {
          seenMessageIds.add(entry.uuid);

          // Extract text content to check if it's a real prompt
          let textContent = '';
          if (typeof entry.message.content === 'string') {
            textContent = entry.message.content;
          } else if (Array.isArray(entry.message.content)) {
            textContent = entry.message.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join(' ');
          }

          // Skip empty content and "Warmup" prompts (match prompt counting logic)
          if (textContent && textContent.trim().length > 0 && textContent !== 'Warmup') {
            prompts++;
          }
        }
      }

      // Check for user interruptions
      if (entry.type === 'user' && entry.message?.content) {
        const content = entry.message.content;

        // Handle string content
        if (typeof content === 'string' &&
           (content.includes('[Request interrupted by user]') ||
            content.includes('[Request interrupted by user for tool use]'))) {
          interruptions++;
        }

        // Handle array content (most common case)
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'text' && item.text &&
               (item.text.includes('[Request interrupted by user]') ||
                item.text.includes('[Request interrupted by user for tool use]'))) {
              interruptions++;
              break; // Only count once per message
            }
          }
        }
      }

      // Count tool uses and errors for context
      if (entry.message?.content) {
        const content = Array.isArray(entry.message.content)
          ? entry.message.content
          : [entry.message.content];

        content.forEach(item => {
          if (item.type === 'tool_use') {
            toolUses++;
          }
          if (item.type === 'tool_result' && item.is_error) {
            toolErrors++;
          }
        });
      }
    } catch (e) {
      // Skip malformed lines
    }
  }

  return {
    interruptions,
    toolUses,
    toolErrors,
    prompts // Count of actual user-typed prompts
  };
}

/**
 * Calculate interruption metrics for a week
 */
async function calculateInterruptionsForWeek(week, transcriptsDir) {
  const startDate = new Date(week.start);
  const endDate = new Date(week.end);
  endDate.setHours(23, 59, 59, 999);

  let totalInterruptions = 0;
  let totalToolUses = 0;
  let totalToolErrors = 0;
  let totalPrompts = 0;
  let filesProcessed = 0;

  // Handle both cases: transcriptsDir could be the parent 'files' dir or a specific dev dir
  let workspaceDirsToProcess = [];

  const entries = fs.readdirSync(transcriptsDir, { withFileTypes: true });
  const firstEntry = entries[0];

  // Check if we're in a dev directory (contains workspace dirs) or parent directory (contains dev dirs)
  if (firstEntry && firstEntry.isDirectory() && firstEntry.name.startsWith('-')) {
    // We're in a dev directory, entries are workspace directories
    workspaceDirsToProcess = entries
      .filter(dirent => dirent.isDirectory())
      .map(dirent => path.join(transcriptsDir, dirent.name));
  } else {
    // We're in parent directory, need to go through dev dirs first
    const devDirs = entries
      .filter(dirent => dirent.isDirectory())
      .map(dirent => path.join(transcriptsDir, dirent.name));

    for (const devDir of devDirs) {
      const workspaceDirs = fs.readdirSync(devDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => path.join(devDir, dirent.name));
      workspaceDirsToProcess.push(...workspaceDirs);
    }
  }

  // Process all workspace directories
  for (const workspaceDir of workspaceDirsToProcess) {
    const files = fs.readdirSync(workspaceDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => path.join(workspaceDir, f));

    for (const file of files) {
      try {
        // Process all files and filter by timestamp inside the file
        const metrics = await analyzeTranscriptForInterruptions(file, startDate, endDate);

        // Only count if there was activity in this week
        if (metrics.toolUses > 0 || metrics.interruptions > 0 || metrics.prompts > 0) {
          totalInterruptions += metrics.interruptions;
          totalToolUses += metrics.toolUses;
          totalToolErrors += metrics.toolErrors;
          totalPrompts += metrics.prompts;
          filesProcessed++;
        }
      } catch (err) {
        // Skip files that can't be processed
      }
    }
  }

  return {
    interruptions: totalInterruptions,
    toolUses: totalToolUses,
    toolErrors: totalToolErrors,
    prompts: totalPrompts,
    filesProcessed,
    interruptionRate: totalPrompts > 0
      ? parseFloat((totalInterruptions / totalPrompts * 100).toFixed(2))
      : 0,
    errorRate: totalToolUses > 0
      ? parseFloat((totalToolErrors / totalToolUses * 100).toFixed(2))
      : 0
  };
}

module.exports = {
  analyzeTranscriptForInterruptions,
  calculateInterruptionsForWeek
};
