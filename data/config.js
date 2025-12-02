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
  REPO: 'hmcts/cath-service',
  PROJECT_KEY: 'hmcts.cath',
  SONAR_TOKEN: process.env.SONAR_TOKEN,
  JIRA_TOKEN: process.env.JIRA_TOKEN,
  JIRA_BOARD_ID: '3111',
  BEDROCK_COSTS_FILE: path.join(__dirname, '../bedrock-costs.csv'),
  METRICS: 'coverage,vulnerabilities,duplicated_lines_density,sqale_rating,reliability_rating,security_rating,bugs,code_smells',
  MAX_PRS: 100,
  EXCLUDED_TICKETS: [
    'VIBE-207','VIBE-163','VIBE-164','VIBE-165','VIBE-170','VIBE-171','VIBE-172','VIBE-173','VIBE-176','VIBE-182','VIBE-193','VIBE-194','VIBE-197','VIBE-198','VIBE-211','VIBE-212','VIBE-213','VIBE-217','VIBE-218',
  ],
};

module.exports = CONFIG;
