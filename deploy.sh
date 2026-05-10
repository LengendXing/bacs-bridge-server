#!/usr/bin/env bash
# deploy.sh — 飞书 × AI CLI 桥接系统部署脚本
#
# 在 sourceCode/ 目录中执行，构建产物放入同级 deploy/ 目录
#
# 目录结构:
#   root/
#   ├── sourceCode/   ← 源码（本脚本所在目录）
#   └── deploy/       ← 运行时（PM2 从这里启动）
#
# 使用方式:
#   bash deploy.sh              # 首次部署 / 重新部署
#   bash deploy.sh --update     # 仅更新（跳过 seed）

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

# 根目录 = sourceCode 的父目录
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "${SOURCE_DIR}")"
DEPLOY_DIR="${ROOT_DIR}/deploy"

log_info "源码目录: ${SOURCE_DIR}"
log_info "部署目录: ${DEPLOY_DIR}"

# ═══════════════════════════════════════════════════════════════
# Step 1: 环境检测
# ═══════════════════════════════════════════════════════════════
log_step "Step 1: 环境检测"

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

if ! command -v npm >/dev/null 2>&1; then
  log_error "npm 未安装"
  exit 1
fi
log_info "npm: $(npm -v)"

if ! command -v tmux >/dev/null 2>&1; then
  log_error "tmux 未安装，请先安装: apt install tmux / yum install tmux"
  exit 1
fi
log_info "tmux: $(tmux -V)"

if ! command -v pm2 >/dev/null 2>&1; then
  log_warn "PM2 未安装，正在全局安装..."
  npm install -g pm2
fi
log_info "PM2: $(pm2 -v)"

# 自动安装编译工具链（better-sqlite3 需要）
install_build_tools() {
  local need_install=false
  if ! command -v make >/dev/null 2>&1; then need_install=true; fi
  if ! command -v cc >/dev/null 2>&1; then need_install=true; fi
  if ! command -v python3 >/dev/null 2>&1 && ! command -v python >/dev/null 2>&1; then need_install=true; fi

  if [[ "$need_install" == "false" ]]; then
    log_info "编译工具链已就绪"
    return
  fi

  log_warn "缺少编译工具链，正在自动安装..."
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
# Step 2: 在 sourceCode/ 中安装依赖
# ═══════════════════════════════════════════════════════════════
log_step "Step 2: 安装依赖（sourceCode）"

cd "${SOURCE_DIR}"

if [[ ! -f "package.json" ]]; then
  log_error "未找到 package.json"
  exit 1
fi

if [[ ! -d "node_modules" ]]; then
  log_info "首次安装依赖..."
  npm install 2>&1 | tail -3
else
  log_info "检查依赖更新..."
  npm install --prefer-offline 2>&1 | tail -3
fi
log_info "依赖安装完成"

# ═══════════════════════════════════════════════════════════════
# Step 3: 在 sourceCode/ 中构建
# ═══════════════════════════════════════════════════════════════
log_step "Step 3: 构建项目"

# 加载 .env（如存在）
if [[ -f "${DEPLOY_DIR}/.env" ]]; then
  set -a; source "${DEPLOY_DIR}/.env"; set +a
  log_info "已加载 .env 配置"
elif [[ -f "${SOURCE_DIR}/.env" ]]; then
  set -a; source "${SOURCE_DIR}/.env"; set +a
  log_info "已加载 .env 配置"
fi

# 数据库迁移（在源码目录执行）
if [[ -d "src/server/db/migrations" ]]; then
  npx drizzle-kit migrate 2>&1 || {
    log_warn "数据库迁移失败（可能已是最新），继续..."
  }
  log_info "数据库迁移完成"
fi

# 构建
npm run build 2>&1 | tail -5
log_info "构建完成"

# ═══════════════════════════════════════════════════════════════
# Step 4: 部署产物到 deploy/
# ═══════════════════════════════════════════════════════════════
log_step "Step 4: 部署产物到 deploy/"

mkdir -p "${DEPLOY_DIR}"

# 复制编译产物
log_info "复制 dist/ → deploy/dist/"
rm -rf "${DEPLOY_DIR}/dist"
cp -r "${SOURCE_DIR}/dist" "${DEPLOY_DIR}/dist"

# 复制运行时所需文件
for f in package.json package-lock.json ecosystem.config.cjs config.yaml; do
  if [[ -f "${SOURCE_DIR}/${f}" ]]; then
    cp "${SOURCE_DIR}/${f}" "${DEPLOY_DIR}/${f}"
    log_info "复制 ${f}"
  fi
done

# 复制 .env（优先用 deploy/ 已有的，没有则从源码复制 .env.example）
if [[ ! -f "${DEPLOY_DIR}/.env" ]]; then
  if [[ -f "${SOURCE_DIR}/.env" ]]; then
    cp "${SOURCE_DIR}/.env" "${DEPLOY_DIR}/.env"
    log_info "复制 .env"
  elif [[ -f "${SOURCE_DIR}/.env.example" ]]; then
    cp "${SOURCE_DIR}/.env.example" "${DEPLOY_DIR}/.env"
    log_warn "已从 .env.example 创建 .env，请编辑填写配置"
  fi
else
  log_info ".env 已存在，保留当前配置"
fi

# 确保 data/ 和 logs/ 目录
mkdir -p "${DEPLOY_DIR}/data" "${DEPLOY_DIR}/logs"

# 在 deploy/ 中安装生产依赖
cd "${DEPLOY_DIR}"
log_info "安装生产依赖（deploy）"
if [[ ! -d "node_modules" ]]; then
  npm install --omit=dev 2>&1 | tail -3
else
  npm install --omit=dev --prefer-offline 2>&1 | tail -3
fi
log_info "生产依赖安装完成"

# ═══════════════════════════════════════════════════════════════
# Step 5: 创建初始管理员（仅首次部署）
# ═══════════════════════════════════════════════════════════════
if [[ "$IS_UPDATE" == "false" ]]; then
  log_step "Step 5: 初始管理员"

  DB_PATH="${DB_PATH:-${DEPLOY_DIR}/data/bridge.db}"
  if [[ -f "$DB_PATH" ]]; then
    ADMIN_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
    if [[ "$ADMIN_COUNT" -gt 0 ]]; then
      log_info "管理员账户已存在，跳过创建"
    else
      log_info "未检测到管理员账户，正在创建..."
      cd "${SOURCE_DIR}"
      npx tsx scripts/seed-admin.ts
      cd "${DEPLOY_DIR}"
    fi
  fi
fi

# ═══════════════════════════════════════════════════════════════
# Step 6: 防火墙放行端口
# ═══════════════════════════════════════════════════════════════
log_step "Step 6: 防火墙放行端口"

BRIDGE_PORT="${BRIDGE_PORT:-3456}"

if command -v ufw >/dev/null 2>&1; then
  if ! sudo ufw status 2>/dev/null | grep -q "$BRIDGE_PORT"; then
    sudo ufw allow "$BRIDGE_PORT"/tcp 2>/dev/null && log_info "ufw: 已放行 $BRIDGE_PORT" || log_warn "ufw 放行失败"
  else
    log_info "ufw: 端口 $BRIDGE_PORT 已放行"
  fi
elif command -v firewall-cmd >/dev/null 2>&1; then
  if ! sudo firewall-cmd --list-ports 2>/dev/null | grep -q "$BRIDGE_PORT"; then
    sudo firewall-cmd --permanent --add-port="$BRIDGE_PORT"/tcp 2>/dev/null && \
    sudo firewall-cmd --reload 2>/dev/null && log_info "firewalld: 已放行 $BRIDGE_PORT" || log_warn "firewalld 放行失败"
  else
    log_info "firewalld: 端口 $BRIDGE_PORT 已放行"
  fi
elif command -v iptables >/dev/null 2>&1; then
  if ! iptables -L INPUT -n 2>/dev/null | grep -q "$BRIDGE_PORT"; then
    sudo iptables -I INPUT -p tcp --dport "$BRIDGE_PORT" -j ACCEPT 2>/dev/null && log_info "iptables: 已放行 $BRIDGE_PORT" || log_warn "iptables 放行失败"
  else
    log_info "iptables: 端口 $BRIDGE_PORT 已放行"
  fi
fi

# ═══════════════════════════════════════════════════════════════
# Step 7: PM2 启动 / 重启
# ═══════════════════════════════════════════════════════════════
log_step "Step 7: PM2 启动"

cd "${DEPLOY_DIR}"

# 停止旧进程
pm2 delete feishu-bridge 2>/dev/null || true

# 启动
pm2 start ecosystem.config.cjs
pm2 save

# 注册开机自启
pm2 startup 2>/dev/null || log_warn "PM2 startup 注册失败，请手动执行: pm2 startup"

log_info "PM2 启动完成"

# ═══════════════════════════════════════════════════════════════
# 完成
# ═══════════════════════════════════════════════════════════════

cat <<EOF

${GREEN}╔══════════════════════════════════════════════════════╗
║       飞书 × Claude Code 桥接系统 V1.0 部署完成       ║
╠══════════════════════════════════════════════════════╣
║  源码目录:  ${SOURCE_DIR}
║  部署目录:  ${DEPLOY_DIR}
║  管理面板:  http://<IP>:${BRIDGE_PORT}/
║  健康检查:  http://<IP>:${BRIDGE_PORT}/health
║  PM2 管理:  pm2 status / pm2 logs feishu-bridge
║
║  更新流程:
║  1. cd ${SOURCE_DIR} && git pull
║  2. bash deploy.sh --update
╚══════════════════════════════════════════════════════╝
${NC}
EOF
