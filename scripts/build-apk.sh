#!/usr/bin/env bash
# 本地打包 Android APK（用 EAS preview 配置，签名密钥存在 Expo 云端，每次一致）。
# 用法：npm run build:apk    （或 bash scripts/build-apk.sh）
# 产物：build-output/travel-journal.apk
set -euo pipefail

cd "$(dirname "$0")/.."

export JAVA_HOME="$HOME/Android/jdk"
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "==> 类型检查"
npx tsc --noEmit
echo "==> Lint"
npx expo lint

echo "==> 本地打包"
mkdir -p build-output
npx eas-cli@latest build -p android --profile preview --local --non-interactive \
  --output build-output/travel-journal.apk

echo "==> 完成：$(pwd)/build-output/travel-journal.apk"
