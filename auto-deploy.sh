#!/bin/bash
set -e

SOURCE_DIR="/root/feishu-claudecode-bridge/sourceCode"
DEPLOY_DIR="/root/feishu-claudecode-bridge/deploy"
LOG_FILE="/root/feishu-claudecode-bridge/deploy/logs/auto-deploy.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cd "$SOURCE_DIR"

BEFORE=$(git rev-parse HEAD 2>/dev/null)
git pull origin dev 2>&1 | tee -a "$LOG_FILE"
AFTER=$(git rev-parse HEAD 2>/dev/null)

if [ "$BEFORE" = "$AFTER" ]; then
  exit 0
fi

log "变更检测到，开始部署..."

cd "$SOURCE_DIR"
npm install --silent 2>&1 | tee -a "$LOG_FILE"
npm run build 2>&1 | tee -a "$LOG_FILE"

if [ $? -ne 0 ]; then
  log "BUILD FAILED"
  exit 1
fi

# 复制 dist 到 deploy 目录
cp -r "$SOURCE_DIR/dist/"* "$DEPLOY_DIR/dist/" 2>&1 | tee -a "$LOG_FILE"
cp "$SOURCE_DIR/package.json" "$DEPLOY_DIR/package.json" 2>&1 | tee -a "$LOG_FILE"

cd "$DEPLOY_DIR"
npm install --silent --production 2>&1 | tee -a "$LOG_FILE"

pm2 restart bacs-bridge-server 2>&1 | tee -a "$LOG_FILE"

log "部署完成"
