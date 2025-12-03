// Parse Bedrock costs CSV and aggregate by week
const fs = require('fs');
const path = require('path');
const CONFIG = require('../../config');

/**
 * Parse Bedrock costs CSV file
 * Returns array of { date, totalCost, claudeCost }
 */
function parseBedrockCosts() {
  const csvPath = CONFIG.BEDROCK_COSTS_FILE;

  if (!fs.existsSync(csvPath)) {
    console.log(`  ⚠ Bedrock costs file not found: ${csvPath}`);
    return [];
  }

  try {
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      console.log(`  ⚠ Bedrock costs file is empty`);
      return [];
    }

    // Parse header (remove quotes)
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, ''));
    const dateIndex = 0; // First column is the date (or "Service")
    const claudeSonnetIndex = headers.findIndex(h => h.includes('Claude Sonnet 4'));
    const claudeHaiku3Index = headers.findIndex(h => h.includes('Claude 3 Haiku'));
    const claudeHaiku4Index = headers.findIndex(h => h.includes('Claude Haiku 4'));
    const totalCostIndex = headers.findIndex(h => h.includes('Total costs'));

    const costs = [];

    // Skip header row and "Service total" row
    for (let i = 2; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.replace(/^"|"$/g, ''));

      if (values.length < 2) continue;

      const dateStr = values[dateIndex];

      // Skip empty or invalid dates
      if (!dateStr || dateStr.trim() === '' || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        continue;
      }

      const totalCost = parseFloat(values[totalCostIndex]) || 0;
      const claudeSonnetCost = parseFloat(values[claudeSonnetIndex]) || 0;
      const claudeHaiku3Cost = claudeHaiku3Index >= 0 ? parseFloat(values[claudeHaiku3Index]) || 0 : 0;
      const claudeHaiku4Cost = claudeHaiku4Index >= 0 ? parseFloat(values[claudeHaiku4Index]) || 0 : 0;
      const claudeCost = claudeSonnetCost + claudeHaiku3Cost + claudeHaiku4Cost;

      costs.push({
        date: new Date(dateStr),
        totalCost: totalCost,
        claudeCost: claudeCost,
        claudeSonnetCost: claudeSonnetCost,
        claudeHaiku3Cost: claudeHaiku3Cost,
        claudeHaiku4Cost: claudeHaiku4Cost
      });
    }

    return costs;
  } catch (error) {
    console.error(`  ⚠ Error parsing Bedrock costs: ${error.message}`);
    return [];
  }
}

/**
 * Calculate total costs for a given week
 */
function getCostsForWeek(week) {
  const costs = parseBedrockCosts();

  if (costs.length === 0) {
    return {
      totalCost: null,
      claudeCost: null
    };
  }

  const startDate = new Date(week.start);
  const endDate = new Date(week.end);
  endDate.setHours(23, 59, 59, 999);

  let totalCost = 0;
  let claudeCost = 0;

  costs.forEach(entry => {
    if (entry.date >= startDate && entry.date <= endDate) {
      totalCost += entry.totalCost;
      claudeCost += entry.claudeCost;
    }
  });

  return {
    totalCost: totalCost > 0 ? parseFloat(totalCost.toFixed(2)) : null,
    claudeCost: claudeCost > 0 ? parseFloat(claudeCost.toFixed(2)) : null
  };
}

module.exports = {
  parseBedrockCosts,
  getCostsForWeek
};
