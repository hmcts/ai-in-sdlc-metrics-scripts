const businessSurvey = require('./survey/survey_results_business.json');
const developerSurvey = require('./survey/survey_results_developers.json');

function normaliseMonthKey(entry) {
  if (entry['Month']) return entry['Month'];
  if (entry['Month ']) return entry['Month '];
  return undefined;
}

function groupByMonth(data, label) {
  const grouped = {};
  for (const entry of data) {
    const month = normaliseMonthKey(entry);
    if (!month) continue;
    if (!grouped[month]) grouped[month] = { business: [], developers: [] };
    grouped[month][label].push(entry);
  }
  return grouped;
}

const groupedBusiness = groupByMonth(businessSurvey, 'business');
const groupedDevelopers = groupByMonth(developerSurvey, 'developers');

const allMonths = new Set([
  ...Object.keys(groupedBusiness),
  ...Object.keys(groupedDevelopers)
]);

const surveyData = {};
for (const month of allMonths) {
  surveyData[month] = {
    business: (groupedBusiness[month] ? groupedBusiness[month].business : []),
    developers: (groupedDevelopers[month] ? groupedDevelopers[month].developers : [])
  };
}

module.exports = { surveyData };
