// Extract token usage from transcript JSONL files
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { findFiles } = require('../../shared/utils/fileUtils');
const CONFIG = require('../../config');

/**
 * Extract ticket ID from branch name
 */
function extractTicketFromBranch(branch) {
  if (!branch) return null;
  const match = branch.match(/([A-Z]+-\d+)/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Extract ticket ID from workflow command
 */
function extractTicketFromWorkflow(content) {
  if (!content) return null;

  let contentStr = '';
  if (typeof content === 'string') {
    contentStr = content;
  } else if (Array.isArray(content)) {
    contentStr = JSON.stringify(content);
  }

  const argsMatch = contentStr.match(/<command-args>([^<]+)<\/command-args>/);
  if (argsMatch && argsMatch[1]) {
    const match = argsMatch[1].match(/([A-Z]+-\d+)/i);
    return match ? match[0].toUpperCase() : null;
  }

  return null;
}

/**
 * Process a single transcript file and extract tokens per ticket
 */
async function extractTokensFromTranscript(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let currentBranch = null;
  let currentTicketFromBranch = null;
  let currentTicketFromWorkflow = null;

  const tokensByTicket = {};

  for await (const line of rl) {
    try {
      const data = JSON.parse(line);

      // Track branch updates
      if (data.gitBranch) {
        currentBranch = data.gitBranch;
        currentTicketFromBranch = extractTicketFromBranch(data.gitBranch);
      }

      // Check for workflow command override
      if (data.message && data.message.content) {
        const ticket = extractTicketFromWorkflow(data.message.content);
        if (ticket) {
          currentTicketFromWorkflow = ticket;
        }
      }

      const currentTicket = currentTicketFromWorkflow || currentTicketFromBranch || 'UNATTRIBUTED';

      // Attribute ALL tokens when assistant responds
      if (data.type === "assistant" && data.message && data.message.usage) {
        const usage = data.message.usage;

        const totalTokens = (usage.input_tokens || 0) +
                           (usage.output_tokens || 0) +
                           (usage.cache_creation_input_tokens || 0) +
                           (usage.cache_read_input_tokens || 0) +
                           (usage.thinking_output_tokens || 0);

        if (!tokensByTicket[currentTicket]) {
          tokensByTicket[currentTicket] = {
            total: 0,
            input: 0,
            output: 0,
            cacheCreation: 0,
            cacheRead: 0,
            thinking: 0
          };
        }

        tokensByTicket[currentTicket].total += totalTokens;
        tokensByTicket[currentTicket].input += (usage.input_tokens || 0);
        tokensByTicket[currentTicket].output += (usage.output_tokens || 0);
        tokensByTicket[currentTicket].cacheCreation += (usage.cache_creation_input_tokens || 0);
        tokensByTicket[currentTicket].cacheRead += (usage.cache_read_input_tokens || 0);
        tokensByTicket[currentTicket].thinking += (usage.thinking_output_tokens || 0);
      }
    } catch (e) {
      // Skip invalid JSON lines
    }
  }

  return tokensByTicket;
}

/**
 * Recursively find all .jsonl files in a directory
 */
function findTranscriptFiles(dir) {
  const files = [];

  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl') && !entry.name.startsWith('agent-')) {
        files.push(fullPath);
      }
    }
  }

  scan(dir);
  return files;
}

/**
 * Extract tokens from all transcript files
 * Returns aggregated tokens per ticket
 */
async function extractAllTokens(transcriptDir = CONFIG.TRANSCRIPTS_DIR) {
  if (!fs.existsSync(transcriptDir)) {
    throw new Error(`Transcript directory not found: ${transcriptDir}`);
  }

  // Recursively find all .jsonl files
  const files = findTranscriptFiles(transcriptDir);

  if (files.length === 0) {
    console.warn(`  Warning: No .jsonl transcript files found in ${transcriptDir}`);
    return {};
  }

  console.log(`  Found ${files.length} transcript files to process`);

  const allTokensByTicket = {};

  for (const file of files) {
    const tokensByTicket = await extractTokensFromTranscript(file);

    // Merge into global totals
    for (const [ticket, tokens] of Object.entries(tokensByTicket)) {
      if (!allTokensByTicket[ticket]) {
        allTokensByTicket[ticket] = {
          total: 0,
          input: 0,
          output: 0,
          cacheCreation: 0,
          cacheRead: 0,
          thinking: 0
        };
      }

      allTokensByTicket[ticket].total += tokens.total;
      allTokensByTicket[ticket].input += tokens.input;
      allTokensByTicket[ticket].output += tokens.output;
      allTokensByTicket[ticket].cacheCreation += tokens.cacheCreation;
      allTokensByTicket[ticket].cacheRead += tokens.cacheRead;
      allTokensByTicket[ticket].thinking += tokens.thinking;
    }
  }

  return allTokensByTicket;
}

module.exports = {
  extractTicketFromBranch,
  extractTicketFromWorkflow,
  extractTokensFromTranscript,
  extractAllTokens
};
