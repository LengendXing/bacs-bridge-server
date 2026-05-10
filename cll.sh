#!/usr/bin/env bash
# cll.sh — 一键部署飞书 × AI CLI 桥接系统
#
# 用法:
#   bash cll.sh                     # 部署到当前目录
#   bash cll.sh /opt/feishu-bridge  # 部署到指定目录
#
# 做两件事:
#   1. 拉取项目代码（git clone 或 git pull）
#   2. 执行 deploy.sh 部署脚本

set -euo pipefail

REPO="https://github.com/LengendXing/feishu-claudecode-bridge.git"
BRANCH="main"
PROJECT_NAME="feishu-claudecode-bridge"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# 目标目录
TARGET_DIR="${1:-$(pwd)/${PROJECT_NAME}}"

# ═══════════════════════════════════════════════════════════════
# Step 1: 拉取代码
# ═══════════════════════════════════════════════════════════════
log_step "Step 1: 拉取项目代码"

if [[ -d "${TARGET_DIR}/.git" ]]; then
  # 已有仓库，拉取最新
  log_info "项目已存在: ${TARGET_DIR}，正在拉取最新代码..."
  cd "${TARGET_DIR}"
  git fetch origin "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
  log_info "代码已更新到 ${BRANCH} 最新"
else
  # 首次部署，克隆仓库
  log_info "正在克隆项目到: ${TARGET_DIR}"
  git clone -b "${BRANCH}" "${REPO}" "${TARGET_DIR}"
  cd "${TARGET_DIR}"
  log_info "代码克隆完成"
fi

# ═══════════════════════════════════════════════════════════════
# Step 2: 执行部署脚本
# ═══════════════════════════════════════════════════════════════
log_step "Step 2: 执行部署脚本"

if [[ ! -f "deploy.sh" ]]; then
  log_error "deploy.sh 不存在，部署终止"
  exit 1
fi

chmod +x deploy.sh
bash deploy.sh
