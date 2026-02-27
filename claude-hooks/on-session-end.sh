#!/bin/bash
 
# Claude Code hook: Auto-upload transcript to Azure Blob Storage
# Triggers on Stop (after Claude responds) and SessionEnd
# Receives JSON input via stdin with transcript_path field
 
LOG_FILE="$HOME/.claude/transcript-upload.log"
LAST_UPLOAD_FILE="$HOME/.claude/.last-transcript-upload"
THROTTLE_MINUTES=15
 
# Read JSON input from stdin and extract transcript_path
INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path')
 
# Load Azure Storage credentials from .env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$(cd "$SCRIPT_DIR/.." && pwd)/.env"
if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | grep -E '^AZURE_' | xargs)
else
    echo "[$(date)] ERROR: .env file not found: $ENV_FILE" >> "$LOG_FILE"
    exit 1
fi

STORAGE_ACCOUNT="${AZURE_STORAGE_ACCOUNT:-empiricalmetrics}"
CONTAINER="${AZURE_STORAGE_CONTAINER:-claude-transcripts}"
STORAGE_KEY="$AZURE_STORAGE_KEY"

if [ -z "$STORAGE_KEY" ]; then
    echo "[$(date)] ERROR: AZURE_STORAGE_KEY not set in .env" >> "$LOG_FILE"
    exit 1
fi
 
# Exit if no transcript path provided
if [ -z "$TRANSCRIPT_PATH" ] || [ "$TRANSCRIPT_PATH" = "null" ]; then
    echo "[$(date)] DEBUG: No transcript path provided, skipping" >> "$LOG_FILE"
    exit 0
fi
 
# Exit if transcript file doesn't exist
if [ ! -f "$TRANSCRIPT_PATH" ]; then
    echo "[$(date)] DEBUG: Transcript file not found: $TRANSCRIPT_PATH, skipping" >> "$LOG_FILE"
    exit 0
fi
 
# Throttle: check if we uploaded this transcript recently
TRANSCRIPT_HASH=$(echo "$TRANSCRIPT_PATH" | md5)
LAST_UPLOAD_MARKER="${LAST_UPLOAD_FILE}_${TRANSCRIPT_HASH}"
 
if [ -f "$LAST_UPLOAD_MARKER" ]; then
    LAST_UPLOAD=$(cat "$LAST_UPLOAD_MARKER")
    CURRENT_TIME=$(date +%s)
    TIME_DIFF=$((CURRENT_TIME - LAST_UPLOAD))
 
    # Skip if less than THROTTLE_MINUTES have passed
    if [ $TIME_DIFF -lt $((THROTTLE_MINUTES * 60)) ]; then
        echo "[$(date)] DEBUG: Throttled - only $((TIME_DIFF / 60)) minutes since last upload (need ${THROTTLE_MINUTES})" >> "$LOG_FILE"
        exit 0
    fi
fi
 
echo "[$(date)] DEBUG: Proceeding with upload for $TRANSCRIPT_PATH" >> "$LOG_FILE"
 
# Get username and transcript filename
USERNAME=$(whoami)
FILENAME=$(basename "$TRANSCRIPT_PATH")
WEEK=$(date +%Y-W%V)
 
# Construct blob path: transcripts/{username}/{week}/{filename}
BLOB_PATH="transcripts/${USERNAME}/${WEEK}/${FILENAME}"
 
# Upload in background so it doesn't block Claude Code
(
    echo "[$(date)] Uploading: $TRANSCRIPT_PATH -> $BLOB_PATH" >> "$LOG_FILE"
 
    az storage blob upload \
        --account-name "$STORAGE_ACCOUNT" \
        --container-name "$CONTAINER" \
        --name "$BLOB_PATH" \
        --file "$TRANSCRIPT_PATH" \
        --account-key "$STORAGE_KEY" \
        --overwrite \
        --only-show-errors >> "$LOG_FILE" 2>&1
 
    if [ $? -eq 0 ]; then
        # Record upload timestamp for throttling
        date +%s > "$LAST_UPLOAD_MARKER"
        echo "[$(date)] SUCCESS: Uploaded $FILENAME" >> "$LOG_FILE"
    else
        echo "[$(date)] ERROR: Failed to upload $FILENAME" >> "$LOG_FILE"
    fi
) &
 
# Exit immediately (upload happens in background)
exit 0