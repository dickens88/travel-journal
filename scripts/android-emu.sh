#!/usr/bin/env bash
# 一键启动 redroid 模拟器 + scrcpy 窗口 + Metro，并在 Expo Go 里打开 app。
# 用法：npm run emu    （或 bash scripts/android-emu.sh）
#
# 注意：redroid 在 adb 里同时显示为 emulator-5554，Expo 的 --android / 按 a
# 会误当成 AVD 而报错，所以这里用 adb 手动打开 exp:// 链接。

set -euo pipefail

CONTAINER=redroid
DEVICE=localhost:5555
PORT=8081
SCRCPY_DIR="$HOME/Android/scrcpy-linux-x86_64-v4.1"
ADB="$SCRCPY_DIR/adb"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

log() { printf '\033[1;36m[emu]\033[0m %s\n' "$*"; }

# 1. Android 容器
if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
  log "启动 Docker 容器 $CONTAINER ..."
  docker start "$CONTAINER" >/dev/null
fi

# 2. adb 连接并等待开机完成
log "连接 adb $DEVICE ..."
for _ in $(seq 1 60); do
  "$ADB" connect "$DEVICE" >/dev/null 2>&1 || true
  if [ "$("$ADB" -s "$DEVICE" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
    break
  fi
  sleep 2
done
"$ADB" -s "$DEVICE" shell getprop sys.boot_completed 2>/dev/null | grep -q 1 \
  || { echo "Android 未能在 120 秒内启动完成" >&2; exit 1; }

# 3. scrcpy 显示窗口
if ! pgrep -f "scrcpy -s $DEVICE" >/dev/null; then
  log "打开 scrcpy 窗口 ..."
  (cd "$SCRCPY_DIR" && nohup ./scrcpy -s "$DEVICE" --window-title "旅迹 Android" \
    --max-size 1280 --no-audio >"$HOME/Android/scrcpy.log" 2>&1 &)
fi

open_app() {
  "$ADB" -s "$DEVICE" reverse tcp:$PORT tcp:$PORT >/dev/null
  "$ADB" -s "$DEVICE" shell am start -a android.intent.action.VIEW \
    -d "exp://127.0.0.1:$PORT" >/dev/null
  log "已在 Expo Go 中打开 exp://127.0.0.1:$PORT"
}

# 4. Metro：已在运行就直接打开 app；否则后台等端口就绪后打开，前台跑 Metro
if ss -ltn | grep -q ":$PORT "; then
  log "Metro 已在端口 $PORT 运行"
  open_app
  exit 0
fi

(
  for _ in $(seq 1 120); do
    ss -ltn | grep -q ":$PORT " && { open_app; exit 0; }
    sleep 1
  done
  echo "等待 Metro 超时" >&2
) &

log "启动 Metro（按 r 刷新，Ctrl+C 退出）..."
cd "$PROJECT_DIR"
exec npx expo start --port "$PORT"
