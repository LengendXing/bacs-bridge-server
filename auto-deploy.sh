#!/bin/bash
set -e

SOURCE_DIR="/root/feishu-claudecode-bridge/sourceCode"
DEPLOY_DIR="/root/feishu-claudecode-bridge/deploy"
LOG_FILE="/root/feishu-claudecode-bridge/deploy/logs/auto-deploy.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cd "$SOURCE_DIR"
git pull origin dev 2>&1 | tee -a "$LOG_FILE"

SRC_VER=$(node -p "require('$SOURCE_DIR/package.json').version" 2>/dev/null || echo "0")
DEP_VER=$(node -p "require('$DEPLOY_DIR/package.json').version" 2>/dev/null || echo "0")

if [ "$SRC_VER" = "$DEP_VER" ]; then
  exit 0
fi

log "版本变更: $DEP_VER → $SRC_VER，开始部署..."

cd "$SOURCE_DIR"
npm install --silent 2>&1 | tee -a "$LOG_FILE"
npm run build 2>&1 | tee -a "$LOG_FILE"

if [ $? -ne 0 ]; then
  log "BUILD FAILED"
  exit 1
fi

cp -r "$SOURCE_DIR/dist/"* "$DEPLOY_DIR/dist/" 2>&1 | tee -a "$LOG_FILE"
cp "$SOURCE_DIR/package.json" "$DEPLOY_DIR/package.json" 2>&1 | tee -a "$LOG_FILE"

cd "$DEPLOY_DIR"
npm install --silent --production 2>&1 | tee -a "$LOG_FILE"

pm2 restart bacs-bridge-server 2>&1 | tee -a "$LOG_FILE"

log "部署完成: $SRC_VER"
