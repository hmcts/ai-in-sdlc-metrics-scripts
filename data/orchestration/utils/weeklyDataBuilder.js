// Auto-generate data/weeklyData.json from collected metrics
const fs = require('fs');
const path = require('path');

/**
 * Build weekly data JSON file from collected metrics
 * Replaces the previous JavaScript source code generation approach
 *
 * @param {Array<Object>} weeklyMetrics - Array of weekly metric objects
 * @returns {string} Path to generated JSON file
 */
function buildWeeklyData(weeklyMetrics) {
  const weeklyDataPath = path.join(__dirname, '../../../data/weeklyData.json');

  // Clean up metrics and ensure consistent field naming
  const cleanedMetrics = weeklyMetrics.map(w => ({
    ...w,
    // Rename field for consistency (weeklyDataBuilder used avgTimeToContextWindow)
    timeToContextWindow: w.avgTimeToContextWindow !== undefined ? w.avgTimeToContextWindow : null,
    // Rename field for consistency (interruptions uses 'prompts' but we export as 'interruptionPrompts')
    interruptionPrompts: w.prompts !== undefined ? w.prompts : 0,
    // Remove internal fields if present
    // (none currently, but this is where we'd filter)
  }));

  // Build output structure matching the old weeklyData.js format
  const output = {
    weeklyData: cleanedMetrics,
    labels: cleanedMetrics.map(d => d.period),
    validWeeks: cleanedMetrics.filter(d => d.featurePRs > 0)
  };

  // Write as JSON (much simpler than template strings!)
  fs.writeFileSync(weeklyDataPath, JSON.stringify(output, null, 2));

  console.log(`✓ Generated ${weeklyDataPath}`);
  return weeklyDataPath;
}

module.exports = { buildWeeklyData };
