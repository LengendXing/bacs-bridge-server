#!/usr/bin/env bash
# cll.sh — 一键部署 BACS Bridge Server
#
# 用法:
#   bash cll.sh                        # 部署到 ~/bacs-bridge-server
#   bash cll.sh /opt/bacs-bridge       # 部署到指定目录
#
# 做两件事:
#   1. 拉取项目代码到 sourceCode/
#   2. 执行 deploy.sh 部署到 deploy/

set -euo pipefail

REPO="https://github.com/LengendXing/bacs-bridge-server.git"
BRANCH="main"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# 根目录（sourceCode/ 和 deploy/ 的父目录）
ROOT_DIR="${1:-$HOME/bacs-bridge-server}"
SOURCE_DIR="${ROOT_DIR}/sourceCode"

# ═══════════════════════════════════════════════════════════════
# Step 1: 拉取代码到 sourceCode/
# ═══════════════════════════════════════════════════════════════
log_step "Step 1: 拉取项目代码"

mkdir -p "${ROOT_DIR}"

if [[ -d "${SOURCE_DIR}/.git" ]]; then
  log_info "源码已存在，正在更新..."
  cd "${SOURCE_DIR}"
  git fetch origin "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
  log_info "代码已更新到 ${BRANCH} 最新"
else
  log_info "正在克隆项目到: ${SOURCE_DIR}"
  git clone -b "${BRANCH}" "${REPO}" "${SOURCE_DIR}"
  log_info "代码克隆完成"
fi

# ═══════════════════════════════════════════════════════════════
# Step 2: 执行部署脚本
# ═══════════════════════════════════════════════════════════════
log_step "Step 2: 执行部署脚本"

cd "${SOURCE_DIR}"

if [[ ! -f "deploy.sh" ]]; then
  log_error "deploy.sh 不存在，部署终止"
  exit 1
fi

chmod +x deploy.sh
bash deploy.sh
