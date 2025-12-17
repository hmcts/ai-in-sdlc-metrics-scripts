// Centralized configuration and environment loading
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}
loadEnv();

const CONFIG = {
  // Repository
  REPO: 'hmcts/cath-service',
  PROJECT_KEY: 'hmcts.cath',

  // API Tokens
  SONAR_TOKEN: process.env.SONAR_TOKEN,
  JIRA_TOKEN: process.env.JIRA_TOKEN,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  JIRA_BOARD_ID: '3111',

  // File paths
  BEDROCK_COSTS_FILE: path.join(__dirname, 'Costs/merged-bedrock-costs.csv'),
  TRANSCRIPTS_DIR: path.join(__dirname, 'transcripts/files'),
  ANALYTICS_DIR: path.join(__dirname, '../.claude/analytics-v2'),

  // Metrics
  METRICS: 'coverage,vulnerabilities,duplicated_lines_density,sqale_rating,reliability_rating,security_rating,bugs,code_smells',
  MAX_PRS: 100,

  // Exclusions
  EXCLUDED_TICKETS: [
    'VIBE-207','VIBE-163','VIBE-164','VIBE-165','VIBE-170','VIBE-171','VIBE-172','VIBE-173','VIBE-176','VIBE-182','VIBE-193','VIBE-194','VIBE-197','VIBE-198','VIBE-211','VIBE-212','VIBE-213','VIBE-217','VIBE-218',
  ],

  // Week definitions
  WEEKS: [
    { name: 'Week 1', start: '2025-10-07', end: '2025-10-10', period: 'Oct 7-10' },
    { name: 'Week 2', start: '2025-10-13', end: '2025-10-17', period: 'Oct 13-17' },
    { name: 'Week 3', start: '2025-10-20', end: '2025-10-24', period: 'Oct 20-24' },
    { name: 'Week 4', start: '2025-10-27', end: '2025-10-31', period: 'Oct 27-31' },
    { name: 'Week 5', start: '2025-11-03', end: '2025-11-07', period: 'Nov 3-7' },
    { name: 'Week 6', start: '2025-11-10', end: '2025-11-14', period: 'Nov 10-14' },
    { name: 'Week 7', start: '2025-11-17', end: '2025-11-21', period: 'Nov 17-21' },
    { name: 'Week 8', start: '2025-11-24', end: '2025-11-28', period: 'Nov 24-28' },
    { name: 'Week 9', start: '2025-12-01', end: '2025-12-05', period: 'Dec 1-5' }
  ]
};

module.exports = CONFIG;
