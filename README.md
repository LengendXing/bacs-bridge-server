# 飞书 × AI CLI 桥接系统

飞书消息桥接到 Claude Code / Codex CLI 进程，实现飞书对话驱动的 AI 编程。

## 一键部署

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/feishu-claudecode-bridge/main/cll.sh)
```

指定目录：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/feishu-claudecode-bridge/main/cll.sh) /opt/feishu-bridge
```

## 部署后目录结构

```
feishu-claudecode-bridge/
├── sourceCode/   ← 源码（git pull 更新）
└── deploy/       ← 运行时（PM2 从此启动）
```

## 更新流程

```bash
cd sourceCode/ && git pull
bash deploy.sh
```

## 首次部署后操作

1. 编辑 `deploy/.env`，填写 `JWT_SECRET`
2. 访问 `http://<IP>:3456/`，用 `nimasile` / 默认密码登录
3. 创建服务商（填 API 地址和密钥）
4. 在 tmux 中启动 CC 进程：`tmux new-session -s cc-work`
5. 管理面板中新建绑定，填飞书 App ID/Secret
