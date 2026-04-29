const { readBlob, writeBlob } = require('./blobStorage');

const CUTOVER_WEEK_INDEX = 17; // Weeks 1–17 (index 0–16) are pre-cutover; week 18 = index 17

async function collect(context) {
  context.log('--- Merging all metrics ---');

  const [githubRaw, sonarRaw, transcriptRaw, jiraRaw, existingRaw] = await Promise.all([
    readBlob('output/github.json'),
    readBlob('output/sonar.json'),
    readBlob('output/transcript.json'),
    readBlob('output/jira.json'),
    readBlob('output/weeklyData.json').catch(() => null)
  ]);

  if (!githubRaw) throw new Error('output/github.json missing');
  if (!sonarRaw) throw new Error('output/sonar.json missing');
  if (!transcriptRaw) throw new Error('output/transcript.json missing');
  if (!jiraRaw) throw new Error('output/jira.json missing');

  const github          = JSON.parse(githubRaw);
  const sonar           = JSON.parse(sonarRaw);
  const transcript      = JSON.parse(transcriptRaw);
  const jira            = JSON.parse(jiraRaw);
  const tokensByTicket  = transcript.tokensByTicket || {};
  const promptsByTicket = transcript.promptsByTicket || {};
  const vibeMap         = jira.vibeMap || {};
  const issueMap        = jira.issueMap || {};

  // Build lookup of existing SP values to preserve pre-cutover history
  const existingSP = {};
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw);
      for (const w of (existing.weeklyData || [])) {
        if (w.week && w.storyPoints != null) existingSP[w.week] = w.storyPoints;
      }
      context.log(`  Loaded ${Object.keys(existingSP).length} preserved SP values from existing weeklyData`);
    } catch { /* ignore parse errors */ }
  }

  const merged = github.weeks.map((githubWeek, index) => {
    const { prTickets, prDates, prCiWindows, ...githubFields } = githubWeek;
    const week = {
      ...githubFields,
      ...(sonar.weeks[index]      || {}),
      ...(transcript.weeks[index] || {}),
      ...(jira.weeks[index]       || {})
    };

    // Preserve historical SP for pre-cutover weeks where jira.js returns null
    if (week.storyPoints == null && index < CUTOVER_WEEK_INDEX && existingSP[week.week] != null) {
      week.storyPoints = existingSP[week.week];
    }

    // Per-ticket details for tokens-per-SP-size chart
    const ticketDetails = {};
    for (const vibeId of (githubWeek.prTickets || [])) {
      const tokens = tokensByTicket[vibeId];
      const storyPoints = vibeMap[vibeId];
      if (tokens != null || storyPoints != null) {
        ticketDetails[vibeId] = {};
        if (tokens != null) ticketDetails[vibeId].tokens = tokens;
        if (storyPoints != null) ticketDetails[vibeId].storyPoints = storyPoints;
      }
    }
    for (const issueNum of (githubWeek.prIssueNumbers || [])) {
      const storyPoints = issueMap[issueNum];
      if (storyPoints != null) {
        const key = `#${issueNum}`;
        ticketDetails[key] = ticketDetails[key] || {};
        ticketDetails[key].storyPoints = storyPoints;
        // tokens not attributable by issue number alone
      }
    }
    if (Object.keys(ticketDetails).length > 0) week.ticketDetails = ticketDetails;

    // Cross-category derived metrics (cost fields skipped — no cost data)
    if (week.totalTokens && week.storyPoints && week.storyPoints > 0)
      week.tokensPerSP = week.totalTokens / week.storyPoints;

    if (week.totalTokens && week.cycleTime && week.cycleTime > 0)
      week.tokensPerCycleTime = week.totalTokens / week.cycleTime;

    if (week.locPerDev && week.totalTokens && week.totalTokens > 0)
      week.locPerToken = week.locPerDev / week.totalTokens;

    // avgPromptsPerPR — total prompts attributed to tickets merged this week / PR count
    const weekPrompts = (githubWeek.prTickets || []).reduce((sum, t) => sum + (promptsByTicket[t]?.length || 0), 0);
    if ((githubWeek.featurePRs || 0) > 0 && weekPrompts > 0)
      week.avgPromptsPerPR = Math.round(weekPrompts / githubWeek.featurePRs);

    // avgPromptsToPassBuild — avg prompts sent between first CI failure and first passing build
    const promptsInWindow = (prCiWindows || [])
      .map(w => {
        if (!w.ticket) return null;
        const timestamps = promptsByTicket[w.ticket];
        if (!timestamps?.length) return null;
        const count = timestamps.filter(ts => ts >= w.firstFailureTs && (w.firstPassTs === null || ts <= w.firstPassTs)).length;
        return count > 0 ? count : null;
      })
      .filter(n => n !== null);
    if (promptsInWindow.length > 0)
      week.avgPromptsToPassBuild = parseFloat((promptsInWindow.reduce((s, n) => s + n, 0) / promptsInWindow.length).toFixed(2));

    return week;
  });

  const outputData = {
    weeklyData: merged,
    labels: merged.map(d => d.period),
    validWeeks: merged.filter(d => d.featurePRs && d.featurePRs > 0)
  };

  await writeBlob('output/weeklyData.json', outputData);
  context.log(`  ✓ output/weeklyData.json written (${merged.length} weeks, ${outputData.validWeeks.length} with PRs)`);
}

module.exports = { collect };
