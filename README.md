# 飞书 × AI CLI 桥接系统（feishu-claudecode-bridge）

> 把飞书机器人变成 Claude Code / Codex 等 AI CLI 的远程交互入口。不再需要 SSH 进服务器开终端 —— 在飞书里 @ 机器人，就能直接驱动一个或多个 AI 编程进程。

**[🌐 多语言版本 / Language Versions](#-多语言版本--language-versions)** · [🤖 配套安卓端 bacs-android](https://github.com/LengendXing/bacs-android)

---

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

完整文档请阅读 → [中文 README](docs/readme/README.zh.md) | [English README](docs/readme/README.en.md)

---

## 🌐 多语言版本 / Language Versions

| 语言 | Language | 文件 |
|------|----------|------|
| 🇨🇳 简体中文 | Chinese (Simplified) | [README.zh.md](docs/readme/README.zh.md) |
| 🇺🇸 English | English | [README.en.md](docs/readme/README.en.md) |
| 🇯🇵 日本語 | Japanese | [README.ja.md](docs/readme/README.ja.md) |
| 🇷🇺 Русский | Russian | [README.ru.md](docs/readme/README.ru.md) |
| 🇩🇪 Deutsch | German | [README.de.md](docs/readme/README.de.md) |
| 🇫🇷 Français | French | [README.fr.md](docs/readme/README.fr.md) |
| 🇪🇸 Español | Spanish | [README.es.md](docs/readme/README.es.md) |
| 🇸🇦 العربية | Arabic (RTL) | [README.ar.md](docs/readme/README.ar.md) |
| 🇨🇳 བོད་སྐད་ | Tibetan | [README.bo.md](docs/readme/README.bo.md) |
| 🇨🇳 ئۇيغۇرچە | Uyghur (RTL) | [README.ug.md](docs/readme/README.ug.md) |
| 🇰🇷 한국어 | Korean | [README.ko.md](docs/readme/README.ko.md) |

---

## 📄 License

MIT © [LengendXing](https://github.com/LengendXing)
