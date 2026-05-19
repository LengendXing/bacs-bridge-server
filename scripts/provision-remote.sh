#!/usr/bin/env bash
# provision-remote.sh — 远程机器预装脚本
# 幂等：已安装的组件跳过，只补缺的。
# 输出最后一行为 JSON 供后端解析。
set -euo pipefail

STEPS=()
NODE_VER=""
TMUX_VER=""
CLAUDE_VER=""
ERROR_MSG=""

# ── 1. Node.js ≥18 ──────────────────────────────────────────────
if command -v node &>/dev/null; then
  NODE_VER=$(node -v 2>/dev/null || echo "unknown")
  MAJOR=$(echo "$NODE_VER" | sed 's/^v//' | cut -d. -f1)
  if [ "$MAJOR" -ge 18 ] 2>/dev/null; then
    STEPS+=("node:skip")
  else
    # 版本过低，尝试升级
    if command -v apt-get &>/dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs && NODE_VER=$(node -v) && STEPS+=("node:upgraded") || { ERROR_MSG="node upgrade failed"; STEPS+=("node:failed"); }
    elif command -v yum &>/dev/null; then
      curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && yum install -y nodejs && NODE_VER=$(node -v) && STEPS+=("node:upgraded") || { ERROR_MSG="node upgrade failed"; STEPS+=("node:failed"); }
    else
      ERROR_MSG="node version too old, no supported package manager"
      STEPS+=("node:failed")
    fi
  fi
else
  # 未安装 Node.js
  if command -v apt-get &>/dev/null; then
    apt-get update -qq && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs && NODE_VER=$(node -v) && STEPS+=("node:installed") || { ERROR_MSG="node install failed"; STEPS+=("node:failed"); }
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && yum install -y nodejs && NODE_VER=$(node -v) && STEPS+=("node:installed") || { ERROR_MSG="node install failed"; STEPS+=("node:failed"); }
  else
    ERROR_MSG="no supported package manager (apt-get/yum)"
    STEPS+=("node:failed")
  fi
fi

# ── 2. tmux ─────────────────────────────────────────────────────
if command -v tmux &>/dev/null; then
  TMUX_VER=$(tmux -V 2>/dev/null || echo "unknown")
  STEPS+=("tmux:skip")
else
  if command -v apt-get &>/dev/null; then
    apt-get install -y tmux && TMUX_VER=$(tmux -V) && STEPS+=("tmux:installed") || { ERROR_MSG="${ERROR_MSG:+$ERROR_MSG; }tmux install failed"; STEPS+=("tmux:failed"); }
  elif command -v yum &>/dev/null; then
    yum install -y tmux && TMUX_VER=$(tmux -V) && STEPS+=("tmux:installed") || { ERROR_MSG="${ERROR_MSG:+$ERROR_MSG; }tmux install failed"; STEPS+=("tmux:failed"); }
  elif command -v dnf &>/dev/null; then
    dnf install -y tmux && TMUX_VER=$(tmux -V) && STEPS+=("tmux:installed") || { ERROR_MSG="${ERROR_MSG:+$ERROR_MSG; }tmux install failed"; STEPS+=("tmux:failed"); }
  else
    ERROR_MSG="${ERROR_MSG:+$ERROR_MSG; }no supported package manager for tmux"
    STEPS+=("tmux:failed")
  fi
fi

# ── 3. Claude Code CLI ──────────────────────────────────────────
CLAUDE_BIN=""
if command -v claude &>/dev/null; then
  CLAUDE_VER=$(claude --version 2>/dev/null | head -1 || echo "unknown")
  CLAUDE_BIN=$(command -v claude)
  STEPS+=("claude:skip")
else
  # npm install -g 会装到 ~/.local/bin/claude 或 /usr/local/bin/claude
  npm install -g @anthropic-ai/claude-code 2>/dev/null && STEPS+=("claude:installed") || {
    # npm 可能不在 PATH 或版本不对，尝试 npx
    npx -y @anthropic-ai/claude-code --version &>/dev/null && STEPS+=("claude:installed-via-npx") || {
      ERROR_MSG="${ERROR_MSG:+$ERROR_MSG; }claude install failed"
      STEPS+=("claude:failed")
    }
  }
  # 重新检测
  if command -v claude &>/dev/null; then
    CLAUDE_VER=$(claude --version 2>/dev/null | head -1 || echo "unknown")
    CLAUDE_BIN=$(command -v claude)
  elif [ -f "$HOME/.local/bin/claude" ]; then
    CLAUDE_VER=$("$HOME/.local/bin/claude" --version 2>/dev/null | head -1 || echo "unknown")
    CLAUDE_BIN="$HOME/.local/bin/claude"
  fi
fi

# ── 4. PATH symlink ─────────────────────────────────────────────
if [ -n "$CLAUDE_BIN" ]; then
  if [ "$(dirname "$CLAUDE_BIN")" = "/usr/local/bin" ]; then
    STEPS+=("symlink:skip")
  else
    ln -sf "$CLAUDE_BIN" /usr/local/bin/claude 2>/dev/null && STEPS+=("symlink:created") || {
      # 可能没有 /usr/local/bin 写权限
      STEPS+=("symlink:failed")
    }
  fi
else
  STEPS+=("symlink:skipped-no-claude")
fi

# ── Output JSON ──────────────────────────────────────────────────
if [ -n "$ERROR_MSG" ]; then
  # shellcheck disable=SC2016
  printf '{"ok":false,"error":"%s","node":"%s","tmux":"%s","claude":"%s","steps":[%s]}\n' \
    "$ERROR_MSG" "$NODE_VER" "$TMUX_VER" "$CLAUDE_VER" \
    "$(printf '"%s",' "${STEPS[@]}" | sed 's/,$//')"
else
  # shellcheck disable=SC2016
  printf '{"ok":true,"node":"%s","tmux":"%s","claude":"%s","steps":[%s]}\n' \
    "$NODE_VER" "$TMUX_VER" "$CLAUDE_VER" \
    "$(printf '"%s",' "${STEPS[@]}" | sed 's/,$//')"
fi
