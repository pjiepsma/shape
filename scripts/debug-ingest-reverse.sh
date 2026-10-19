#!/usr/bin/env bash
# USB path: phone 127.0.0.1:7482 → Mac Cursor debug ingest.
set -euo pipefail

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found (ANDROID_HOME=$ANDROID_HOME)"
  exit 1
fi

adb reverse tcp:7482 tcp:7482
adb reverse tcp:17482 tcp:17482
adb reverse --list
echo "OK — device localhost:7482/17482 forwards to this Mac."
