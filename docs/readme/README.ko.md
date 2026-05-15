# 🇰🇷 한국어 飞书 × AI CLI 브릿지 시스템（feishu-claudecode-bridge）

> 飞书 로봇을 Claude Code / Codex 등 AI CLI의 원격 인터랙션 입구로 변환합니다. 더 이상 서버에 SSH로 접속해 터미널을 열 필요가 없습니다 —— 飞书에서 로봇을 @멘션하면 하나 이상의 AI 프로그래밍 프로세스를 직접 구동할 수 있습니다.

[🌐 다국어 버전](#-다국어-version) · [🤖 연동 안드로이드 앱 bacs-android](#-연동-안드로이드-앱-bacs-android)

---

## 📖 목차

- [프로젝트 소개](#-프로젝트-소개)
- [핵심 기능](#-핵심-기능)
- [시스템 아키텍처](#-시스템-아키텍처)
- [프로젝트 구조](#-프로젝트-구조)
- [빠른 시작](#-빠른-시작)
- [배포 가이드](#-배포-가이드)
- [사용 문서](#-사용-문서)
- [연동 안드로이드 앱 bacs-android](#-연동-안드로이드-앱-bacs-android)
- [환경 변수](#-환경-변수)
- [자주 묻는 질문](#-자주-묻는-질문)
- [버전 및 이터레이션](#-버전-및-이터레이션)
- [License](#-license)

---

## 🌟 프로젝트 소개

**feishu-claudecode-bridge**는 飞书 로봇과 AI CLI 도구(Claude Code / Codex)를 양방향으로 브릿징하는 시스템입니다. 상주하는 Bridge Server를 통해 飞书 메시지 이벤트를 지정된 CLI 프로세스로 라우팅하고, CLI의 응답을 다시 飞书 그룹이나 飞书 개인 채팅으로 전송합니다.

적용 시나리오:
- 팀에서 飞书 그룹을 통해 협업하며 AI 프로그래밍 작업 구동
- PC가 없는 환경(모바일, 태블릿)에서 서버의 Claude Code 원격 조작
- 동일 서버의 여러 AI 프로세스를 서로 다른 飞书 그룹에 바인딩하여 프로젝트 격리
- 브라우저 또는 안드로이드 앱으로 AI 처리 진행 상황, 로그, 대화 Timeline을 실시간 관찰

---

## ✨ 핵심 기능

| 모듈 | 기능 |
|------|------|
| **다중 머신 바인딩** | 동일 서버에서 여러 CLI 프로세스(cc-a / cc-b / codex-x ...)를 동시에 관리하며, 각 프로세스를 독립적으로 飞书 로봇에 바인딩 |
| **원격 머신 관리** | 내장 SSH Executor로 로컬 + 여러 원격 머신의 tmux session을 통합 관리 |
| **듀얼 CLI 지원** | Claude Code(cc)와 Codex 두 가지 CLI 어댑터, 동시 혼용 가능 |
| **유연한 서비스 제공자 구성** | Anthropic / OpenAI 등 서비스 제공자 설정 내장, 커스텀 base_url 및 API Key 지원 |
| **다중 모델 + Effort** | cc는 low~max, codex는 minimal~xhigh 지원, 모델 maxEffort에 따라 자동 차단 |
| **Web Terminal** | 브라우저 내 xterm으로 tmux pane에 직접 연결,所见即所得, 창을 닫아도 비즈니스 프로세스가 종료되지 않음 |
| **실시간 Timeline** | 홈페이지 SSE로 모든 AI ↔ 사용자 메시지를 실시간 푸시, TransitionGroup 애니메이션 |
| **TOTP 2단계 인증** | 내장 2FA, 신뢰 기기 지문(FingerprintJS) + Cookie Token 듀얼 채널 지원 |
| **감사 로그** | 모든 민감 작업(바인딩, 로그인, Terminal 접속)이 audit_logs에 기록 |
| **macOS 스타일 테마** | Tailwind + shadcn/ui 흑백회 스타일, Light/Dark 전환 지원 |
| **PM2 원클릭 배포** | `deploy.sh` + `ecosystem.config.cjs` 내장, 소스코드와 런타임 분리 |

---

## 🏗 시스템 아키텍처

```
┌────────────┐   @ 로봇 + 메시지    ┌────────────────┐
│  사용자     │ ───────────────────▶│  飞书 오픈 플랫폼 │
│ (飞书/모바일)│ ◀───────────────── │ (Open Feishu)   │
└────────────┘                     └────────┬───────┘
                                            │ Webhook / WS
                                            ▼
                              ┌─────────────────────────┐
                              │   Bridge Server         │
                              │ (Express + Vue + WS)    │
                              │                         │
                              │  ┌──────────────────┐   │
                              │  │ Channel 추상      │   │   ← 飞书 WS Client
                              │  │ Session 라우팅   │   │
                              │  │ CLI Adapter       │   │
                              │  │ Executor (로컬+SSH)│   │
                              │  └──────────────────┘   │
                              └────────┬────────────────┘
                                       │ tmux send-keys / capture-pane
                                       ▼
                              ┌─────────────────────────┐
                              │  로컬 또는 원격 머신     │
                              │  ┌─────┐  ┌─────┐       │
                              │  │ cc  │  │codex│  ...  │
                              │  └─────┘  └─────┘       │
                              └─────────────────────────┘
```

기술 스택:
- **프론트엔드**: Vue 3 + Vite + TypeScript + Pinia + Tailwind + xterm.js
- **백엔드**: Node.js 20+ + Express + ws + node-pty + ssh2
- **데이터베이스**: SQLite + Drizzle ORM
- **프로세스 관리**: tmux + PM2

---

## 📁 프로젝트 구조

```
feishu-claudecode-bridge/
├── src/
│   ├── client/               # Vue 3 프론트엔드
│   │   ├── views/            # 9개 핵심 페이지（Home/Bindings/Machines/Providers/Terminal/Logs/Settings/Login/Layout）
│   │   ├── components/       # 공통 컴포넌트（Pagination/TerminalPanel ...）
│   │   ├── composables/      # useAuth / useDeviceId / useTerminalSession
│   │   └── router/           # vue-router
│   ├── server/               # Express 백엔드
│   │   ├── routes/           # auth/bindings/machines/providers/sessions/logs/timeline/settings/models/health
│   │   ├── channel/          # 飞书 WS Channel + 추상 인터페이스
│   │   ├── cli/              # CC / Codex adapter
│   │   ├── executor/         # 로컬 + SSH 실행기
│   │   ├── terminal/         # pty-bridge + ws-server（Web Terminal）
│   │   ├── auth/             # JWT + TOTP + 신뢰 기기 지문
│   │   ├── db/               # Drizzle schema + 마이그레이션 파일
│   │   └── session/          # 세션 상태머신（idle / working / awaiting_choice）
│   └── shared/               # 프론트/백엔드 공유 타입
├── scripts/                  # migrate-db / seed-admin / migrate-bindings
├── data/                     # SQLite 데이터베이스（런타임 생성）
├── docs/                     # 문서（readme/, plans/ 포함）
├── deploy.sh                 # PM2 원클릭 배포 스크립트
├── cll.sh                    # 원격 원클릭 설치 스크립트
├── ecosystem.config.cjs      # PM2 설정
├── .env.example
└── package.json
```

---

## 🚀 빠른 시작

### 1. 환경 요구사항

- Node.js ≥ 20
- npm ≥ 10（또는 pnpm）
- tmux ≥ 3.0（CLI 프로세스 호스팅）
- 최소 하나의 AI CLI 실행 가능: `claude`（Claude Code）또는 `codex`
- 飞书 기업 자체 앱（`im:message`, `im:message.group_at_msg` 권한 필요）

### 2. 로컬 시작

```bash
# 클론
git clone https://github.com/LengendXing/feishu-claudecode-bridge.git
cd feishu-claudecode-bridge

# 의존성 설치
npm install

# 환경 변수 복사
cp .env.example .env
# .env 편집, JWT_SECRET 등 입력

# 데이터베이스 초기화 + 시드 계정
npm run db:migrate
npm run seed

# 개발 모드（프론트/백엔드 동시 실행）
npm run dev
```

`http://localhost:3456/`에 접속하여 기본 계정 `nimasile` / `.env`에 설정한 `ADMIN_PASSWORD`로 로그인합니다.

---

## 📦 배포 가이드

### 방법 1: 원클릭 원격 배포（권장）

대상 서버에서 실행:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/feishu-claudecode-bridge/main/cll.sh)
```

설치 디렉토리 지정:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/feishu-claudecode-bridge/main/cll.sh) /opt/feishu-bridge
```

배포 후 디렉토리 구조:

```
feishu-claudecode-bridge/
├── sourceCode/   ← 소스코드（git pull로 업데이트）
└── deploy/       ← 런타임（PM2가 여기서 시작）
```

### 방법 2: 수동 PM2 배포

```bash
git clone https://github.com/LengendXing/feishu-claudecode-bridge.git
cd feishu-claudecode-bridge
bash deploy.sh
```

`deploy.sh`가 수행하는 작업:
1. `npm ci`로 의존성 설치
2. `npm run build`로 프론트/백엔드 빌드
3. `dist/`, `scripts/`, `package.json` 등을 `../deploy/`로 복사
4. `../deploy/`에서 `pm2 start ecosystem.config.cjs` 실행

### 방법 3: 일상 업데이트 절차

```bash
cd sourceCode/
git pull
bash deploy.sh   # 자동 빌드 + PM2 재시작
```

### 첫 배포 후 필수 작업

1. `deploy/.env` 편집, `JWT_SECRET`, `ADMIN_PASSWORD` 입력
2. 브라우저에서 `http://<서버IP>:3456/` 접속
3. 기본 계정으로 로그인 후, 「설정」에서 2FA 활성화（강력 권장）
4. 「머신」메뉴: 기본 로컬 머신이 준비됨; 원격 머신이 필요한 경우 신규 생성 후 SSH 자격 증명 입력
5. 「서비스 제공자」메뉴: Anthropic / OpenAI / 커스텀 서비스 제공자 생성, base_url + API Key 입력
6. 서버에서 tmux session 시작: `tmux new-session -d -s cc-work`
7. 「바인딩」메뉴: 飞书 로봇 바인딩 추가, App ID / App Secret / Verification Token / Encrypt Key + CLI + 서비스 제공자 + 모델 + Effort 선택
8. 飞书 그룹에서 로봇 @멘션 후 임의 메시지 전송 → 백엔드에서 자동으로 cc/codex 프로세스 시작 및 브릿징

---

## 📘 사용 문서

### 飞书 앱 구성

1. [飞书 오픈 플랫폼](https://open.feishu.cn/)에서 **기업 자체 앱** 생성
2. 권한 활성화:
   - `im:message`（메시지 발송）
   - `im:message:receive_v1`（메시지 수신）
   - `im:message.group_at_msg`（그룹 내 @멘션 수신）
3. 이벤트 구독: **롱 커넥션 모드** 활성화（권장）또는 Request URL `https://<host>/webhook/feishu` 구성
4. App ID / App Secret / Verification Token / Encrypt Key 복사 → Bridge의 「바인딩」구성에 붙여넣기

### 바인딩 생성

「바인딩」메뉴 → 신규 추가:
- **바인딩 이름**: 자유 설정（예: `cc-projectA`）
- **머신(host)**: 로컬 또는 미리 생성한 원격 머신 선택
- **CLI 유형**: cc / codex
- **서비스 제공자**: 이미 생성한 서비스 제공자 선택
- **모델**: 서비스 제공자에서 자동 탐지; 탐지 실패 시 기본 모델 수동 선택 또는 커스텀 모델 ID 입력
- **Effort**: 모델 maxEffort에 따라 선택 가능한 단계 표시
- **飞书 앱 4종 세트**: App ID / Secret / Verification Token / Encrypt Key

저장 후, Bridge가 자동으로 飞书 롱 커넥션 WS 연결을 시도하며, 상태가 `online`이 되면 飞书 그룹에서 로봇 @멘션을 통해 사용할 수 있습니다.

### Web Terminal

「바인딩」목록에서 `Terminal` 버튼 클릭, 브라우저 내에서 xterm이 직접 열리며, 로컬에서 다음을 실행하는 것과 동일:

```bash
tmux attach -t cc-projectA
```

**핵심 보안 제약: 브라우저 Terminal 탭을 닫아도 tmux session이 종료되지 않으며, 비즈니스 프로세스는 계속 실행됩니다.**

Ctrl-b d로 수동 detach, ResizeObserver로 창 크기 동기화, 5분간 작업이 없으면 WebSocket이 자동으로 끊어집니다（비즈니스 프로세스에는 영향 없음）.

### 실시간 Timeline

홈페이지 하단 Timeline 영역에 최근 20개 飞书 메시지가 표시됩니다（SSE 실시간 푸시）, 새 항목이 상단에서 scale+fade로 슬라이드 인, 클릭으로 전체 내용 펼치기/접기, 플랫폼 태그 색상 구분（飞书 녹색 / Telegram 파란색 예약）.

### 시스템 로그

「로그」메뉴: SSE로 백엔드 실행 로그를 실시간 스크롤（최근 N줄 재생 + 하트비트 유지 지원）.

### 테마 전환

우측 상단 태양/달 아이콘으로 Light / Dark 모드 전환, 테마 색상은 흑백회 계열.

---

## 📱 연동 안드로이드 앱 bacs-android

> 프로젝트 주소: [https://github.com/LengendXing/bacs-android](https://github.com/LengendXing/bacs-android)

**bacs-android**는 본 시스템의 공식 안드로이드 앱으로, 스마트폰에서:

- 🔔 Bridge Timeline 푸시를 실시간 수신, AI 응답이 IM 메시지처럼 도착
- ⌨️ 스마트폰에서 직접 명령어를 입력해 Bridge로 전송, 飞书를 열 필요 없음
- 📊 모든 바인딩된 CLI 프로세스 상태 확인（online / offline / awaiting_choice）
- 📜 과거 세션 및 시스템 로그 열람
- 🔐 TOTP 2단계 로그인 + 기기 지문 신뢰
- 🌙 시스템 설정 따르는 Light / Dark 테마

**연결 방법**: 앱 시작 후 Bridge Server 주소（예: `http://192.168.1.100:3456`）를 입력하고, 설정 페이지의 빠른 로그인 QR코드를 스캔하면 원클릭 로그인 완료（60초 단기 JWT → 클라이언트에서 장기 token 교환 방식, QR코드 유출 방지）.

**안드로이드 프로젝트**의 전체 문서는 [bacs-android README](https://github.com/LengendXing/bacs-android#readme)를 참조하세요.

---

## 🔧 환경 변수

`.env`（`.env.example` 참조）:

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `BRIDGE_PORT` | `3456` | HTTP / WS 수신 포트 |
| `BRIDGE_HOST` | `0.0.0.0` | 수신 주소 |
| `BRIDGE_PROGRESS_INTERVAL` | `30` | 진행 카드 새로고침 간격（초） |
| `BRIDGE_TIMEOUT` | `600` | 단일 AI 대기 타임아웃（초） |
| `BRIDGE_POLL_INTERVAL` | `2` | tmux capture-pane 폴링 간격（초） |
| `BRIDGE_MAX_CONCURRENT` | `4` | 최대 동시 세션 수 |
| `DB_PATH` | `./data/bridge.db` | SQLite 파일 경로 |
| `JWT_SECRET` | — | **필수**, JWT 서명 비밀키 |
| `ADMIN_PASSWORD` | `admin` | 최초 seed 시 관리자 비밀번호 |
| `LOG_LEVEL` | `info` | 로그 레벨 |
| `LOG_DIR` | `./logs` | 로그 디렉토리 |

---

## ❓ 자주 묻는 질문

**Q: 飞书 메시지 전송 후 응답이 없나요?**
A: 우선 확인: ① 바인딩 상태가 `online`인지; ② 서버 tmux session이 살아있는지; ③ 서비스 제공자 API Key가 유효한지; ④ 「로그」메뉴에서 백엔드 로그를 실시간 확인.

**Q: 원격 머신 로그인 실패（Not logged in）?**
A: v1.0.8에서 수정됨 — 원격 rc 파일을 로드하기 위해 `bash -ilc`로 래핑된 tmux 시작 명령어를 사용하는지 확인. 여전히 문제가 있다면 원격 `~/.bashrc`에서 `claude` / `codex` 실행 파일을 찾을 수 있는지 확인.

**Q: SSH 장기 작업 중 연결 끊김?**
A: v1.0.10에서 수정됨 — 하트비트를 5분에서 30초로 단축하고, 60초 능동 유휴 연결 해제를 제거함.

**Q: tmux session이 없으면 어떻게 되나요?**
A: Bridge는 「바인딩 온라인」시 해당 session을 자동으로 생성합니다（예: `cc-xxx`, `codex-xxx`）, 수동 조작이 필요 없음.

**Q: Web Terminal 브라우저 창을 닫으면 비즈니스 프로세스가 종료되나요?**
A: **종료되지 않습니다**. Web Terminal은 tmux 클라이언트만 detach하며, 비즈니스 session은 계속 실행됩니다. 코드 레벨에 강제 방어 로직이 있음: `session-name`은 화이트리스트 정규식을 통과하며, 종료 경로에서 `tmux kill-session`을 절대 호출하지 않음.

---

## 🗂 버전 및 이터레이션

전체 이터레이션 로그는 [maintain.md](../../maintain.md)를 참조하세요.

최근 버전:
- **v1.1.7**（현재）—— 다국어 README 문서（10+ 개 언어）+ 연동 bacs-android 소개
- **v1.1.6** —— 시스템 타이틀 + 우측 상단 로그아웃 제거 + bacs_chat_time_line 실시간 Timeline
- **v1.1.5** —— 신뢰 기기 지문 리팩토링（듀얼 채널: deviceId + cookie token）
- **v1.1.4** —— BindingsView 듀얼 Tab + 리스트 페이지네이션 + Terminal 싱글톤 + 5분 유지
- **v1.1.3** —— 브라우저 내 Web Terminal（xterm + tmux）
- **v1.0.0** —— 전면 리팩토링（Vite + Vue 3 + Express + Drizzle + macOS 테마）

---

## 🌐 다국어 버전 / Language Versions

| 언어 | Language | 파일 |
|------|----------|------|
| 🇨🇳 简体中文 | Chinese (Simplified) | [README.zh.md](README.zh.md) |
| 🇺🇸 English | English | [README.en.md](README.en.md) |
| 🇯🇵 日本語 | Japanese | [README.ja.md](README.ja.md) |
| 🇷🇺 Русский | Russian | [README.ru.md](README.ru.md) |
| 🇩🇪 Deutsch | German | [README.de.md](README.de.md) |
| 🇫🇷 Français | French | [README.fr.md](README.fr.md) |
| 🇪🇸 Español | Spanish | [README.es.md](README.es.md) |
| 🇸🇦 العربية | Arabic (RTL) | [README.ar.md](README.ar.md) |
| 🇨🇳 བོད་སྐད་ | Tibetan | [README.bo.md](README.bo.md) |
| 🇨🇳 ئۇيغۇرچە | Uyghur (RTL) | [README.ug.md](README.ug.md) |
| 🇰🇷 한국어 | Korean | [README.ko.md](README.ko.md) |

---

## 📄 License

MIT © [LengendXing](https://github.com/LengendXing)
