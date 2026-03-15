# CaTH AI Metrics — Dashboard Definitions

Two dashboards fed from the same `weeklyData.json` source (`$.weeklyData[*]`), split by audience.

---

## Dashboard 1 — Stakeholder View

**Audience:** Delivery managers, product owners, senior stakeholders
**Question:** Is AI-assisted development improving our delivery speed and quality?

| Panel | Visualization | Fields | Notes |
|-------|--------------|--------|-------|
| Story points delivered | Bar chart | `week`, `storyPoints` | Skip nulls |
| WIP story points | Bar chart | `week`, `wipSP` | |
| Feature PRs / week | Bar chart | `week`, `featurePRs` | |
| LOC per developer | Line chart | `week`, `locPerDev` | Baselines: Original CaTH=678, HMCTS Std=301, Agentic=2280 |
| NK/T ratio | Line chart | `week`, `nkt` | Higher = better throughput |
| Avg cycle time (days) | Line chart | `week`, `cycleTime` | Lower = better |
| Test coverage (%) | Line chart | `week`, `testCoverage` | |
| Code quality | Multi-line | `week`, `reliability`, `security`, `maintainability` | SonarQube ratings (1=A, 5=E) |
| Bugs | Bar chart | `week`, `bugs` | |
| Code smells | Bar chart | `week`, `codeSmells` | |
| Duplicated lines (%) | Line chart | `week`, `duplicatedLines` | |
| CVEs | Bar chart | `week`, `cves` | |
| Cost per story point | Line chart | `week`, `costPerSP` | |
| Total weekly cost (£) | Bar chart | `week`, `totalCost` | |
| Avg prompts per PR | Line chart | `week`, `avgPromptsPerPR` | Higher = more Claude involvement per feature |

---

## Dashboard 2 — Developer View

**Audience:** Dev team, metrics team
**Question:** How is Claude being used and how efficiently?

| Panel | Visualization | Fields | Notes |
|-------|--------------|--------|-------|
| Token breakdown / week | Stacked bar | `week`, `inputTokens`, `cacheCreationTokens`, `cacheReadTokens`, `outputTokens` | |
| Total tokens / week | Bar chart | `week`, `totalTokens` | |
| Tokens per story point | Line chart | `week`, `tokensPerSP` | Skip weeks with no SP data |
| Tokens per cycle time | Line chart | `week`, `tokensPerCycleTime` | |
| LOC per token | Line chart | `week`, `locPerToken` | Higher = more efficient |
| Compactions / week | Stacked bar | `week`, `manualCompactions`, `autoCompactions` | |
| Avg time to context window (mins) | Bar chart | `week`, `avgTimeToContextWindow` | Null = no compactions that week |
| Interruption rate (%) | Line chart | `week`, `interruptionRate` | |
| Tool error rate (%) | Line chart | `week`, `errorRate` | |
| Total tool uses / week | Bar chart | `week`, `toolUses` | |
| Total prompts / week | Bar chart | `week`, `totalPrompts` | |
| Avg prompt length (chars) | Bar chart | `week`, `avgPromptLength` | |
| Top prompt category | Bar chart | `week`, `topCategory`, `topCategoryCount` | |
| LOC per developer | Line chart | `week`, `locPerDev` | Baselines: Original CaTH=678, HMCTS Std=301, Agentic=2280 |
| Test coverage (%) | Line chart | `week`, `testCoverage` | |
| Code quality | Multi-line | `week`, `reliability`, `security`, `maintainability` | SonarQube ratings (1=A, 5=E) |
| Bugs | Bar chart | `week`, `bugs` | |
| Code smells | Bar chart | `week`, `codeSmells` | |
| Duplicated lines (%) | Line chart | `week`, `duplicatedLines` | |
| CVEs | Bar chart | `week`, `cves` | |
| PR review comments / PR | Line chart | `week`, `commentsPerPR` | |
| Avg prompts per PR | Line chart | `week`, `avgPromptsPerPR` | Higher = more Claude involvement per feature |
| Tool breakdown / week | Stacked bar | `week`, `toolBreakdown.Read`, `toolBreakdown.Edit`, `toolBreakdown.Bash`, `toolBreakdown.Grep`, `toolBreakdown.Glob`, `toolBreakdown.Write`, `toolBreakdown.Task` | |

---


## Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `week` | string | "Week N" label |
| `period` | string | Date range e.g. "Oct 7-10" |
| `featurePRs` | number | Feature PRs merged that week |
| `locPerPR` | number | Lines of code per PR |
| `locPerDev` | number | Lines of code per developer |
| `commentsPerPR` | number | Avg review comments per PR |
| `testCoverage` | number | Test coverage % (SonarQube) |
| `cves` | number | CVEs detected |
| `duplicatedLines` | number | % duplicated lines (SonarQube) |
| `maintainability` | number | SonarQube maintainability rating (1–5) |
| `reliability` | number | SonarQube reliability rating (1–5) |
| `security` | number | SonarQube security rating (1–5) |
| `bugs` | number | SonarQube bugs count |
| `codeSmells` | number | SonarQube code smells count |
| `storyPoints` | number | Story points delivered |
| `wipSP` | number | Work-in-progress story points |
| `nkt` | number | NK/T throughput ratio |
| `cycleTime` | number | Avg cycle time in days |
| `manualCompactions` | number | Manual context compactions |
| `autoCompactions` | number | Automatic context compactions (ran out of context) |
| `avgTimeToContextWindow` | number | Avg mins from session start to first compaction |
| `totalPrompts` | number | Total user prompts |
| `avgPromptLength` | number | Avg prompt length in characters |
| `topCategory` | string | Most common prompt category |
| `topCategoryCount` | number | Count of top category prompts |
| `promptCategories` | object | Prompt counts by category |
| `interruptions` | number | Times user interrupted Claude mid-turn |
| `interruptionRate` | number | Interruptions as % of total prompts |
| `toolUses` | number | Total tool calls made by Claude |
| `toolErrors` | number | Tool calls that returned errors |
| `errorRate` | number | Tool errors as % of total tool uses |
| `inputTokens` | number | Input tokens used |
| `cacheCreationTokens` | number | Cache write tokens |
| `cacheReadTokens` | number | Cache read tokens |
| `outputTokens` | number | Output tokens generated |
| `totalTokens` | number | Total tokens (all types) |
| `totalCost` | number | Estimated weekly cost in GBP |
| `costPerSP` | number | Cost per story point delivered |
| `costPerPR` | number | Cost per feature PR |
| `costPerLOC` | number | Cost per line of code |
| `tokensPerSP` | number | Total tokens per story point |
| `tokensPerCycleTime` | number | Total tokens per day of cycle time |
| `locPerToken` | number | Lines of code produced per token |
| `avgPromptsPerPR` | number | Avg number of user prompts per feature PR merged that week |
| `toolBreakdown` | object | Tool call counts by type e.g. `{ Read: 45, Edit: 23, Bash: 67 }` |
