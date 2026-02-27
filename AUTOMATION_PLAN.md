# CaTH Metrics Automation Plan

## Current Workflow (Manual Process)

**Steps:**
1. End of week: Ask developers for transcripts
2. Developers manually send their `.jsonl` files
3. Metrics team places files in `data/transcripts/files/`
4. Metrics team manually runs:
   - `node data/orchestration/generateDashboard.js`
   - `node weekly_metrics_report.js`
5. Team reviews PDF report
6. Repeat next week

**Pain Points:**
- Manual transcript collection every week
- Developers must remember to share files
- Metrics team must manually run scripts
- No real-time visibility into metrics
- PDF reports are static snapshots
- Time-consuming and error-prone

---

## Proposed Automated Workflow

**Steps:**
1. Developers work normally in Claude Code
2. Every 15 minutes + on session end → transcripts auto-upload to Azure Blob Storage
3. Every 4 hours → Azure Function automatically:
   - Fetches transcripts from Azure Blob Storage
   - Runs existing scripts (generateDashboard.js)
   - Outputs weeklyData.json to Azure Blob Storage
4. Grafana pulls metrics directly from Azure Blob Storage
5. Team views live Grafana dashboards anytime

**Benefits:**
- Zero manual transcript collection
- Zero manual script execution
- Near real-time metrics (updated every 4 hours)
- Live interactive dashboards
- Historical data preserved
- All existing scripts unchanged

---

## Prerequisites

### Azure Resources Required
1. **Azure Blob Storage** - Store transcripts and generated metrics
2. **Azure Function App** - Run metrics processing scripts every 4 hours
3. **Grafana** - Live dashboard pulling data directly from Blob Storage

### Developer Machine Setup
- Install Azure CLI (`brew install azure-cli`)
- Install Claude Code hooks (on-session-end.sh + on-stop.sh)
- One-time setup: ~15 minutes per developer

---

## What Changes

### New Components
- 2 Claude Code hooks on each developer machine (on-session-end.sh + on-stop.sh)
- Azure Function running existing scripts every 4 hours
- Grafana dashboards for live metrics visualization

### What Stays the Same
- All existing data processing scripts
- weeklyData.js structure
- Metrics calculations
- Current codebase (no refactoring needed)

### What's Removed
- Manual transcript requests
- Manual script execution
- Manual file sharing between developers and metrics team
