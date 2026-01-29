/**
 * @typedef {Object} NormalizedWeek
 * @property {string} name - Week name (e.g., "Week 1")
 * @property {Date} startDate - Parsed start date (00:00:00 UTC)
 * @property {Date} endDate - Parsed end date (23:59:59 UTC)
 * @property {string} period - Display period (e.g., "Oct 7-10")
 * @property {string} startString - Original start string (for backward compatibility)
 * @property {string} endString - Original end string (for backward compatibility)
 */

/**
 * Normalize week from config format to structured dates
 * Parses date strings once instead of repeatedly in each module
 *
 * @param {Object} week - Week object from CONFIG.WEEKS
 * @param {string} week.name - Week name
 * @param {string} week.start - Start date string (YYYY-MM-DD)
 * @param {string} week.end - End date string (YYYY-MM-DD)
 * @param {string} week.period - Display period
 * @returns {NormalizedWeek} Week with parsed Date objects
 *
 * @example
 * const week = { name: 'Week 1', start: '2025-10-07', end: '2025-10-10', period: 'Oct 7-10' };
 * const normalized = normalizeWeek(week);
 * console.log(normalized.startDate); // Date object for 2025-10-07T00:00:00Z
 */
function normalizeWeek(week) {
  return {
    name: week.name,
    startDate: new Date(week.start + 'T00:00:00Z'),
    endDate: new Date(week.end + 'T23:59:59Z'),
    period: week.period,
    startString: week.start,  // Keep for API calls that need strings
    endString: week.end
  };
}

module.exports = { normalizeWeek };
