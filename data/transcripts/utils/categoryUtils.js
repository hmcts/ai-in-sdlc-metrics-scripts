// Prompt category classification helpers
const CONFIG = require('../../config');
const { findFiles, readJSONL } = require('../../shared/utils/fileUtils');
const { isInWeek } = require('../../shared/utils/dateUtils');

// Category patterns
const CATEGORIES = {
  feature_development: /implement|add feature|create|build|develop|new feature/i,
  bug_fix: /fix|bug|error|issue|problem|broken|debug/i,
  testing: /test|spec|jest|playwright|unit test|e2e|integration test/i,
  refactoring: /refactor|reorganize|restructure|clean up|improve code/i,
  documentation: /document|readme|comment|doc|explain|describe/i,
  code_review: /review|check|validate|verify|examine/i,
  code_understanding: /how does|what does|explain|understand|clarify/i,
  version_control: /commit|push|pull|merge|branch|git/i,
  configuration: /config|setup|install|configure|environment/i,
  general: /.*/  // Catch-all
};

function classifyPrompt(text) {
  if (!text || typeof text !== 'string') return 'general';

  for (const [category, pattern] of Object.entries(CATEGORIES)) {
    if (category === 'general') continue; // Check this last
    if (pattern.test(text)) {
      return category;
    }
  }

  return 'general';
}

function analyzePromptCategoriesForWeek(week) {
  const transcriptsDir = CONFIG.TRANSCRIPTS_DIR;

  if (!transcriptsDir) {
    throw new Error('TRANSCRIPTS_DIR not configured');
  }

  const files = findFiles(transcriptsDir, '.jsonl');
  const categoryCount = {};
  const promptLengths = [];
  let totalPrompts = 0;

  files.forEach(filePath => {
    const entries = readJSONL(filePath);

    // Determine if this file is in the target week by checking first entry timestamp
    if (entries.length === 0) return;
    const firstEntry = entries[0];
    if (!firstEntry.timestamp) return;
    if (!isInWeek(firstEntry.timestamp, week)) return;

    entries.forEach(entry => {
      // Check for user message (NOT entry.role, but entry.message.role)
      if (!entry.message || entry.message.role !== 'user') return;
      if (!entry.message.content) return;

      let textContent = '';
      if (typeof entry.message.content === 'string') {
        textContent = entry.message.content;
      } else if (Array.isArray(entry.message.content)) {
        textContent = entry.message.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join(' ');
      }

      // Skip empty content and "Warmup" prompts
      if (!textContent || textContent.trim().length === 0 || textContent === 'Warmup') return;

      totalPrompts++;
      promptLengths.push(textContent.length);

      const category = classifyPrompt(textContent);
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    });
  });

  // Calculate averages
  const avgPromptLength = promptLengths.length > 0
    ? Math.round(promptLengths.reduce((a, b) => a + b, 0) / promptLengths.length)
    : 0;

  // Find top category
  let topCategory = null;
  let topCategoryCount = 0;
  Object.entries(categoryCount).forEach(([cat, count]) => {
    if (count > topCategoryCount) {
      topCategory = cat;
      topCategoryCount = count;
    }
  });

  // Format categories for output
  const promptCategories = {};
  Object.entries(categoryCount).forEach(([cat, count]) => {
    promptCategories[cat] = { count };
  });

  return {
    totalPrompts,
    avgPromptLength,
    topCategory,
    topCategoryCount,
    topSubcategory: null,  // Not implemented yet
    topSubcategoryCount: 0,
    promptCategories
  };
}

module.exports = {
  analyzePromptCategoriesForWeek,
  classifyPrompt
};
