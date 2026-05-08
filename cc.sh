#!/bin/bash
# Claude Code 多实例守护进程启动脚本（飞书桥接扩展版）
# 使用方式:
#   ./cc.sh <名字>                         # 启动一个实例
#   ./cc.sh <名字> --bind <飞书目标ID>      # 启动并绑定飞书目标
#   ./cc.sh <名字> --bind <飞书目标ID> --type chat|user  # 指定绑定类型
#   ./cc.sh <名字> stop                    # 停止指定实例
#   ./cc.sh <名字> status                  # 查看指定实例状态
#   ./cc.sh <名字> attach                  # 重新连接指定实例
#   ./cc.sh list                           # 列出所有运行中的实例
#
# 示例:
#   ./cc.sh work                           # 启动名为 work 的实例
#   ./cc.sh work --bind oc_xxxxxx          # 启动 work 并绑定飞书群
#   ./cc.sh work --bind ou_yyyyyy --type user  # 启动 work 并绑定飞书用户

CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
SESSION_PREFIX="claude"
BRIDGE_API="${BRIDGE_API:-http://127.0.0.1:3456}"

# ── 参数处理 ──────────────────────────────────────────────
if [ -z "$1" ]; then
    echo "用法: $0 <实例名> [start|stop|status|attach] [--bind <ID>] [--type chat|user]"
    echo "      $0 list"
    echo ""
    echo "示例:"
    echo "  $0 work                    # 启动 work 实例"
    echo "  $0 work --bind oc_xxxxxx   # 启动 work 并绑定飞书群"
    echo "  $0 work attach             # 连接 work 实例"
    echo "  $0 work stop               # 停止 work 实例"
    echo "  $0 list                    # 列出所有实例"
    exit 1
fi

# list 命令
if [ "$1" = "list" ]; then
    echo "当前运行中的 Claude Code 实例:"
    if command -v tmux >/dev/null 2>&1; then
        tmux list-sessions 2>/dev/null \
            | grep "^${SESSION_PREFIX}-" \
            | sed "s/^${SESSION_PREFIX}-/  • /" \
            | sed 's/:.*//'
    elif command -v screen >/dev/null 2>&1; then
        screen -list 2>/dev/null \
            | grep "${SESSION_PREFIX}-" \
            | sed "s/.*${SESSION_PREFIX}-/  • /" \
            | sed 's/\s.*//'
    fi
    exit 0
fi

INSTANCE_NAME="$1"
ACTION="${2:-start}"
BIND_TARGET=""
BIND_TYPE="chat"

# 解析 --bind 和 --type 参数
shift
while [ $# -gt 0 ]; do
    case "$1" in
        --bind)
            BIND_TARGET="$2"
            shift 2
            ;;
        --type)
            BIND_TYPE="$2"
            shift 2
            ;;
        *)
            ACTION="$1"
            shift
            ;;
    esac
done

SESSION_NAME="${SESSION_PREFIX}-${INSTANCE_NAME}"

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
    if [ "$MULTIPLEXER" = "tmux" ]; then
        tmux has-session -t "$SESSION_NAME" 2>/dev/null
    else
        screen -list | grep -q "$SESSION_NAME"
    fi
}

# ── 向 Bridge Server 注册/注销绑定 ──
register_bind() {
    if [ -n "$BIND_TARGET" ]; then
        curl -s -X POST "${BRIDGE_API}/api/bind" \
            -H "Content-Type: application/json" \
            -d "{\"process_name\":\"${INSTANCE_NAME}\",\"feishu_target\":\"${BIND_TARGET}\",\"feishu_type\":\"${BIND_TYPE}\"}" \
            > /dev/null 2>&1
    fi
}

unregister_bind() {
    curl -s -X POST "${BRIDGE_API}/api/unbind" \
        -H "Content-Type: application/json" \
        -d "{\"process_name\":\"${INSTANCE_NAME}\"}" \
        > /dev/null 2>&1
}

# ── 子命令 ────────────────────────────────────────────────
case "$ACTION" in
    stop)
        if session_exists; then
            if [ "$MULTIPLEXER" = "tmux" ]; then
                tmux kill-session -t "$SESSION_NAME"
            else
                screen -S "$SESSION_NAME" -X quit
            fi
            unregister_bind
            echo "✓ 已停止实例: $INSTANCE_NAME（已解除绑定）"
        else
            echo "✗ 实例 '$INSTANCE_NAME' 未在运行"
        fi
        ;;

    status)
        if session_exists; then
            echo "✓ 实例 '$INSTANCE_NAME' 正在运行 (会话: $SESSION_NAME)"
            echo "  重新连接: $0 $INSTANCE_NAME attach"
            # 查询 Bridge Server 绑定状态
            if [ -n "$BIND_TARGET" ] || curl -s "${BRIDGE_API}/api/status" 2>/dev/null | grep -q "\"process_name\":\"$INSTANCE_NAME\""; then
                echo "  Bridge API: ${BRIDGE_API}"
            fi
        else
            echo "✗ 实例 '$INSTANCE_NAME' 未在运行"
        fi
        ;;

    attach)
        if session_exists; then
            echo "正在连接到实例: $INSTANCE_NAME ..."
            if [ "$MULTIPLEXER" = "tmux" ]; then
                tmux attach-session -t "$SESSION_NAME"
            else
                screen -r "$SESSION_NAME"
            fi
        else
            echo "✗ 实例 '$INSTANCE_NAME' 不存在，先启动: $0 $INSTANCE_NAME"
        fi
        ;;

    start|*)
        if session_exists; then
            echo "✓ 实例 '$INSTANCE_NAME' 已在运行"
            if [ -n "$BIND_TARGET" ]; then
                register_bind
                echo "  已更新绑定: $INSTANCE_NAME → $BIND_TARGET ($BIND_TYPE)"
            fi
            echo "  重新连接: $0 $INSTANCE_NAME attach"
            echo "  停止:     $0 $INSTANCE_NAME stop"
            exit 0
        fi

        if [ ! -x "$CLAUDE_BIN" ]; then
            echo "✗ 未找到 Claude Code: $CLAUDE_BIN"
            echo "  可用 CLAUDE_BIN=/path/to/claude $0 $INSTANCE_NAME 指定路径"
            exit 1
        fi

        echo "启动实例: $INSTANCE_NAME ..."
        if [ "$MULTIPLEXER" = "tmux" ]; then
            tmux new-session -d -s "$SESSION_NAME" "$CLAUDE_BIN"
        else
            screen -dmS "$SESSION_NAME" "$CLAUDE_BIN"
        fi

        sleep 1
        if session_exists; then
            echo "✓ 实例 '$INSTANCE_NAME' 已启动 (会话: $SESSION_NAME)"
            # 注册绑定
            if [ -n "$BIND_TARGET" ]; then
                register_bind
                echo "✓ 已绑定飞书: $INSTANCE_NAME → $BIND_TARGET ($BIND_TYPE)"
            fi
            echo "  重新连接: $0 $INSTANCE_NAME attach"
            echo "  停止:     $0 $INSTANCE_NAME stop"
            echo "  列出所有: $0 list"
        else
            echo "✗ 启动失败，请检查: $CLAUDE_BIN"
        fi
        ;;
esac
