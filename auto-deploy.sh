#!/bin/bash
set -e

SOURCE_DIR="/root/feishu-claudecode-bridge/sourceCode"
DEPLOY_DIR="/root/feishu-claudecode-bridge/deploy"
LOG_FILE="/root/feishu-claudecode-bridge/deploy/logs/auto-deploy.log"
WEBHOOK="https://open.feishu.cn/open-apis/bot/v2/hook/0dfdcf6b-8435-4978-b116-7364d9f3ac79"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

notify() {
  local title="$1"
  local content="$2"
  local template="${3:-blue}"
  curl -s -X POST "$WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "$(cat <<EOF
{
  "msg_type": "interactive",
  "card": {
    "header": {
      "title": { "tag": "plain_text", "content": "$title" },
      "template": "$template"
    },
    "elements": [
      { "tag": "markdown", "content": "$content" },
      { "tag": "hr" },
      {
        "tag": "note",
        "elements": [
          { "tag": "plain_text", "content": "来源：auto-deploy.sh | $(date '+%Y-%m-%d %H:%M:%S')" }
        ]
      }
    ]
  }
}
EOF
)" > /dev/null 2>&1
}

cd "$SOURCE_DIR"
git pull origin dev 2>&1 | tee -a "$LOG_FILE"

SRC_VER=$(node -p "require('$SOURCE_DIR/package.json').version" 2>/dev/null || echo "0")
DEP_VER=$(node -p "require('$DEPLOY_DIR/package.json').version" 2>/dev/null || echo "0")

if [ "$SRC_VER" = "$DEP_VER" ]; then
  log "版本未变更 ($SRC_VER)，跳过部署"
  notify "📌 【通知】部署跳过 · v$SRC_VER" "**当前版本：** v$DEP_VER\\n**最新版本：** v$SRC_VER\\n**状态：** 版本未变更，跳过部署" "blue"
  exit 0
fi

log "版本变更: $DEP_VER → $SRC_VER，开始部署..."
notify "🔔 【通知】部署开始 · v$DEP_VER → v$SRC_VER" "**当前版本：** v$DEP_VER\\n**目标版本：** v$SRC_VER\\n**状态：** 开始部署..." "green"

cd "$SOURCE_DIR"
npm install --silent 2>&1 | tee -a "$LOG_FILE"
npm run build 2>&1 | tee -a "$LOG_FILE"

if [ $? -ne 0 ]; then
  log "BUILD FAILED"
  notify "🚨 【告警通知】部署失败 · v$SRC_VER" "**目标版本：** v$SRC_VER\\n**状态：** ❌ Build 失败，请检查日志" "red"
  exit 1
fi

cp -r "$SOURCE_DIR/dist/"* "$DEPLOY_DIR/dist/" 2>&1 | tee -a "$LOG_FILE"
cp "$SOURCE_DIR/package.json" "$DEPLOY_DIR/package.json" 2>&1 | tee -a "$LOG_FILE"

cd "$DEPLOY_DIR"
npm install --silent --production 2>&1 | tee -a "$LOG_FILE"

pm2 restart bacs-bridge-server 2>&1 | tee -a "$LOG_FILE"

log "部署完成: $SRC_VER"
notify "🔔 【通知】部署完成 · v$SRC_VER" "**版本：** v$SRC_VER\\n**状态：** ✅ 部署成功，PM2 已重启" "green"
