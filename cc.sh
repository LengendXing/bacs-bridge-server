#!/bin/bash
# Claude Code 多实例守护进程启动脚本（飞书桥接扩展版 · 智能化）
#
# 用法:
#   ./cc.sh <名字>                                                    # 启动实例（已存在则提示）
#   ./cc.sh <名字> attach|go                                          # 连接到指定实例
#   ./cc.sh <名字> stop                                               # 停止指定实例
#   ./cc.sh <名字> status                                             # 查看实例状态
#   ./cc.sh <名字> --app-id <AppID> --app-secret <AppSecret>          # 启动并绑定飞书应用
#   ./cc.sh list                                                      # 列出所有运行中实例
#   ./cc.sh -s                                                        # 交互式：选择/创建并直接进入
#
# 示例:
#   ./cc.sh work
#   ./cc.sh work attach          # 进入 work
#   ./cc.sh work go              # 同上
#   ./cc.sh work --app-id cli_xxx --app-secret SECRET
#   ./cc.sh -s
#
# 环境变量（可选，外部配置，本脚本无硬编码）:
#   CLAUDE_BIN                  Claude Code 可执行文件路径，默认 $HOME/.local/bin/claude
#   BRIDGE_API                  Bridge Server 地址，默认 http://127.0.0.1:3456
#   SESSION_PREFIX              tmux/screen 会话前缀，默认 claude
#   ANTHROPIC_BASE_URL          传给 CC 的网关地址（不设置则用 CC 默认）
#   ANTHROPIC_API_KEY           传给 CC 的 API Key（不设置则用 CC 默认）

CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
BRIDGE_API="${BRIDGE_API:-http://127.0.0.1:3456}"
SESSION_PREFIX="${SESSION_PREFIX:-claude}"

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
    echo "    macOS:         brew install tmux"
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

# 列出所有实例（纯名称，不含前缀）
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

# ── 向 Bridge Server 注册/注销绑定 ──
register_bind() {
    if [ -n "$APP_ID" ] && [ -n "$APP_SECRET" ]; then
        curl -s -X POST "${BRIDGE_API}/api/bind" \
            -H "Content-Type: application/json" \
            -d "{\"process_name\":\"${INSTANCE_NAME}\",\"feishu_app_id\":\"${APP_ID}\",\"feishu_app_secret\":\"${APP_SECRET}\"}" \
            > /dev/null 2>&1
    fi
}

unregister_bind() {
    curl -s -X POST "${BRIDGE_API}/api/unbind" \
        -H "Content-Type: application/json" \
        -d "{\"process_name\":\"${INSTANCE_NAME}\"}" \
        > /dev/null 2>&1
}

# ── 启动实例 ────────────────────────────────────────────
start_instance() {
    if [ ! -x "$CLAUDE_BIN" ]; then
        echo "✗ 未找到 Claude Code: $CLAUDE_BIN"
        echo "  可用 CLAUDE_BIN=/path/to/claude $0 $INSTANCE_NAME 指定路径"
        return 1
    fi

    echo "启动实例: $INSTANCE_NAME ..."

    # 组装环境变量前缀（仅在调用方提供时注入，无硬编码）
    local envprefix=""
    if [ -n "$ANTHROPIC_BASE_URL" ]; then
        envprefix+="ANTHROPIC_BASE_URL='$ANTHROPIC_BASE_URL' "
    fi
    if [ -n "$ANTHROPIC_API_KEY" ]; then
        envprefix+="ANTHROPIC_API_KEY='$ANTHROPIC_API_KEY' unset_token=1 "
    fi

    if [ "$MULTIPLEXER" = "tmux" ]; then
        if [ -n "$ANTHROPIC_API_KEY" ]; then
            tmux new-session -d -s "$SESSION_NAME" \
              "unset ANTHROPIC_AUTH_TOKEN && ${envprefix}$CLAUDE_BIN"
        else
            tmux new-session -d -s "$SESSION_NAME" "$CLAUDE_BIN"
        fi
    else
        if [ -n "$ANTHROPIC_API_KEY" ]; then
            screen -dmS "$SESSION_NAME" \
              env -u ANTHROPIC_AUTH_TOKEN \
                  ANTHROPIC_BASE_URL="$ANTHROPIC_BASE_URL" \
                  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
                  "$CLAUDE_BIN"
        else
            screen -dmS "$SESSION_NAME" "$CLAUDE_BIN"
        fi
    fi

    sleep 1
    if session_exists; then
        echo "✓ 实例 '$INSTANCE_NAME' 已启动 (会话: $SESSION_NAME)"
        if [ -n "$APP_ID" ] && [ -n "$APP_SECRET" ]; then
            echo "  正在注册飞书绑定..."
            register_bind
            echo "✓ 已绑定飞书: $INSTANCE_NAME → AppID=$APP_ID"
        fi
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

print_usage() {
    echo "用法: $0 <实例名> [start|stop|status|attach|go] [--app-id <ID> --app-secret <SECRET>]"
    echo "      $0 list"
    echo "      $0 -s"
    echo ""
    echo "示例:"
    echo "  $0 work                                              # 启动 work"
    echo "  $0 work attach                                       # 连接 work"
    echo "  $0 work go                                           # 同上"
    echo "  $0 work stop                                         # 停止 work"
    echo "  $0 work --app-id cli_xxx --app-secret SECRET         # 启动并绑定飞书"
    echo "  $0 list                                              # 列出全部实例"
    echo "  $0 -s                                                # 交互式选择/创建并进入"
}

# ── 参数处理 ──────────────────────────────────────────────
if [ -z "$1" ]; then
    print_usage
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

# -s 交互式
if [ "$1" = "-s" ]; then
    echo "当前运行中的 Claude Code 实例:"
    instances=$(get_instances)
    if [ -z "$instances" ]; then
        echo "  (无)"
    else
        echo "$instances" | sed 's/^/  • /'
    fi
    echo ""
    read -p "请输入要进入的实例名（不存在将自动创建）: " INSTANCE_NAME
    if [ -z "$INSTANCE_NAME" ]; then
        echo "✗ 实例名不能为空"
        exit 1
    fi
    APP_ID=""
    APP_SECRET=""
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
ACTION="start"
APP_ID=""
APP_SECRET=""

# 解析参数
shift
while [ $# -gt 0 ]; do
    case "$1" in
        --app-id)
            APP_ID="$2"
            shift 2
            ;;
        --app-secret)
            APP_SECRET="$2"
            shift 2
            ;;
        stop|status|attach|go|start)
            ACTION="$1"
            shift
            ;;
        *)
            echo "⚠️ 忽略未知参数: $1"
            shift
            ;;
    esac
done

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
        else
            echo "✗ 实例 '$INSTANCE_NAME' 未在运行"
        fi
        ;;

    attach|go)
        if session_exists; then
            attach_instance
        else
            echo "实例 '$INSTANCE_NAME' 不存在，正在创建..."
            if start_instance; then
                attach_instance
            fi
        fi
        ;;

    start|*)
        if session_exists; then
            echo "✓ 实例 '$INSTANCE_NAME' 已在运行"
            if [ -n "$APP_ID" ] && [ -n "$APP_SECRET" ]; then
                echo "  正在更新飞书绑定..."
                register_bind
                echo "✓ 已更新绑定: $INSTANCE_NAME → $APP_ID"
            fi
            echo "  连接进入: $0 $INSTANCE_NAME attach"
            echo "  停止:     $0 $INSTANCE_NAME stop"
            exit 0
        fi

        start_instance
        if [ $? -eq 0 ]; then
            echo "  连接进入: $0 $INSTANCE_NAME attach"
            echo "  停止:     $0 $INSTANCE_NAME stop"
            echo "  列出全部: $0 list"
        fi
        ;;
esac
