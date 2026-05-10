#!/bin/bash
# Claude Code 多实例守护进程启动脚本
# 使用方式:
#   ./cc1.sh <名字>                 # 启动一个实例
#   ./cc1.sh <名字> stop            # 停止指定实例
#   ./cc1.sh <名字> status          # 查看指定实例状态
#   ./cc1.sh <名字> attach|go       # 重新连接指定实例
#   ./cc1.sh list                   # 列出所有运行中的实例
#   ./cc1.sh -s                     # 交互式选择进入（不存在则创建）
#
# 示例:
#   ./cc1.sh work                   # 启动名为 work 的实例
#   ./cc1.sh personal attach        # 连接名为 personal 的实例
#   ./cc1.sh personal go            # 同上
#   ./cc1.sh work stop              # 停止 work 实例

CLAUDE_BIN="$HOME/.local/bin/claude"
ANTHROPIC_BASE_URL="http://128.140.92.208:5000/v1"
ANTHROPIC_API_KEY="sk-non13j1mlk12165123sadasdQW21RR123aw"
SESSION_PREFIX="claude1"  # 所有实例的 tmux/screen 会话名前缀

# 清除外部环境泄漏的认证变量，脚本作用域内只用脚本自己设置的值
unset ANTHROPIC_AUTH_TOKEN

# ── 检测终端复用工具 ──────────────────────────────────────
detect_multiplexer() {
    if command -v tmux >/dev/null 2>&1; then
        echo "tmux"
    elif command -v screen >/dev/null 2>&1; then
        echo "screen"
    else
        echo "none"
    fi
}

MULTIPLEXER=$(detect_multiplexer)

if [ "$MULTIPLEXER" = "none" ]; then
    echo "✗ 错误：未找到 tmux 或 screen，请先安装："
    echo "    Ubuntu/Debian: sudo apt install tmux"
    exit 1
fi

session_exists() {
    local name="${1:-$SESSION_NAME}"
    if [ "$MULTIPLEXER" = "tmux" ]; then
        tmux has-session -t "$name" 2>/dev/null
    else
        screen -list | grep -q "$name"
    fi
}

# 获取所有实例名（纯名称，不含前缀）
get_instances() {
    if [ "$MULTIPLEXER" = "tmux" ]; then
        tmux list-sessions 2>/dev/null \
            | grep "^${SESSION_PREFIX}-" \
            | sed "s/^${SESSION_PREFIX}-//" \
            | sed 's/:.*//'
    else
        screen -list 2>/dev/null \
            | grep "${SESSION_PREFIX}-" \
            | sed "s/.*${SESSION_PREFIX}-//" \
            | sed 's/\s.*//'
    fi
}

# ── 启动实例 ────────────────────────────────────────────
start_instance() {
    if [ ! -x "$CLAUDE_BIN" ]; then
        echo "✗ 未找到 Claude Code: $CLAUDE_BIN"
        echo "  可用 CLAUDE_BIN=/path/to/claude $0 $INSTANCE_NAME 指定路径"
        return 1
    fi

    echo "启动实例: $INSTANCE_NAME ..."
    if [ "$MULTIPLEXER" = "tmux" ]; then
        tmux new-session -d -s "$SESSION_NAME" \
          "unset ANTHROPIC_AUTH_TOKEN && ANTHROPIC_BASE_URL='$ANTHROPIC_BASE_URL' ANTHROPIC_API_KEY='$ANTHROPIC_API_KEY' $CLAUDE_BIN"
    else
        screen -dmS "$SESSION_NAME" \
          env -u ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL="$ANTHROPIC_BASE_URL" ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" "$CLAUDE_BIN"
    fi

    sleep 1
    if session_exists; then
        echo "✓ 实例 '$INSTANCE_NAME' 已启动 (会话: $SESSION_NAME)"
        return 0
    else
        echo "✗ 启动失败，请检查: $CLAUDE_BIN"
        return 1
    fi
}

# ── 连接到实例 ──────────────────────────────────────────
attach_instance() {
    echo "正在连接到实例: $INSTANCE_NAME ..."
    if [ "$MULTIPLEXER" = "tmux" ]; then
        tmux attach-session -t "$SESSION_NAME"
    else
        screen -r "$SESSION_NAME"
    fi
}

# ── 参数处理 ──────────────────────────────────────────────
if [ -z "$1" ]; then
    echo "用法: $0 <实例名> [start|stop|status|attach|go]"
    echo "      $0 list"
    echo "      $0 -s"
    echo ""
    echo "示例:"
    echo "  $0 work              # 启动 work 实例"
    echo "  $0 work attach       # 连接 work 实例"
    echo "  $0 work go           # 同上"
    echo "  $0 work stop         # 停止 work 实例"
    echo "  $0 list              # 列出所有实例"
    echo "  $0 -s                # 交互式选择进入"
    exit 1
fi

# list 命令
if [ "$1" = "list" ]; then
    echo "当前运行中的 Claude Code 实例:"
    instances=$(get_instances)
    if [ -z "$instances" ]; then
        echo "  (无)"
    else
        echo "$instances" | sed 's/^/  • /'
    fi
    exit 0
fi

# -s 交互式选择进入
if [ "$1" = "-s" ]; then
    echo "当前运行中的 Claude Code 实例:"
    instances=$(get_instances)
    if [ -z "$instances" ]; then
        echo "  (无)"
    else
        echo "$instances" | sed 's/^/  • /'
    fi
    echo ""
    read -p "请输入要进入的实例名: " INSTANCE_NAME
    if [ -z "$INSTANCE_NAME" ]; then
        echo "✗ 实例名不能为空"
        exit 1
    fi

    SESSION_NAME="${SESSION_PREFIX}-${INSTANCE_NAME}"

    if session_exists; then
        attach_instance
    else
        echo "实例 '$INSTANCE_NAME' 不存在，正在创建..."
        if start_instance; then
            attach_instance
        fi
    fi
    exit 0
fi

INSTANCE_NAME="$1"
ACTION="${2:-start}"
SESSION_NAME="${SESSION_PREFIX}-${INSTANCE_NAME}"

# ── 子命令 ────────────────────────────────────────────────
case "$ACTION" in
    stop)
        if session_exists; then
            if [ "$MULTIPLEXER" = "tmux" ]; then
                tmux kill-session -t "$SESSION_NAME"
            else
                screen -S "$SESSION_NAME" -X quit
            fi
            echo "已停止实例: $INSTANCE_NAME"
        else
            echo "实例 '$INSTANCE_NAME' 未在运行"
        fi
        ;;

    status)
        if session_exists; then
            echo "✓ 实例 '$INSTANCE_NAME' 正在运行 (会话: $SESSION_NAME)"
            echo "  重新连接: $0 $INSTANCE_NAME attach"
        else
            echo "✗ 实例 '$INSTANCE_NAME' 未在运行"
        fi
        ;;

    attach|go)
        if session_exists; then
            attach_instance
        else
            echo "✗ 实例 '$INSTANCE_NAME' 不存在，先启动: $0 $INSTANCE_NAME"
        fi
        ;;

    start|*)
        if session_exists; then
            echo "✓ 实例 '$INSTANCE_NAME' 已在运行"
            echo "  重新连接: $0 $INSTANCE_NAME attach"
            echo "  停止:     $0 $INSTANCE_NAME stop"
            exit 0
        fi

        start_instance
        if [ $? -eq 0 ]; then
            echo "  重新连接: $0 $INSTANCE_NAME attach"
            echo "  停止:     $0 $INSTANCE_NAME stop"
            echo "  列出所有: $0 list"
        fi
        ;;
esac
