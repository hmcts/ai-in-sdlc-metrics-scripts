const fs = require('fs');
const path = require('path');
const readline = require('readline');
const CONFIG = require('../config');

// Function to parse UK date format (DD/MM/YYYY) to Date object
function parseUKDate(dateStr) {
  const [day, month, year] = dateStr.split('/');
  return new Date(`${year}-${month}-${day}`);
}

// Function to determine if a timestamp belongs to a specific week
function isInWeek(timestamp, week) {
  const date = new Date(timestamp);
  const start = new Date(week.start + 'T00:00:00Z');
  const end = new Date(week.end + 'T23:59:59Z');
  return date >= start && date <= end;
}

// Function to recursively find all JSONL files
function findTranscriptFiles(dir) {
  const files = [];

  function traverse(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl') && !entry.name.startsWith('agent-')) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

// Function to process a single JSONL file for a specific week
async function processTranscriptFileForWeek(filePath, week) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const tokenData = {
    input_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    output_tokens: 0,
    message_count: 0
  };

  for await (const line of rl) {
    try {
      const entry = JSON.parse(line);

      // Only process assistant messages with usage data
      if (entry.type === 'assistant' && entry.message && entry.message.usage) {
        if (isInWeek(entry.timestamp, week)) {
          const usage = entry.message.usage;

          // Add token counts
          tokenData.input_tokens += usage.input_tokens || 0;
          tokenData.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
          tokenData.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
          tokenData.output_tokens += usage.output_tokens || 0;
          tokenData.message_count++;
        }
      }
    } catch (error) {
      // Skip malformed JSON lines
    }
  }

  return tokenData;
}

/**
 * Calculate token breakdown for a specific week
 * @param {Object} week - Week configuration with name, start, end dates
 * @returns {Object} Token breakdown with input, cache creation, cache read, output tokens
 */
async function calculateTokenBreakdownForWeek(week) {
  const transcriptDir = CONFIG.TRANSCRIPTS_DIR || path.join(__dirname, '../transcripts/files');

  if (!fs.existsSync(transcriptDir)) {
    return {
      inputTokens: null,
      cacheCreationTokens: null,
      cacheReadTokens: null,
      outputTokens: null,
      totalTokensBreakdown: null
    };
  }

  const transcriptFiles = findTranscriptFiles(transcriptDir);

  const totals = {
    input_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    output_tokens: 0,
    message_count: 0
  };

  for (const file of transcriptFiles) {
    const fileData = await processTranscriptFileForWeek(file, week);
    totals.input_tokens += fileData.input_tokens;
    totals.cache_creation_input_tokens += fileData.cache_creation_input_tokens;
    totals.cache_read_input_tokens += fileData.cache_read_input_tokens;
    totals.output_tokens += fileData.output_tokens;
    totals.message_count += fileData.message_count;
  }

  const totalTokens = totals.input_tokens + totals.cache_creation_input_tokens +
                      totals.cache_read_input_tokens + totals.output_tokens;

  return {
    inputTokens: totals.input_tokens,
    cacheCreationTokens: totals.cache_creation_input_tokens,
    cacheReadTokens: totals.cache_read_input_tokens,
    outputTokens: totals.output_tokens,
    totalTokensBreakdown: totalTokens
  };
}

module.exports = {
  calculateTokenBreakdownForWeek
};
