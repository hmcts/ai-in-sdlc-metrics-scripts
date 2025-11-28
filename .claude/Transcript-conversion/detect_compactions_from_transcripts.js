#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Week definitions  
const WEEKS = [
  { name: 'Week 5', start: '2025-11-03', end: '2025-11-07', period: 'Nov 3-7' },
  { name: 'Week 6', start: '2025-11-10', end: '2025-11-14', period: 'Nov 10-14' },
  { name: 'Week 7', start: '2025-11-17', end: '2025-11-21', period: 'Nov 17-21' }
];

function findJSONLFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findJSONLFiles(fullPath));
    } else if (entry.name.endsWith('.jsonl')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Determine week by timestamp
function getWeekForTimestamp(timestamp) {
  const date = new Date(timestamp);
  
  for (const week of WEEKS) {
    const startDate = new Date(week.start);
    const endDate = new Date(week.end);
    endDate.setHours(23, 59, 59, 999);
    
    if (date >= startDate && date <= endDate) {
      return week.name;
    }
  }
  
  return null;
}

// Detect compaction type from message content
function detectCompaction(content) {
  if (!content) return null;
  
  const text = typeof content === 'string' ? content : '';
  const lower = text.toLowerCase();
  
  // Manual compaction indicators
  if (lower.match(/\/compact|compact history|manually compact|compress context|compress conversation/i)) {
    return 'manual';
  }
  
  // Check for system messages about compactions
  if (lower.match(/context window.*exceeded|automatically compacting|auto.*compact|compaction.*triggered/i)) {
    return 'automatic';
  }
  
  return null;
}

const transcriptDir = path.join(__dirname, 'Junaid-Transcripts');
const files = findJSONLFiles(transcriptDir);

console.log(`Found ${files.length} JSONL transcript files\n`);

const weeklyCompactions = {};

WEEKS.forEach(week => {
  weeklyCompactions[week.name] = {
    period: week.period,
    manual: 0,
    automatic: 0,
    details: [],
    timeToContextWindow: [] // Array of times in minutes
  };
});

let processedCount = 0;
files.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length === 0) return;

  // Track conversation messages and first compaction per session
  const sessionMessages = {};
  const firstCompactions = {};

  // First pass: collect all messages and identify compactions
  lines.forEach((line) => {
    try {
      const entry = JSON.parse(line);

      if (entry.sessionId && entry.timestamp) {
        // Initialize session tracking
        if (!sessionMessages[entry.sessionId]) {
          sessionMessages[entry.sessionId] = [];
        }

        // Track all messages with timestamps
        if (entry.message) {
          sessionMessages[entry.sessionId].push({
            timestamp: entry.timestamp,
            role: entry.message.role
          });
        }

        // Detect compaction
        let isCompaction = false;

        if (entry.message && entry.message.content) {
          let textContent = '';

          if (typeof entry.message.content === 'string') {
            textContent = entry.message.content;
          } else if (Array.isArray(entry.message.content)) {
            textContent = entry.message.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join(' ');
          }

          if (detectCompaction(textContent)) {
            isCompaction = true;
          }
        }

        if ((entry.type === 'compaction' || entry.type === 'system')) {
          isCompaction = true;
        }

        // Track first compaction per session
        if (isCompaction && !firstCompactions[entry.sessionId]) {
          firstCompactions[entry.sessionId] = entry.timestamp;
        }
      }
    } catch (e) {
      // Skip invalid lines
    }
  });

  // Calculate time to context window for each session
  // Use time between messages to detect active conversation periods
  Object.keys(sessionMessages).forEach(sessionId => {
    if (firstCompactions[sessionId]) {
      const messages = sessionMessages[sessionId].sort((a, b) =>
        new Date(a.timestamp) - new Date(b.timestamp)
      );

      const compactionTime = new Date(firstCompactions[sessionId]);

      // Calculate cumulative active time (sum of all message-to-message intervals < 30 minutes)
      let cumulativeActiveMinutes = 0;
      const IDLE_THRESHOLD = 30; // Consider gaps > 30 minutes as idle time

      for (let i = 1; i < messages.length; i++) {
        const prevTime = new Date(messages[i - 1].timestamp);
        const currTime = new Date(messages[i].timestamp);
        const gapMinutes = (currTime - prevTime) / 1000 / 60;

        // Stop if we've reached the compaction
        if (currTime >= compactionTime) {
          // Add the time from last message to compaction
          const finalGap = (compactionTime - prevTime) / 1000 / 60;
          if (finalGap < IDLE_THRESHOLD) {
            cumulativeActiveMinutes += finalGap;
          }
          break;
        }

        // Only count gaps less than threshold as active time
        if (gapMinutes < IDLE_THRESHOLD) {
          cumulativeActiveMinutes += gapMinutes;
        }
      }

      // Attribute to week based on compaction timestamp
      const targetWeek = getWeekForTimestamp(firstCompactions[sessionId]);

      if (targetWeek && cumulativeActiveMinutes > 0) {
        weeklyCompactions[targetWeek].timeToContextWindow.push(cumulativeActiveMinutes);
      }
    }
  });

  // Second pass: count compactions and attribute by the compaction timestamp
  lines.forEach((line, lineIdx) => {
    try {
      const entry = JSON.parse(line);
      
      // Check message content
      if (entry.message && entry.message.content) {
        let textContent = '';
        
        if (typeof entry.message.content === 'string') {
          textContent = entry.message.content;
        } else if (Array.isArray(entry.message.content)) {
          textContent = entry.message.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join(' ');
        }
        
        const compactionType = detectCompaction(textContent);
        
        if (compactionType && entry.timestamp) {
          const targetWeek = getWeekForTimestamp(entry.timestamp);
          
          if (targetWeek) {
            weeklyCompactions[targetWeek][compactionType]++;
            weeklyCompactions[targetWeek].details.push({
              type: compactionType,
              timestamp: entry.timestamp,
              sessionId: entry.sessionId,
              role: entry.message.role,
              excerpt: textContent.substring(0, 100)
            });
          }
        }
      }
      
      // Check for system-level compaction events
      if ((entry.type === 'compaction' || entry.type === 'system') && entry.timestamp) {
        const targetWeek = getWeekForTimestamp(entry.timestamp);
        
        if (targetWeek) {
          const compactionType = entry.automatic ? 'automatic' : 'manual';
          weeklyCompactions[targetWeek][compactionType]++;
          weeklyCompactions[targetWeek].details.push({
            type: compactionType,
            timestamp: entry.timestamp,
            sessionId: entry.sessionId,
            role: 'system',
            excerpt: 'System compaction event'
          });
        }
      }
    } catch (e) {
      // Skip invalid lines
    }
  });
  
  processedCount++;
  if (processedCount % 10 === 0) {
    process.stdout.write(`\rProcessed ${processedCount}/${files.length} files...`);
  }
});

console.log(`\n✅ Processed ${processedCount} files\n`);

// Print summary
console.log('='.repeat(80));
console.log('COMPACTION DETECTION SUMMARY (by compaction timestamp)');
console.log('='.repeat(80));

WEEKS.forEach(week => {
  const data = weeklyCompactions[week.name];
  const total = data.manual + data.automatic;

  // Calculate average time to context window
  let avgTimeToContext = null;
  if (data.timeToContextWindow.length > 0) {
    const sum = data.timeToContextWindow.reduce((a, b) => a + b, 0);
    avgTimeToContext = sum / data.timeToContextWindow.length;
  }

  console.log(`\n${week.name} (${week.period}):`);
  console.log(`  Manual Compactions: ${data.manual}`);
  console.log(`  Automatic Compactions: ${data.automatic}`);
  console.log(`  Total: ${total}`);
  console.log(`  Sessions with Compactions: ${data.timeToContextWindow.length}`);
  console.log(`  Avg Time to Context Window: ${avgTimeToContext !== null ? avgTimeToContext.toFixed(2) + ' minutes' : 'N/A'}`);

  if (data.details.length > 0 && data.details.length <= 20) {
    console.log('\n  Details:');
    data.details.forEach((detail, idx) => {
      console.log(`    ${idx + 1}. [${detail.type.toUpperCase()}] ${new Date(detail.timestamp).toISOString()}`);
      console.log(`       ${detail.excerpt.substring(0, 80)}...`);
    });
  } else if (data.details.length > 20) {
    console.log(`\n  (${data.details.length} compaction events - too many to display)`);
  }
});

console.log('\n' + '='.repeat(80));

// Create summary object
const summary = {};
WEEKS.forEach(week => {
  const data = weeklyCompactions[week.name];

  // Calculate average time to context window
  let avgTimeToContext = null;
  if (data.timeToContextWindow.length > 0) {
    const sum = data.timeToContextWindow.reduce((a, b) => a + b, 0);
    avgTimeToContext = Math.round(sum / data.timeToContextWindow.length * 100) / 100; // Round to 2 decimals
  }

  summary[week.name] = {
    period: week.period,
    manualCompactions: data.manual,
    autoCompactions: data.automatic,
    totalCompactions: data.manual + data.automatic,
    sessionsWithCompactions: data.timeToContextWindow.length,
    avgTimeToContextWindow: avgTimeToContext,
    details: data.details
  };
});

// Write to JSON
const outputPath = path.join(__dirname, 'compactions_weeks_5-7.json');
fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));

console.log(`\n✅ Compaction data saved to: ${outputPath}`);

