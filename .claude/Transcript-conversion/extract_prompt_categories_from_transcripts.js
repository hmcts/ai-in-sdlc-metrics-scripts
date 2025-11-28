#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Week definitions  
const WEEKS = [
  { name: 'Week 5', start: '2025-11-03', end: '2025-11-07', period: 'Nov 3-7' },
  { name: 'Week 6', start: '2025-11-10', end: '2025-11-14', period: 'Nov 10-14' },
  { name: 'Week 7', start: '2025-11-17', end: '2025-11-21', period: 'Nov 17-21' }
];

// Prompt classification rules
function classifyPrompt(text) {
  const lower = text.toLowerCase();
  
  if (lower.match(/implement|create|add|build|develop|new feature|write.*function|write.*component|generate.*code/)) {
    return { category: 'feature_development', subcategory: 'implementation' };
  }
  if (lower.match(/fix|bug|error|issue|problem|broken|not working|failing/)) {
    return { category: 'bug_fix', subcategory: 'debugging' };
  }
  if (lower.match(/test|spec|unit test|integration test|e2e|playwright|jest/)) {
    return { category: 'testing', subcategory: 'test_writing' };
  }
  if (lower.match(/refactor|improve|optimize|clean up|reorganize|restructure/)) {
    return { category: 'refactoring', subcategory: 'code_improvement' };
  }
  if (lower.match(/document|comment|readme|explain.*code|add.*comments/)) {
    return { category: 'documentation', subcategory: 'code_documentation' };
  }
  if (lower.match(/what does|how does|explain|understand|analyze|read.*code|show me|find.*where/)) {
    return { category: 'code_understanding', subcategory: 'code_exploration' };
  }
  if (lower.match(/review|check|validate|verify|look at.*code/)) {
    return { category: 'code_review', subcategory: 'quality_check' };
  }
  if (lower.match(/git|commit|push|pull|merge|branch|rebase/)) {
    return { category: 'version_control', subcategory: 'git_operations' };
  }
  if (lower.match(/config|setup|install|configure|environment|settings/)) {
    return { category: 'configuration', subcategory: 'environment_setup' };
  }
  
  return { category: 'general', subcategory: 'other' };
}

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

const transcriptDir = path.join(__dirname, 'Junaid-Transcripts');
const files = findJSONLFiles(transcriptDir);

console.log(`Found ${files.length} JSONL transcript files`);

const weeklyPrompts = {};
WEEKS.forEach(week => {
  weeklyPrompts[week.name] = {
    period: week.period,
    prompts: [],
    categories: {}
  };
});

let processedCount = 0;
files.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  
  if (lines.length === 0) return;
  
  let conversationDate = null;
  try {
    const firstLine = JSON.parse(lines[0]);
    if (firstLine.timestamp) {
      conversationDate = new Date(firstLine.timestamp);
    }
  } catch (e) {
    return;
  }
  
  if (!conversationDate) return;
  
  let targetWeek = null;
  for (const week of WEEKS) {
    const startDate = new Date(week.start);
    const endDate = new Date(week.end);
    endDate.setHours(23, 59, 59, 999);
    
    if (conversationDate >= startDate && conversationDate <= endDate) {
      targetWeek = week.name;
      break;
    }
  }
  
  if (!targetWeek) return;
  
  // Parse all lines
  lines.forEach(line => {
    try {
      const entry = JSON.parse(line);
      if (entry.message && entry.message.role === 'user' && entry.message.content) {
        let textContent = '';
        
        // Handle both string and array content
        if (typeof entry.message.content === 'string') {
          textContent = entry.message.content;
        } else if (Array.isArray(entry.message.content)) {
          textContent = entry.message.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join(' ');
        }
        
        if (textContent && textContent !== 'Warmup') {
          const classification = classifyPrompt(textContent);
          
          weeklyPrompts[targetWeek].prompts.push({
            text: textContent.substring(0, 100),
            category: classification.category,
            subcategory: classification.subcategory,
            timestamp: entry.timestamp
          });
          
          if (!weeklyPrompts[targetWeek].categories[classification.category]) {
            weeklyPrompts[targetWeek].categories[classification.category] = {
              count: 0,
              subcategories: {}
            };
          }
          weeklyPrompts[targetWeek].categories[classification.category].count++;
          
          if (!weeklyPrompts[targetWeek].categories[classification.category].subcategories[classification.subcategory]) {
            weeklyPrompts[targetWeek].categories[classification.category].subcategories[classification.subcategory] = 0;
          }
          weeklyPrompts[targetWeek].categories[classification.category].subcategories[classification.subcategory]++;
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

console.log(`\n✅ Processed ${processedCount} files from Weeks 5-7`);

const summary = {};
WEEKS.forEach(week => {
  const data = weeklyPrompts[week.name];
  const totalPrompts = data.prompts.length;
  const avgLength = totalPrompts > 0 
    ? Math.round(data.prompts.reduce((sum, p) => sum + p.text.length, 0) / totalPrompts)
    : 0;
  
  let topCategory = null;
  let topCount = 0;
  Object.entries(data.categories).forEach(([cat, info]) => {
    if (info.count > topCount) {
      topCategory = cat;
      topCount = info.count;
    }
  });
  
  summary[week.name] = {
    period: week.period,
    totalPrompts,
    avgPromptLength: avgLength,
    topCategory,
    topCategoryCount: topCount,
    categories: data.categories
  };
  
  console.log(`\n${week.name} (${week.period}):`);
  console.log(`  Total Prompts: ${totalPrompts}`);
  console.log(`  Avg Length: ${avgLength} chars`);
  console.log(`  Top Category: ${topCategory || 'N/A'} (${topCount})`);
  if (Object.keys(data.categories).length > 0) {
    console.log('  Categories:');
    Object.entries(data.categories)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([cat, info]) => {
        console.log(`    ${cat}: ${info.count}`);
      });
  }
});

const outputPath = path.join(__dirname, 'prompt_categories_weeks_5-7.json');
fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));

console.log(`\n✅ Prompt categories saved to: ${outputPath}`);

