#!/usr/bin/env bash
# Open React Native DevTools (Fusebox) in Chrome for the first Hermes target.
# Requires: Metro running, app connected (Hermes). Prefer USB + adb reverse.
set -euo pipefail

adb reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true

LIST="$(curl -fsS http://127.0.0.1:8081/json/list 2>/dev/null || true)"
if [[ -z "$LIST" || "$LIST" == "[]" ]]; then
  echo "No Hermes target on Metro. Open the app on the phone, wait for the bundle, then retry."
  echo "Also ensure: adb reverse tcp:8081 tcp:8081"
  exit 1
fi

PATH_PART="$(node -e "
const list = JSON.parse(process.argv[1]);
const t = list[0];
if (!t?.devtoolsFrontendUrl) process.exit(2);
process.stdout.write(t.devtoolsFrontendUrl);
" "$LIST")"

URL="http://127.0.0.1:8081${PATH_PART}"
echo "Opening: $URL"
open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL"
