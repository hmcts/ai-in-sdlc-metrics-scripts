#!/usr/bin/env node

/**
 * Token attribution by week based on PR CREATION DATE (matching comprehensive_pr_metrics.js logic)
 * Only counts tokens for tickets with MERGED PRs
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const transcriptDir = path.join(__dirname, '../Junaid-Transcripts/-Users-junaid-iqbal-Documents-GitHub-cath-service');

// Week definitions matching generate_dashboard_data.js
const WEEKS = [
  { name: 'Week 4', start: '2025-10-27', end: '2025-10-31', period: 'Oct 27-31' },
  { name: 'Week 5', start: '2025-11-03', end: '2025-11-07', period: 'Nov 3-7' },
  { name: 'Week 6', start: '2025-11-10', end: '2025-11-14', period: 'Nov 10-14' },
  { name: 'Week 7', start: '2025-11-17', end: '2025-11-21', period: 'Nov 17-21' }
];

// Load environment variables from .env file
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}
loadEnv();

const CONFIG = {
  REPO: 'hmcts/cath-service',
  JIRA_TOKEN: process.env.JIRA_TOKEN,
};

/**
 * Extract ticket ID from branch name
 */
function extractTicketFromBranch(branch) {
  if (!branch) return null;
  const match = branch.match(/VIBE-\d+/i);
  if (!match) return null;

  let ticket = match[0].toUpperCase();

  // Fix typo: VIBE-516 should be VIBE-216
  if (ticket === 'VIBE-516') {
    ticket = 'VIBE-216';
  }

  return ticket;
}

/**
 * Fetch all PRs from GitHub
 */
function fetchPRs() {
  console.log('Fetching PRs from GitHub...');
  const searchQuery = `created:>=${WEEKS[0].start}`;
  const prListJson = execSync(
    `gh pr list --repo ${CONFIG.REPO} --search "${searchQuery}" --limit 500 --json number,title,createdAt,mergedAt,state,headRefName --state all`,
    { encoding: 'utf8' }
  );
  const prs = JSON.parse(prListJson);
  console.log(`✓ Fetched ${prs.length} PRs`);
  return prs;
}

/**
 * Extract ticket from PR title
 */
function extractTicketFromPR(pr) {
  if (!pr.title) return null;
  const match = pr.title.match(/VIBE-\d+/i);
  if (!match) return null;

  let ticket = match[0].toUpperCase();

  // Fix typo: VIBE-516 should be VIBE-216
  if (ticket === 'VIBE-516') {
    ticket = 'VIBE-216';
  }

  return ticket;
}

/**
 * Fetch story points for a ticket from JIRA
 */
function getStoryPoints(ticketId) {
  try {
    // customfield_10004 is the story points field
    const url = `https://tools.hmcts.net/jira/rest/api/2/issue/${ticketId}?fields=customfield_10004`;
    const response = execSync(
      `curl -s -H "Authorization: Bearer ${CONFIG.JIRA_TOKEN}" "${url}"`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    const data = JSON.parse(response);
    return data.fields?.customfield_10004 || null;
  } catch (error) {
    console.error(`  Warning: Could not fetch story points for ${ticketId}`);
    return null;
  }
}

/**
 * Build ticket -> PR mapping (only merged PRs)
 */
function buildTicketToPRMapping(prs) {
  const ticketToPR = {};

  prs.forEach(pr => {
    // Only include MERGED PRs
    if (pr.state !== 'MERGED') return;

    const ticket = extractTicketFromPR(pr);
    if (!ticket) return;

    const createdAt = new Date(pr.createdAt);

    // Find which week this PR was created in
    let week = null;
    for (const w of WEEKS) {
      const weekStart = new Date(w.start);
      const weekEnd = new Date(w.end);
      weekEnd.setHours(23, 59, 59, 999);

      if (createdAt >= weekStart && createdAt <= weekEnd) {
        week = w.name;
        break;
      }
    }

    if (!week) return;

    ticketToPR[ticket] = {
      prNumber: pr.number,
      createdAt: pr.createdAt,
      mergedAt: pr.mergedAt,
      week: week,
      branch: pr.headRefName
    };
  });

  return ticketToPR;
}

/**
 * Process transcript and collect tokens per ticket
 */
async function processTranscript(file) {
  const filePath = path.join(transcriptDir, file);
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let currentBranch = null;
  let currentTicketFromBranch = null;
  let currentTicketFromWorkflow = null;
  let turnNumber = 0;

  const tokensByTicket = {};

  for await (const line of rl) {
    try {
      const data = JSON.parse(line);

      // Track turn increments
      if (data.type === "user") {
        turnNumber++;
      }

      // Track branch updates
      if (data.gitBranch) {
        currentBranch = data.gitBranch;
        currentTicketFromBranch = extractTicketFromBranch(data.gitBranch);
      }

      // Check for workflow command override
      if (data.message && data.message.content) {
        let content = '';
        if (typeof data.message.content === 'string') {
          content = data.message.content;
        } else if (Array.isArray(data.message.content)) {
          content = JSON.stringify(data.message.content);
        }

        const argsMatch = content.match(/<command-args>([^<]+)<\/command-args>/);
        if (argsMatch && argsMatch[1].startsWith('VIBE-')) {
          let ticket = argsMatch[1];
          // Fix typo
          if (ticket === 'VIBE-516') ticket = 'VIBE-216';
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
      // Skip invalid JSON
    }
  }

  return tokensByTicket;
}

/**
 * Main execution
 */
async function main() {
  console.log('='.repeat(80));
  console.log('TOKEN USAGE BY WEEK (ATTRIBUTED BY PR CREATION DATE)');
  console.log('='.repeat(80));
  console.log();

  // Fetch PRs and build mapping
  const prs = fetchPRs();
  const ticketToPR = buildTicketToPRMapping(prs);

  console.log(`✓ Found ${Object.keys(ticketToPR).length} tickets with merged PRs`);
  console.log();

  // Fetch story points for each ticket
  console.log('Fetching story points from JIRA...');
  for (const ticket of Object.keys(ticketToPR)) {
    const sp = getStoryPoints(ticket);
    ticketToPR[ticket].storyPoints = sp;
    // Rate limiting
    execSync('sleep 0.2');
  }
  console.log('✓ Fetched story points for all tickets');
  console.log();

  // Process all transcripts and collect tokens per ticket
  const files = fs.readdirSync(transcriptDir)
    .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));

  console.log('Processing transcripts...');
  const allTokensByTicket = {};

  for (const file of files) {
    const tokensByTicket = await processTranscript(file);

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

  console.log(`✓ Processed ${files.length} transcript files`);
  console.log();

  // Attribute tokens to weeks based on PR creation date
  const weeklyTotals = {};
  WEEKS.forEach(week => {
    weeklyTotals[week.name] = {};
  });

  let totalAttributed = 0;
  let totalUnattributed = allTokensByTicket['UNATTRIBUTED'] ? allTokensByTicket['UNATTRIBUTED'].total : 0;
  let totalWithoutMergedPR = 0;

  for (const [ticket, tokens] of Object.entries(allTokensByTicket)) {
    if (ticket === 'UNATTRIBUTED') continue;

    const prInfo = ticketToPR[ticket];

    if (prInfo) {
      // Ticket has a merged PR - attribute to the week the PR was CREATED
      const week = prInfo.week;

      if (!weeklyTotals[week][ticket]) {
        weeklyTotals[week][ticket] = {
          total: 0,
          input: 0,
          output: 0,
          cacheCreation: 0,
          cacheRead: 0,
          thinking: 0,
          prNumber: prInfo.prNumber,
          createdAt: prInfo.createdAt
        };
      }

      weeklyTotals[week][ticket].total += tokens.total;
      weeklyTotals[week][ticket].input += tokens.input;
      weeklyTotals[week][ticket].output += tokens.output;
      weeklyTotals[week][ticket].cacheCreation += tokens.cacheCreation;
      weeklyTotals[week][ticket].cacheRead += tokens.cacheRead;
      weeklyTotals[week][ticket].thinking += tokens.thinking;
      weeklyTotals[week][ticket].storyPoints = prInfo.storyPoints;

      totalAttributed += tokens.total;
    } else {
      // Ticket does NOT have a merged PR - exclude from week totals
      totalWithoutMergedPR += tokens.total;
    }
  }

  // Display results by week
  console.log('='.repeat(80));
  console.log('TOKEN USAGE BY WEEK (ONLY TICKETS WITH MERGED PRS)');
  console.log('='.repeat(80));
  console.log();

  WEEKS.forEach(week => {
    console.log(`${week.name} (${week.period})`);
    console.log('-'.repeat(80));

    const tickets = weeklyTotals[week.name];
    const sortedTickets = Object.entries(tickets)
      .sort((a, b) => b[1].total - a[1].total);

    const weekTotal = Object.values(tickets).reduce((sum, t) => sum + t.total, 0);
    console.log(`Total tokens: ${weekTotal.toLocaleString()}`);
    console.log();

    if (sortedTickets.length > 0) {
      const weekSP = sortedTickets.reduce((sum, [_, t]) => sum + (t.storyPoints || 0), 0);
      const tokensPerSP = weekSP > 0 ? Math.round(weekTotal / weekSP) : 0;

      console.log(`Story Points: ${weekSP}`);
      console.log(`Tokens per SP: ${tokensPerSP.toLocaleString()}`);
      console.log();

      sortedTickets.forEach(([ticket, tokens]) => {
        const sp = tokens.storyPoints || 'N/A';
        const tps = tokens.storyPoints > 0 ? Math.round(tokens.total / tokens.storyPoints).toLocaleString() : 'N/A';
        console.log(`  ${ticket.padEnd(20)} ${tokens.total.toLocaleString().padStart(15)} tokens | ${String(sp).padStart(2)} SP | ${String(tps).padStart(10)} tokens/SP`);
      });
    } else {
      console.log('  (no merged PRs in this week)');
    }

    console.log();
  });

  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  const grandTotal = totalAttributed + totalUnattributed + totalWithoutMergedPR;
  console.log(`Total attributed to merged PRs:     ${totalAttributed.toLocaleString().padStart(15)} (${((totalAttributed / grandTotal) * 100).toFixed(1)}%)`);
  console.log(`Total for unattributed work:        ${totalUnattributed.toLocaleString().padStart(15)} (${((totalUnattributed / grandTotal) * 100).toFixed(1)}%)`);
  console.log(`Total for tickets without merged PR:${totalWithoutMergedPR.toLocaleString().padStart(15)} (${((totalWithoutMergedPR / grandTotal) * 100).toFixed(1)}%)`);
  console.log(`Grand total:                        ${grandTotal.toLocaleString().padStart(15)}`);
  console.log();
  console.log('ATTRIBUTION METHOD:');
  console.log('  ✓ Tokens attributed to week based on PR CREATION DATE');
  console.log('  ✓ Only includes tickets with MERGED PRs');
  console.log('  ✓ Matches comprehensive_pr_metrics.js logic');
  console.log();

  // Save to JSON
  const output = {
    weeks: WEEKS.map(week => ({
      name: week.name,
      period: week.period,
      totalTokens: Object.values(weeklyTotals[week.name]).reduce((sum, t) => sum + t.total, 0),
      tickets: weeklyTotals[week.name]
    })),
    summary: {
      totalAttributed,
      totalUnattributed,
      totalWithoutMergedPR,
      grandTotal,
      attributionRate: ((totalAttributed / grandTotal) * 100).toFixed(1)
    }
  };

  fs.writeFileSync(
    path.join(__dirname, 'tokens_per_week_by_pr.json'),
    JSON.stringify(output, null, 2)
  );

  console.log('✓ JSON output saved to: tokens_per_week_by_pr.json');
}

main().catch(console.error);
