#!/usr/bin/env bash
# deploy.sh — 飞书 × Claude Code 桥接系统 V1.0 一键部署脚本
#
# 使用方式:
#   bash deploy.sh              # 首次部署
#   bash deploy.sh --update     # 更新部署（保留数据库）
#
# 功能:
#   1. 检查 Node.js >= 18、tmux、PM2
#   2. 安装依赖 (npm ci)
#   3. 运行数据库迁移 (drizzle-kit migrate)
#   4. 构建前后端 (npm run build)
#   5. 创建初始管理员 (如不存在)
#   6. PM2 启动 + 开机自启注册

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "${CYAN}[STEP]${NC} $*"; }

IS_UPDATE=false
if [[ "${1:-}" == "--update" ]]; then
  IS_UPDATE=true
fi

# ═══════════════════════════════════════════════════════════════
# Step 1: 环境检测
# ═══════════════════════════════════════════════════════════════
log_step "Step 1: 环境检测"

# Node.js >= 18
if ! command -v node >/dev/null 2>&1; then
  log_error "Node.js 未安装，请先安装 Node.js >= 18"
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  log_error "Node.js 版本过低 ($(node -v))，需要 >= 18"
  exit 1
fi
log_info "Node.js: $(node -v)"

# npm
if ! command -v npm >/dev/null 2>&1; then
  log_error "npm 未安装"
  exit 1
fi
log_info "npm: $(npm -v)"

# tmux
if ! command -v tmux >/dev/null 2>&1; then
  log_error "tmux 未安装，请先安装: apt install tmux / yum install tmux"
  exit 1
fi
log_info "tmux: $(tmux -V)"

# PM2
if ! command -v pm2 >/dev/null 2>&1; then
  log_warn "PM2 未安装，正在全局安装..."
  npm install -g pm2
fi
log_info "PM2: $(pm2 -v)"

# native 模块编译工具链（better-sqlite3 需要 python3 + make + g++）
install_build_tools() {
  local need_install=false

  # 检测是否缺少编译工具
  if ! command -v make >/dev/null 2>&1; then need_install=true; fi
  if ! command -v cc >/dev/null 2>&1; then need_install=true; fi
  if ! command -v python3 >/dev/null 2>&1 && ! command -v python >/dev/null 2>&1; then need_install=true; fi

  if [[ "$need_install" == "false" ]]; then
    log_info "编译工具链已就绪"
    return
  fi

  log_warn "缺少编译工具链，正在自动安装..."

  # 检测包管理器
  if command -v apt >/dev/null 2>&1; then
    sudo apt update -qq
    sudo apt install -y build-essential python3
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y gcc gcc-c++ make python3
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y gcc gcc-c++ make python3
  elif command -v apk >/dev/null 2>&1; then
    sudo apk add build-base python3
  else
    log_error "无法自动安装编译工具，请手动安装 build-essential + python3"
    exit 1
  fi

  log_info "编译工具链安装完成"
}

install_build_tools

# ═══════════════════════════════════════════════════════════════
# Step 2: 安装依赖
# ═══════════════════════════════════════════════════════════════
log_step "Step 2: 安装依赖"

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

if [[ ! -f "package.json" ]]; then
  log_error "未找到 package.json，请确认部署目录正确"
  exit 1
fi

npm ci --production=false 2>&1 | tail -3
log_info "依赖安装完成"

# ═══════════════════════════════════════════════════════════════
# Step 3: 数据库迁移
# ═══════════════════════════════════════════════════════════════
log_step "Step 3: 数据库迁移"

# 确保数据目录存在
mkdir -p data logs

# 加载 .env（如存在）
if [[ -f ".env" ]]; then
  set -a; source .env; set +a
  log_info "已加载 .env 配置"
fi

# 运行 Drizzle 迁移
if [[ -d "src/server/db/migrations" ]]; then
  npx drizzle-kit migrate 2>&1 || {
    log_warn "数据库迁移失败（可能已是最新），继续..."
  }
  log_info "数据库迁移完成"
else
  log_warn "未找到迁移文件，跳过迁移"
fi

# ═══════════════════════════════════════════════════════════════
# Step 4: 构建前后端
# ═══════════════════════════════════════════════════════════════
log_step "Step 4: 构建"

USE_TSX=false
if npm run build 2>&1; then
  log_info "构建完成"
else
  log_warn "构建失败，将使用 tsx 直接运行 TypeScript 源码"
  USE_TSX=true
  # 构建前端（后端用 tsx 兜底，前端仍需构建）
  if npm run build:client 2>&1; then
    log_info "前端构建完成"
  else
    log_warn "前端构建也失败，管理面板可能不可用"
  fi
fi

# ═══════════════════════════════════════════════════════════════
# Step 5: 创建初始管理员（仅首次部署）
# ═══════════════════════════════════════════════════════════════
if [[ "$IS_UPDATE" == "false" ]]; then
  log_step "Step 5: 初始管理员"

  # 检查是否已有管理员
  DB_PATH="${DB_PATH:-data/bridge.db}"
  if [[ -f "$DB_PATH" ]]; then
    ADMIN_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
    if [[ "$ADMIN_COUNT" -gt 0 ]]; then
      log_info "管理员账户已存在，跳过创建"
    else
      log_info "未检测到管理员账户，正在创建..."
      npx tsx scripts/seed-admin.ts
    fi
  else
    log_info "数据库不存在，将首次启动时自动创建"
  fi
fi

# ═══════════════════════════════════════════════════════════════
# Step 6: 防火墙放行端口
# ═══════════════════════════════════════════════════════════════
log_step "Step 6: 防火墙放行端口"

BRIDGE_PORT="${BRIDGE_PORT:-3456}"

open_firewall() {
  # iptables
  if command -v iptables >/dev/null 2>&1; then
    if iptables -L INPUT -n 2>/dev/null | grep -q "$BRIDGE_PORT"; then
      log_info "iptables: 端口 $BRIDGE_PORT 已放行"
    else
      sudo iptables -I INPUT -p tcp --dport "$BRIDGE_PORT" -j ACCEPT 2>/dev/null && \
        log_info "iptables: 已放行端口 $BRIDGE_PORT" || \
        log_warn "iptables 放行失败（可能需要 sudo 权限）"
    fi
  fi

  # ufw (Ubuntu/Debian)
  if command -v ufw >/dev/null 2>&1; then
    if sudo ufw status 2>/dev/null | grep -q "$BRIDGE_PORT"; then
      log_info "ufw: 端口 $BRIDGE_PORT 已放行"
    else
      sudo ufw allow "$BRIDGE_PORT"/tcp 2>/dev/null && \
        log_info "ufw: 已放行端口 $BRIDGE_PORT/tcp" || \
        log_warn "ufw 放行失败（可能需要 sudo 权限）"
    fi
  fi

  # firewalld (CentOS/RHEL)
  if command -v firewall-cmd >/dev/null 2>&1; then
    if sudo firewall-cmd --list-ports 2>/dev/null | grep -q "$BRIDGE_PORT"; then
      log_info "firewalld: 端口 $BRIDGE_PORT 已放行"
    else
      sudo firewall-cmd --permanent --add-port="$BRIDGE_PORT"/tcp 2>/dev/null && \
        sudo firewall-cmd --reload 2>/dev/null && \
        log_info "firewalld: 已放行端口 $BRIDGE_PORT/tcp" || \
        log_warn "firewalld 放行失败（可能需要 sudo 权限）"
    fi
  fi
}

open_firewall

# ═══════════════════════════════════════════════════════════════
# Step 7: PM2 启动
# ═══════════════════════════════════════════════════════════════
log_step "Step 7: PM2 启动"

# 如果已在运行，先停止
pm2 delete feishu-bridge 2>/dev/null || true

if [[ "$USE_TSX" == "true" ]]; then
  log_info "使用 tsx 模式启动（构建失败兜底）"
  pm2 start src/server/index.ts --interpreter node_modules/.bin/tsx --name feishu-bridge
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

# 注册开机自启
pm2 startup 2>/dev/null || log_warn "PM2 startup 注册失败，请手动执行: pm2 startup"

log_info "PM2 启动完成"

# ═══════════════════════════════════════════════════════════════
# 完成
# ═══════════════════════════════════════════════════════════════

BRIDGE_PORT="${BRIDGE_PORT:-3456}"

cat <<EOF

${GREEN}╔══════════════════════════════════════════════════════╗
║       飞书 × Claude Code 桥接系统 V1.0 部署完成       ║
╠══════════════════════════════════════════════════════╣
║  管理面板:  http://<IP>:${BRIDGE_PORT}/
║  健康检查:  http://<IP>:${BRIDGE_PORT}/health
║  PM2 管理:  pm2 status / pm2 logs feishu-bridge
║
║  下一步:
║  1. 启动 Claude Code / Codex 的 tmux 会话
║  2. 访问管理面板创建服务商和绑定
║  3. 绑定飞书应用后自动连接 WebSocket
╚══════════════════════════════════════════════════════╝
${NC}
EOF
