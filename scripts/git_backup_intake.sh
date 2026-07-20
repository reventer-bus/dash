#!/bin/bash
# Safety net: catch any submissions that didn't auto-push to GitHub.
# Runs via cron every 10 min. Stages + commits + pushes anything uncommitted.
# Silent on success (no output = nothing to report), noisy on failure.

set -euo pipefail

INTAKE_DIR="/home/reventer/dash/data/intake"
LOG_TAG="[intake-git-sync]"

cd "$INTAKE_DIR" || { echo "$LOG_TAG Cannot cd to $INTAKE_DIR"; exit 1; }

# Check for uncommitted changes
if git diff --quiet HEAD -- && git diff --cached --quiet; then
    # Also check for untracked files
    UNTRACKED=$(git ls-files --others --exclude-standard | head -1)
    if [ -z "$UNTRACKED" ]; then
        # Nothing to do — stay silent
        exit 0
    fi
fi

# Stage everything
git add -A

# Commit
git commit -m "Auto-sync: catch-up push $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Push
if git push origin main 2>&1; then
    echo "$LOG_TAG Pushed pending submissions to GitHub"
else
    echo "$LOG_TAG FAILED to push — check network or git config"
    exit 1
fi