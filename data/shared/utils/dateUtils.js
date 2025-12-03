// Date and week calculation utilities

function isInWeek(timestamp, week) {
  const date = new Date(timestamp);
  const startDate = new Date(week.start);
  const endDate = new Date(week.end);
  endDate.setHours(23, 59, 59, 999);
  return date >= startDate && date <= endDate;
}

function getWeekForTimestamp(timestamp, weeks) {
  const date = new Date(timestamp);

  for (const week of weeks) {
    const startDate = new Date(week.start);
    const endDate = new Date(week.end);
    endDate.setHours(23, 59, 59, 999);

    if (date >= startDate && date <= endDate) {
      return week.name;
    }
  }

  return null;
}

function calculateDaysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function calculateWeeks(startDate, endDate) {
  return calculateDaysBetween(startDate, endDate) / 7;
}

module.exports = {
  isInWeek,
  getWeekForTimestamp,
  calculateDaysBetween,
  calculateWeeks
};
