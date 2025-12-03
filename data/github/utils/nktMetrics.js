// NK/T (throughput) metrics calculation
const { execSync } = require('child_process');
const CONFIG = require('../../config');
const { filterPRsForWeek } = require('./prUtils');
const { fetchAllPRs } = require('./prAnalysis');

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

  // Calculate cycle times
  const cycleTimes = [];
  featurePRs.forEach(pr => {
    if (pr.mergedAt) {
      const created = new Date(pr.createdAt).getTime();
      const merged = new Date(pr.mergedAt).getTime();
      const cycleTimeDays = (merged - created) / (24 * 60 * 60 * 1000);
      cycleTimes.push(cycleTimeDays);
    }
  });

  const avgCycleTime = cycleTimes.length > 0
    ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
    : null;

  // Calculate NK/T
  // N = number of feature PRs (independent changes)
  // K = number of developers (calculated from unique authors)
  const uniqueDevs = new Set(featurePRs.map(pr => pr.author.login)).size;

  // T = average cycle time
  const N = featurePRs.length;
  const K = uniqueDevs;
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
