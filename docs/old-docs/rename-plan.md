# 项目改名方案：feishu-claudecode-bridge → bacs-bridge-server

## 改动清单

| 步骤 | 操作 | 文件 | 说明 |
|------|------|------|------|
| 1 | package.json name | `package.json` | `bacs-bridge-server` |
| 2 | package-lock.json name | `package-lock.json` | 同上 x2 |
| 3 | PM2 进程名 | `ecosystem.config.cjs` | `bacs-bridge-server` |
| 4 | PM2 引用 | `deploy.sh` | `pm2 delete bacs-bridge-server` + 日志 |
| 5 | 仓库 URL + 目录 | `cll.sh` | REPO + ROOT_DIR |
| 6 | 源码注释 | `src/server/index.ts` | @description |
| 7 | 12 个 README | `README.md` + `docs/readme/README.*.md` | 项目名 + URL + 目录树 + 命令 |
| 8 | HKDF 盐值 | `src/server/crypto/credentials.ts` | 方案 A：保留旧值 + 注释 |

## 不改项

- `BRIDGE_*` 环境变量前缀（通用词，非项目名）
- `bacs_chat_time_line` / `bacs_device_id` 等（已是 bacs 前缀）
- `scripts/migrate-bindings.ts`（旧迁移路径，历史代码不动）

## HKDF 盐值决策

**方案 A（采纳）**：保留 `feishu-bridge-credential-encryption-v1` 不变，加注释说明历史原因。改值会导致已加密的 TOTP 密钥无法解密。

## GitHub 操作

1. GitHub Settings → Repository name → `bacs-bridge-server`
2. 本地 `git remote set-url origin https://github.com/LengendXing/bacs-bridge-server.git`
