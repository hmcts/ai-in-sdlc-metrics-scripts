// NK/T (throughput) metrics calculation
const { execSync } = require('child_process');
const CONFIG = require('../../config');
const { filterPRsForWeek } = require('./prUtils');
const { fetchAllPRs } = require('./prAnalysis');

/**
 * Calculate business days between two dates (excluding weekends)
 */
function calculateBusinessDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Calculate NK/T metrics for a given week
 * Returns normalized knowledge throughput
 */
function calculateNKTForWeek(week) {
  const allPRs = fetchAllPRs();
  const featurePRs = filterPRsForWeek(allPRs, week);

  if (featurePRs.length === 0) {
    return {
      nkt: null,
      cycleTime: null
    };
  }

  const startDate = new Date(week.start);
  const endDate = new Date(week.end);
  endDate.setHours(23, 59, 59, 999);

  const weekDurationMs = endDate - startDate;
  const weekDurationDays = weekDurationMs / (24 * 60 * 60 * 1000);

  // Calculate cycle times (business days only)
  const cycleTimes = [];
  featurePRs.forEach(pr => {
    if (pr.mergedAt) {
      const created = new Date(pr.createdAt);
      const merged = new Date(pr.mergedAt);
      const cycleTimeBusinessDays = calculateBusinessDays(created, merged);
      cycleTimes.push(cycleTimeBusinessDays);
    }
  });

  const avgCycleTime = cycleTimes.length > 0
    ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
    : null;

  // Calculate NK/T
  // N = number of modules in the codebase
  // K = number of experiments (always 1 for this experiment)
  // T = average cycle time
  const N = 13; // Number of modules in codebase
  const K = 1;  // Single experiment
  const T = avgCycleTime || 1;

  const nkt = (N * K) / T;

  return {
    nkt: parseFloat(nkt.toFixed(2)),
    cycleTime: avgCycleTime ? parseFloat(avgCycleTime.toFixed(2)) : null
  };
}

module.exports = {
  calculateNKTForWeek
};
