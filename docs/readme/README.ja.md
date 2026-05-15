# Feishu × AI CLI ブリッジ（bacs-bridge-server）

> Feishu（Lark）ボットを Claude Code / Codex などの AI CLI のリモート操作インターフェースに変えます。SSH でサーバーに入って端末を開く必要はもうありません — Feishu でボットをメンションするだけで、1 台のサーバー上の複数の AI コーディングプロセスを駆動できます。

[🌐 他の言語](#-言語バージョン) · [🤖 Android アプリ：bacs-android](#-android-アプリ-bacs-android)

---

## 📖 目次

- [概要](#-概要)
- [主な機能](#-主な機能)
- [アーキテクチャ](#-アーキテクチャ)
- [プロジェクト構成](#-プロジェクト構成)
- [クイックスタート](#-クイックスタート)
- [デプロイ](#-デプロイ)
- [ユーザーガイド](#-ユーザーガイド)
- [Android アプリ bacs-android](#-android-アプリ-bacs-android)
- [環境変数](#-環境変数)
- [FAQ](#-faq)
- [バージョン履歴](#-バージョン履歴)
- [ライセンス](#-ライセンス)

---

## 🌟 概要

**bacs-bridge-server** は Feishu（Lark）ボットと AI CLI（Claude Code / Codex）を双方向に橋渡しするシステムです。常駐する Bridge Server が Feishu のメッセージイベントを指定された CLI プロセスへルーティングし、CLI の応答を対応する Feishu グループや個人チャットへ返送します。

ユースケース：
- チームが Feishu グループで AI コーディングタスクを共同で進める
- PC が手元になくても（スマホ・タブレットで）サーバー上の Claude Code を遠隔操作する
- 1 台のサーバー上で複数の AI プロセスを別々の Feishu チャットに紐付けてプロジェクトを分離する
- ブラウザや Android アプリから AI の進捗・ログ・タイムラインをリアルタイムに観察する

---

## ✨ 主な機能

| モジュール | 機能 |
|----------|------|
| **マルチプロセスバインディング** | 1 台のサーバー上で複数の CLI プロセス（cc-a / cc-b / codex-x ...）を同時管理し、それぞれ独立した Feishu ボットに紐付け |
| **リモートホスト管理** | 内蔵 SSH Executor でローカル + 複数リモートマシンの tmux セッションを統一管理 |
| **デュアル CLI 対応** | Claude Code (`cc`) と Codex アダプターを自由に併用可能 |
| **プロバイダ設定** | Anthropic / OpenAI / カスタム `base_url` + API キー |
| **モデル + Effort** | `cc` は `low~max`、`codex` は `minimal~xhigh`、モデルごとの maxEffort で自動キャップ |
| **Web ターミナル** | ブラウザの xterm を tmux pane に直結。タブを閉じても業務プロセスは killされない |
| **ライブタイムライン** | SSE でリアルタイムにメッセージを配信、TransitionGroup アニメ付き |
| **TOTP 2FA** | 双チャネルの信頼デバイス（FingerprintJS + Cookie トークン） |
| **監査ログ** | バインディング、ログイン、ターミナル接続はすべて `audit_logs` に記録 |
| **macOS 風 UI** | Tailwind + shadcn/ui、白黒灰系、Light / Dark 切替 |
| **PM2 ワンクリックデプロイ** | `deploy.sh` + `ecosystem.config.cjs` 付属、ソースとランタイムを分離 |

---

## 🏗 アーキテクチャ

```
┌────────────┐  @ボット + メッセージ  ┌────────────────┐
│ ユーザー    │ ─────────────────────▶│  Feishu 開放    │
│ (Web/スマホ)│ ◀───────────────────  │   プラットフォーム│
└────────────┘                        └────────┬───────┘
                                               │ Webhook / WS
                                               ▼
                              ┌─────────────────────────┐
                              │   Bridge Server         │
                              │ (Express + Vue + WS)    │
                              │                         │
                              │  ┌──────────────────┐   │
                              │  │ Channel 層        │   │   ← Feishu WS Client
                              │  │ Session ルーター  │   │
                              │  │ CLI アダプター    │   │
                              │  │ Executor (SSH+L) │   │
                              │  └──────────────────┘   │
                              └────────┬────────────────┘
                                       │ tmux send-keys / capture-pane
                                       ▼
                              ┌─────────────────────────┐
                              │ ローカル / リモートホスト │
                              │  ┌─────┐  ┌─────┐       │
                              │  │ cc  │  │codex│  ...  │
                              │  └─────┘  └─────┘       │
                              └─────────────────────────┘
```

技術スタック：
- **フロントエンド**：Vue 3 + Vite + TypeScript + Pinia + Tailwind + xterm.js
- **バックエンド**：Node.js 20+ + Express + ws + node-pty + ssh2
- **データベース**：SQLite + Drizzle ORM
- **プロセス管理**：tmux + PM2

---

## 📁 プロジェクト構成

```
bacs-bridge-server/
├── src/
│   ├── client/          # Vue 3 フロントエンド
│   ├── server/          # Express バックエンド
│   └── shared/          # 共有型定義
├── scripts/             # マイグレーション / シード
├── data/                # SQLite（実行時生成）
├── docs/                # readme/ + plans/
├── deploy.sh            # PM2 デプロイスクリプト
├── cll.sh               # リモート 1 行インストーラ
├── ecosystem.config.cjs
├── .env.example
└── package.json
```

---

## 🚀 クイックスタート

### 1. 前提条件

- Node.js ≥ 20
- npm ≥ 10（または pnpm）
- tmux ≥ 3.0
- 少なくとも 1 つの AI CLI バイナリ：`claude` または `codex`
- Feishu の**企業内カスタムアプリ**（`im:message` / `im:message.group_at_msg` 権限）

### 2. ローカル開発

```bash
git clone https://github.com/LengendXing/bacs-bridge-server.git
cd bacs-bridge-server

npm install
cp .env.example .env       # JWT_SECRET などを設定

npm run db:migrate
npm run seed

npm run dev                # クライアント + サーバー並列起動
```

`http://localhost:3456/` を開き、`nimasile` / `.env` の `ADMIN_PASSWORD` でログイン。

---

## 📦 デプロイ

### 方法 A — ワンライナーリモートインストール（推奨）

対象サーバーで：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/bacs-bridge-server/main/cll.sh)
```

ディレクトリ指定：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/bacs-bridge-server/main/cll.sh) /opt/bacs-bridge
```

デプロイ後のディレクトリ構成：

```
bacs-bridge-server/
├── sourceCode/   ← ソース（git pull で更新）
└── deploy/       ← ランタイム（PM2 がここから起動）
```

### 方法 B — 手動 PM2

```bash
git clone https://github.com/LengendXing/bacs-bridge-server.git
cd bacs-bridge-server
bash deploy.sh
```

### 方法 C — 日常的な更新

```bash
cd sourceCode/
git pull
bash deploy.sh   # 自動的にビルド + PM2 リロード
```

### 初回デプロイ後のチェックリスト

1. `deploy/.env` で `JWT_SECRET` / `ADMIN_PASSWORD` を設定
2. ブラウザで `http://<サーバーIP>:3456/` を開く
3. ログイン後「設定」で 2FA を有効化（強く推奨）
4. 「マシン」：ローカルは登録済み。リモートは SSH 認証情報を追加
5. 「プロバイダ」：Anthropic / OpenAI / カスタム を作成
6. サーバーで `tmux new-session -d -s cc-work` を実行
7. 「バインディング」：Feishu の App ID / Secret / Verification Token / Encrypt Key + CLI + プロバイダ + モデル + Effort を入力
8. Feishu グループでボットをメンション → cc / codex プロセスが自動起動

---

## 📘 ユーザーガイド

### Feishu アプリ設定

1. [open.feishu.cn](https://open.feishu.cn/) で**企業内カスタムアプリ**を作成
2. 権限を有効化：
   - `im:message`
   - `im:message:receive_v1`
   - `im:message.group_at_msg`
3. イベント購読：**長コネクションモード**を推奨（または Request URL `https://<host>/webhook/feishu`）
4. App ID / Secret / Verification Token / Encrypt Key を Bridge の「バインディング」へ貼り付け

### バインディング作成

「バインディング」→「新規」：
- **名前**：任意（例：`cc-projectA`）
- **マシン**：ローカル or 登録済みリモート
- **CLI**：cc / codex
- **プロバイダ**：作成済みプロバイダ
- **モデル**：自動探索、失敗時はデフォルト一覧 or カスタム ID 入力
- **Effort**：モデルの maxEffort に応じた段階
- **Feishu 4 件セット**：App ID / Secret / Verification Token / Encrypt Key

保存後、Bridge が WS 長コネクションを開始し、`online` になればグループで @ メンションで利用可能。

### Web ターミナル

「バインディング」一覧の `Terminal` ボタンで xterm が開き、以下と等価：

```bash
tmux attach -t cc-projectA
```

**重要：タブを閉じても tmux セッションは kill されません — 業務プロセスは継続稼働します。** Ctrl-b d で手動 detach、ResizeObserver で window サイズ同期、5 分間操作なしで WS 自動切断（業務プロセスは無影響）。

### ライブタイムライン

ホーム画面下部に直近 20 件の Feishu メッセージを SSE 配信。新着は上から scale+fade で挿入、クリックで展開/折りたたみ、プラットフォームタグは色分け。

### システムログ

「ログ」メニュー：バックエンドログを SSE でリアルタイムにストリーミング、起動時に直近 N 行をリプレイ、ハートビート付き。

### テーマ切替

右上の太陽/月アイコンで Light / Dark を切替。白黒灰の配色。

---

## 📱 Android アプリ bacs-android

> プロジェクト：[https://github.com/LengendXing/bacs-android](https://github.com/LengendXing/bacs-android)

**bacs-android** は公式 Android クライアントです：

- 🔔 タイムラインのプッシュをリアルタイム受信、AI 応答が IM のように届く
- ⌨️ スマホからコマンドを直接送信、Feishu を開く必要なし
- 📊 すべてのバインディングのステータス（online / offline / awaiting_choice）を監視
- 📜 履歴セッションとシステムログを閲覧
- 🔐 デバイスフィンガープリント信頼 + TOTP 2FA
- 🌙 システムテーマに追従

**接続方法**：Bridge URL（例：`http://192.168.1.100:3456`）を入力し、Bridge の「設定」ページの QR コードをスキャンで一発ログイン（短期 JWT → クライアント側で長 token と交換、QR が漏れても安全）。

詳細：[bacs-android README](https://github.com/LengendXing/bacs-android#readme)

---

## 🔧 環境変数

`.env.example` 参照：

| 変数 | デフォルト | 説明 |
|------|----------|------|
| `BRIDGE_PORT` | `3456` | HTTP / WS ポート |
| `BRIDGE_HOST` | `0.0.0.0` | バインドアドレス |
| `BRIDGE_PROGRESS_INTERVAL` | `30` | 進捗カード更新間隔（秒） |
| `BRIDGE_TIMEOUT` | `600` | 1 ターンの最大待機（秒） |
| `BRIDGE_POLL_INTERVAL` | `2` | tmux capture-pane ポーリング（秒） |
| `BRIDGE_MAX_CONCURRENT` | `4` | 最大同時セッション数 |
| `DB_PATH` | `./data/bridge.db` | SQLite パス |
| `JWT_SECRET` | — | **必須** — JWT 署名キー |
| `ADMIN_PASSWORD` | `admin` | 初回 seed 時の管理者パスワード |
| `LOG_LEVEL` | `info` | ログレベル |
| `LOG_DIR` | `./logs` | ログディレクトリ |

---

## ❓ FAQ

**Q: Feishu にメッセージを送ったがボットが返事しない。**
A: ① バインディングが `online`、② tmux セッションが生存、③ プロバイダの API キーが有効、④「ログ」メニューでバックエンドログを確認。

**Q: リモートで "Not logged in" になる。**
A: v1.0.8 で修正済 — tmux 起動コマンドが `bash -ilc` でラップされ、リモート rc ファイルがロードされるようになりました。

**Q: SSH が長時間タスク中に切断される。**
A: v1.0.10 で修正済 — ハートビートを 5min → 30s に短縮、60s アイドル切断を削除。

**Q: tmux セッションが存在しない場合は？**
A: Bridge がバインディング起動時に自動作成（例：`cc-xxx` / `codex-xxx`）。

**Q: Web ターミナルのタブを閉じると業務プロセスが kill される？**
A: **されません**。ターミナルは tmux クライアントを detach するだけ。コードレベルで強制防御：セッション名はホワイトリスト正規表現、close パスは `tmux kill-session` を呼びません。

---

## 🗂 バージョン履歴

完全な履歴：[maintain.md](../maintain.md)

最近のバージョン：
- **v1.1.7**（現在）— 多言語 README（10 言語）+ bacs-android 説明
- **v1.1.6** — システムタイトル + 右上ログアウト削除 + bacs_chat_time_line ライブタイムライン
- **v1.1.5** — 信頼デバイスフィンガープリント再構築（双チャネル）
- **v1.1.4** — BindingsView デュアル Tab + リストページネーション + Terminal シングルトン + 5min keep-alive
- **v1.1.3** — ブラウザ Web ターミナル
- **v1.0.0** — フルリライト

---

## 🌐 言語バージョン

| 言語 | ファイル |
|------|------|
| 🇨🇳 简体中文 | [README.zh.md](README.zh.md) |
| 🇺🇸 English | [README.en.md](README.en.md) |
| 🇯🇵 日本語 | [README.ja.md](README.ja.md) |
| 🇷🇺 Русский | [README.ru.md](README.ru.md) |
| 🇩🇪 Deutsch | [README.de.md](README.de.md) |
| 🇫🇷 Français | [README.fr.md](README.fr.md) |
| 🇪🇸 Español | [README.es.md](README.es.md) |
| 🇸🇦 العربية | [README.ar.md](README.ar.md) |
| 🇨🇳 བོད་སྐད་ | [README.bo.md](README.bo.md) |
| 🇨🇳 ئۇيغۇرچە | [README.ug.md](README.ug.md) |
| 🇰🇷 한국어 | Korean | [README.ko.md](README.ko.md) |

---

## 📄 ライセンス

MIT © [LengendXing](https://github.com/LengendXing)
