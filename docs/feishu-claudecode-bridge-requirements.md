# 机器人 × AI-CLI 消息桥接系统 · 需求文档

## 一、项目背景

用户在服务器上通过 shell 脚本启动多个 Claude Code 进程，日常操作需要打开终端与之交互，体验不便。本项目旨在将飞书机器人作为交互入口，通过一个中间 Server 实现飞书消息与指定 Claude Code 进程之间的双向通信，彻底脱离终端操作。

---

## 二、系统架构

```
用户（飞书） 
  │  @机器人 + 消息
  ▼
飞书服务器
  │  事件推送（im.message.receive_v1）
  ▼
Bridge Server（中间服务）
  │  根据机器人绑定关系，路由到对应进程
  ▼
Claude Code 进程（./cc.sh a / ./cc.sh b / ...）
  │  处理完成后输出回复
  ▼
Bridge Server
  │  调用飞书 API 发送消息
  ▼
用户（飞书）收到回复
```

---

## 三、核心功能需求

### 3.1 多进程管理与绑定

- 用户通过 shell 脚本启动 Claude Code 进程，示例：
  ```bash
  ./cc.sh a   # 启动进程 a
  ./cc.sh b   # 启动进程 b
  ```
- 每个进程启动时，**绑定一个飞书机器人标识**（如机器人 ID、群 ID 或用户 ID）
- 绑定关系示例：
  | 进程标识 | 绑定飞书目标 |
  |----------|-------------|
  | a        | 群 A 的机器人 |
  | b        | 群 B 的机器人 |
- 绑定关系持久化存储（如 JSON 文件或 SQLite），服务重启后可恢复

### 3.2 飞书消息接收（入方向）

- Bridge Server 注册为飞书自建应用机器人
- 订阅事件：`im.message.receive_v1`（接收 @ 机器人的消息）
- 参考飞书官方文档：[事件订阅概述](https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case)
- 收到消息后：
  1. 解析消息来源（群 ID / 用户 ID）
  2. 查询绑定关系，找到对应的 Claude Code 进程
  3. 将消息内容写入该进程的 stdin（流式输入）

### 3.3 消息路由

- 根据**消息来源**匹配对应的 Claude Code 进程
- 若来源未绑定任何进程，回复提示："该对话未绑定任何 Claude Code 进程"
- 若进程已退出，回复提示："进程 [x] 已离线"

### 3.4 Claude Code 回复监听（出方向）

- Bridge Server 监听每个 Claude Code 进程的 stdout / stderr
- 检测到完整回复后，调用飞书消息 API 发送至对应绑定的飞书目标
- 参考：[发送消息 API](https://open.feishu.cn/document/server-docs/im-v1/message/create)
- 回复格式：保留 Markdown 格式（飞书支持富文本卡片）

### 3.5 进度汇报（处理中状态）

- Claude Code 处于处理中时（即用户发送消息后，尚未收到完整回复），Bridge Server 启动定时器
- **每隔 N 秒**（默认 30s，可配置）向飞书发送一条进度消息，内容示例：
  ```
  ⏳ Claude Code [进程 a] 处理中...
  已用时：00:01:23
  当前输出片段：[最新 stdout 片段，截取最后 200 字]
  ```
- 当 Claude Code 回复完成后，停止定时器，发送最终完整回复
- 若超时（可配置，默认 10 分钟），发送超时提示并停止等待

---

## 四、飞书应用配置要求

### 4.1 应用类型
- **企业自建应用**（非自定义 Webhook 机器人，后者不支持接收消息）

### 4.2 需开通权限
| 权限 | 说明 |
|------|------|
| `im:message:receive_v1` | 接收用户发给机器人的消息 |
| `im:message` | 发送消息 |
| `im:message.group_at_msg` | 接收群内 @ 机器人消息 |

### 4.3 事件订阅配置
- 进入飞书开放平台 → 应用 → 事件订阅
- 配置 Request URL：`https://your-server.com/webhook/feishu`
- 添加事件：`im.message.receive_v1`
- 参考：[接收消息事件文档](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive)

### 4.4 飞书验证
- Bridge Server 需响应飞书的 URL 验证请求（返回 `challenge` 字段）
- 建议开启飞书消息加密（配置 Encrypt Key）

---

## 五、Bridge Server 技术要求

### 5.1 进程通信方式
- 通过 **stdin/stdout pipe** 与 Claude Code 子进程通信
- 或监听 Claude Code 的 `--output-format stream-json` 输出（如支持）

### 5.2 接口设计
| 接口 | 方法 | 说明 |
|------|------|------|
| `/webhook/feishu` | POST | 接收飞书事件推送 |
| `/bind` | POST | 绑定进程与飞书目标 |
| `/unbind` | POST | 解除绑定 |
| `/status` | GET | 查看所有进程绑定状态 |

### 5.3 启动方式（cc.sh 扩展）
```bash
# 启动进程 a，并绑定到飞书群 ID：oc_xxxxxx
./cc.sh a --bind oc_xxxxxx

# 启动进程 b，绑定到飞书用户 ID
./cc.sh b --bind ou_yyyyyy
```

---

## 六、非功能需求

| 项目 | 要求 |
|------|------|
| 可靠性 | 进程崩溃后自动重启，绑定关系不丢失 |
| 并发 | 支持至少 4 个 Claude Code 进程同时运行 |
| 日志 | 记录所有消息收发、路由结果、错误信息 |
| 安全 | 验证飞书签名，防止伪造请求 |
| 配置 | 所有参数（定时间隔、超时时长、端口等）通过配置文件管理 |

---

## 七、参考文档

- 飞书事件订阅概述：https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case
- 接收消息事件（im.message.receive_v1）：https://open.feishu.cn/document/server-docs/im-v1/message/events/receive
- 发送消息 API：https://open.feishu.cn/document/server-docs/im-v1/message/create
- 飞书自建应用创建：https://open.feishu.cn/document/home/develop-a-bot-within-5-minutes/create-an-app
