#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export JAVA_HOME="${JAVA_HOME:-/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

if [[ ! -x "$JAVA_HOME/bin/java" ]]; then
  echo "Java not found at JAVA_HOME=$JAVA_HOME"
  echo "Install Temurin 17 or set JAVA_HOME."
  exit 1
fi

if [[ ! -d "$ANDROID_HOME" ]]; then
  echo "Android SDK not found at ANDROID_HOME=$ANDROID_HOME"
  exit 1
fi

npx expo prebuild --platform android
(
  cd android
  ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --no-daemon
)

APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "APK ready: $APK"
echo "Install on device, then: npx expo start --dev-client"
echo "USB ingest: bash scripts/debug-ingest-reverse.sh"
