const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Week definitions starting from Week 4 (first partial transcript coverage)
const weeks = [
  { week: 'Week 4', start: '27/10/2025', end: '31/10/2025' },
  { week: 'Week 5', start: '03/11/2025', end: '07/11/2025' },
  { week: 'Week 6', start: '10/11/2025', end: '14/11/2025' },
  { week: 'Week 7', start: '17/11/2025', end: '21/11/2025' },
  { week: 'Week 8', start: '24/11/2025', end: '28/11/2025' },
  { week: 'Week 9', start: '01/12/2025', end: '05/12/2025' },
  { week: 'Week 10', start: '08/12/2025', end: '12/12/2025' },
  { week: 'Week 11', start: '15/12/2025', end: '19/12/2025' },
  // Add more weeks as needed
];

const transcriptDir = path.join(__dirname, '../transcripts/files');
const outputFile = path.join(__dirname, 'token_breakdown_by_week.csv');

// Initialize data structure for each week
const weeklyTokens = weeks.map(w => ({
  week: w.week,
  period: `${w.start} to ${w.end}`,
  input_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  output_tokens: 0,
  total_tokens: 0,
  message_count: 0
}));

// Function to parse UK date format (DD/MM/YYYY) to Date object
function parseUKDate(dateStr) {
  const [day, month, year] = dateStr.split('/');
  return new Date(`${year}-${month}-${day}`);
}

// Function to determine which week a timestamp belongs to
function getWeekIndex(timestamp) {
  const date = new Date(timestamp);
  for (let i = 0; i < weeks.length; i++) {
    const start = new Date(parseUKDate(weeks[i].start).toISOString().split('T')[0] + 'T00:00:00Z');
    const end = new Date(parseUKDate(weeks[i].end).toISOString().split('T')[0] + 'T23:59:59Z');
    if (date >= start && date <= end) {
      return i;
    }
  }
  return -1; // Not in any defined week
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
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

// Function to process a single JSONL file
async function processTranscriptFile(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    try {
      const entry = JSON.parse(line);

      // Only process assistant messages with usage data
      if (entry.type === 'assistant' && entry.message && entry.message.usage) {
        const weekIndex = getWeekIndex(entry.timestamp);

        if (weekIndex >= 0) {
          const usage = entry.message.usage;
          const week = weeklyTokens[weekIndex];

          // Add token counts
          week.input_tokens += usage.input_tokens || 0;
          week.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
          week.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
          week.output_tokens += usage.output_tokens || 0;

          week.message_count++;
        }
      }
    } catch (error) {
      // Skip malformed JSON lines
      console.error(`Error parsing line in ${filePath}: ${error.message}`);
    }
  }
}

// Main execution
async function main() {
  console.log('Finding transcript files...');
  const transcriptFiles = findTranscriptFiles(transcriptDir);
  console.log(`Found ${transcriptFiles.length} transcript files`);

  console.log('Processing transcripts...');
  let processedCount = 0;
  for (const file of transcriptFiles) {
    await processTranscriptFile(file);
    processedCount++;
    if (processedCount % 10 === 0) {
      console.log(`Processed ${processedCount}/${transcriptFiles.length} files...`);
    }
  }

  // Calculate totals and percentages
  weeklyTokens.forEach(week => {
    week.total_tokens =
      week.input_tokens +
      week.cache_creation_input_tokens +
      week.cache_read_input_tokens +
      week.output_tokens;

    // Calculate percentages
    if (week.total_tokens > 0) {
      week.input_pct = (week.input_tokens / week.total_tokens * 100).toFixed(2);
      week.cache_creation_pct = (week.cache_creation_input_tokens / week.total_tokens * 100).toFixed(2);
      week.cache_read_pct = (week.cache_read_input_tokens / week.total_tokens * 100).toFixed(2);
      week.output_pct = (week.output_tokens / week.total_tokens * 100).toFixed(2);
    } else {
      week.input_pct = 0;
      week.cache_creation_pct = 0;
      week.cache_read_pct = 0;
      week.output_pct = 0;
    }
  });

  // Write CSV
  console.log('\nWriting CSV file...');
  const csvHeaders = [
    'Week',
    'Period',
    'Input',
    'Input %',
    'Cache Creation Input',
    'Cache Creation Input %',
    'Cache Read Input',
    'Cache Read Input %',
    'Output',
    'Output %',
    'Total Tokens',
    'Message Count'
  ];

  const csvLines = [csvHeaders.join(',')];

  weeklyTokens.forEach(week => {
    csvLines.push([
      week.week,
      week.period,
      week.input_tokens,
      week.input_pct,
      week.cache_creation_input_tokens,
      week.cache_creation_pct,
      week.cache_read_input_tokens,
      week.cache_read_pct,
      week.output_tokens,
      week.output_pct,
      week.total_tokens,
      week.message_count
    ].join(','));
  });

  fs.writeFileSync(outputFile, csvLines.join('\n'));

  console.log(`\nCSV file written to: ${outputFile}`);
  console.log('\nWeekly Token Breakdown Summary:');
  console.log('================================');
  weeklyTokens.forEach(week => {
    console.log(`\n${week.week} (${week.period}):`);
    console.log(`  Input: ${week.input_tokens.toLocaleString()} (${week.input_pct}%)`);
    console.log(`  Cache creation input: ${week.cache_creation_input_tokens.toLocaleString()} (${week.cache_creation_pct}%)`);
    console.log(`  Cache read input: ${week.cache_read_input_tokens.toLocaleString()} (${week.cache_read_pct}%)`);
    console.log(`  Output: ${week.output_tokens.toLocaleString()} (${week.output_pct}%)`);
    console.log(`  Total: ${week.total_tokens.toLocaleString()}`);
    console.log(`  Messages: ${week.message_count}`);
  });
}

main().catch(console.error);
