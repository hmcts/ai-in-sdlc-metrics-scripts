## This repo contains scripts to fetch data from the cath rewrite repo/jira board and perform queries. 

## Current Workflow to fetch data and query
## Part 1 - retrieving metrics from transcripts
1. Ensure transcripts are located within 'Transcript-conversion' folder

2. To get compactions from transcripts, run `node detect_compactions_from_transcripts.js`. This will generate a JSON file with all recorded compactions and summary including percentage of manual vs automatic

3. To extract prompt categories from transcripts, run `node extract_prompt_categories_from_transcripts.js`. This will generate a JSON file with all prompt categories found in the transcripts.

4. (Known limitation) Move the transcripts outside of the 'Transcrip-conversion' folder to run `tokens_per_week_by_pr.js`. This will output a JSON of all tickets worked on in the transcript that are complete, attributing token usage to each one, broken down by week.

At the end of this stage, you should have 3 JSON files, and all necessary metrics from the transcripts extracted.

## Part 2 - retrieving metrics from GitHub/SonarCloud/Bedrock
1. Run `node generate_dashboard_data.js` to generate a timestamped JSON file containing all metrics (excluding token-based ones) and automatically plot these to the dashboard. 

# Part 3 - manually combining transcript data with API data
1. At this stage, there is no script to automatically combine the two, so I usually would ask claude to add it or add them myself. The transcript metrics need to be added to `weekly_metrics_plot.js` 

