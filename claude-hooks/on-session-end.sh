#!/bin/bash

# Claude Code hook: Auto-upload transcript to Azure Blob Storage on session end
# This hook is triggered automatically when a Claude Code session ends
# Receives the transcript file path as $1

TRANSCRIPT_PATH="$1"
LOG_FILE="$HOME/.claude/transcript-upload.log"

# Find the project root (where .env file lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

# Load Azure Storage credentials from project .env file
if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | grep -E '^AZURE_' | xargs)
else
    echo "[$(date)] ERROR: .env file not found: $ENV_FILE" >> "$LOG_FILE"
    exit 1
fi

STORAGE_ACCOUNT="${AZURE_STORAGE_ACCOUNT:-empiricalmetrics}"
CONTAINER="${AZURE_STORAGE_CONTAINER:-claude-transcripts}"
STORAGE_KEY="$AZURE_STORAGE_KEY"

# Check if storage key is set
if [ -z "$STORAGE_KEY" ]; then
    echo "[$(date)] ERROR: AZURE_STORAGE_KEY not set in .env" >> "$LOG_FILE"
    exit 1
fi

# Exit if no transcript path provided
if [ -z "$TRANSCRIPT_PATH" ]; then
    echo "[$(date)] ERROR: No transcript path provided" >> "$LOG_FILE"
    exit 1
fi

# Exit if transcript file doesn't exist
if [ ! -f "$TRANSCRIPT_PATH" ]; then
    echo "[$(date)] ERROR: Transcript file not found: $TRANSCRIPT_PATH" >> "$LOG_FILE"
    exit 1
fi

# Get username and transcript filename
USERNAME=$(whoami)
FILENAME=$(basename "$TRANSCRIPT_PATH")
WEEK=$(date +%Y-W%V)

# Construct blob path: transcripts/{username}/{week}/{filename}
BLOB_PATH="transcripts/${USERNAME}/${WEEK}/${FILENAME}"

# Upload in background so it doesn't block Claude Code from closing
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
        echo "[$(date)] SUCCESS: Uploaded $FILENAME" >> "$LOG_FILE"
    else
        echo "[$(date)] ERROR: Failed to upload $FILENAME" >> "$LOG_FILE"
    fi
) &

# Exit immediately (upload happens in background)
exit 0
