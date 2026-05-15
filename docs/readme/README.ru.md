# Мост Feishu × AI CLI (feishu-claudecode-bridge)

> Превратите бота Feishu (Lark) в удалённый интерфейс для AI CLI-инструментов, таких как Claude Code / Codex. Больше не нужно подключаться к серверу по SSH и открывать терминал — достаточно упомянуть бота в Feishu, чтобы управлять одним или несколькими AI-процессами кодирования.

[🌐 Другие языки](#-версии-на-разных-языках) · [🤖 Android-приложение: bacs-android](#-android-приложение-bacs-android)

---

## 📖 Содержание

- [Введение](#-введение)
- [Основные возможности](#-основные-возможности)
- [Архитектура](#-архитектура)
- [Структура проекта](#-структура-проекта)
- [Быстрый старт](#-быстрый-старт)
- [Развёртывание](#-развёртывание)
- [Руководство пользователя](#-руководство-пользователя)
- [Android-приложение bacs-android](#-android-приложение-bacs-android)
- [Переменные окружения](#-переменные-окружения)
- [FAQ](#-faq)
- [История версий](#-история-версий)
- [Лицензия](#-лицензия)

---

## 🌟 Введение

**feishu-claudecode-bridge** — это система двусторонней связи между ботами Feishu (Lark) и AI CLI (Claude Code / Codex). Постоянно работающий Bridge Server маршрутизирует события сообщений Feishu к указанным CLI-процессам и отправляет их ответы обратно в соответствующий чат или группу Feishu.

Сценарии использования:
- Команда совместно ведёт задачи AI-кодирования из группы Feishu
- Удалённое управление Claude Code с телефона / планшета
- Изоляция нескольких AI-процессов на одном сервере, привязанных к разным чатам Feishu
- Наблюдение за прогрессом AI, логами и Timeline в реальном времени из браузера или Android-приложения

---

## ✨ Основные возможности

| Модуль | Возможности |
|--------|-------------|
| **Привязка нескольких процессов** | Одновременное управление несколькими CLI-процессами (cc-a / cc-b / codex-x ...) на одном сервере, каждый со своим ботом |
| **Управление удалёнными хостами** | Встроенный SSH Executor управляет tmux-сессиями на локальной + нескольких удалённых машинах |
| **Поддержка двух CLI** | Адаптеры Claude Code (`cc`) и Codex можно свободно комбинировать |
| **Конфигурация провайдеров** | Anthropic / OpenAI / пользовательский `base_url` + API-ключ |
| **Модели + Effort** | `cc` поддерживает `low~max`, `codex` — `minimal~xhigh`, обрезается по `maxEffort` модели |
| **Web-терминал** | xterm в браузере подключается прямо к tmux pane; закрытие вкладки НЕ убивает бизнес-процесс |
| **Живой Timeline** | SSE-пуш сообщений на главной странице с анимированными вставками |
| **TOTP 2FA** | Встроенная двухфакторная аутентификация с двухканальным доверием устройств (FingerprintJS + cookie token) |
| **Журналы аудита** | Все привязки, входы, терминальные сессии записываются в `audit_logs` |
| **UI в стиле macOS** | Tailwind + shadcn/ui в чёрно-бело-серой палитре с переключателем Light/Dark |
| **Однокоманднный PM2** | Включены `deploy.sh` + `ecosystem.config.cjs`, исходники и рантайм разделены |

---

## 🏗 Архитектура

```
┌────────────┐  @ бот + сообщение   ┌────────────────┐
│ Пользователь│ ────────────────────▶│  Feishu Cloud   │
│ (web/тел.) │ ◀───────────────────  │ (Open Platform) │
└────────────┘                       └────────┬───────┘
                                              │ Webhook / WS
                                              ▼
                              ┌─────────────────────────┐
                              │   Bridge Server         │
                              │ (Express + Vue + WS)    │
                              │                         │
                              │  ┌──────────────────┐   │
                              │  │ Channel layer    │   │   ← Feishu WS Client
                              │  │ Session router   │   │
                              │  │ CLI Adapter      │   │
                              │  │ Executor (SSH+L) │   │
                              │  └──────────────────┘   │
                              └────────┬────────────────┘
                                       │ tmux send-keys / capture-pane
                                       ▼
                              ┌─────────────────────────┐
                              │ Локальный / удалённый   │
                              │ ┌─────┐  ┌─────┐        │
                              │ │ cc  │  │codex│  ...   │
                              │ └─────┘  └─────┘        │
                              └─────────────────────────┘
```

Стек:
- **Frontend**: Vue 3 + Vite + TypeScript + Pinia + Tailwind + xterm.js
- **Backend**: Node.js 20+ + Express + ws + node-pty + ssh2
- **БД**: SQLite + Drizzle ORM
- **Управление процессами**: tmux + PM2

---

## 📁 Структура проекта

```
feishu-claudecode-bridge/
├── src/
│   ├── client/          # Vue 3 frontend
│   ├── server/          # Express backend
│   └── shared/          # Общие TypeScript-типы
├── scripts/             # migrate-db / seed-admin
├── data/                # SQLite (рантайм)
├── docs/                # readme/ + plans/
├── deploy.sh            # Скрипт развёртывания PM2
├── cll.sh               # Однострочный установщик
├── ecosystem.config.cjs
├── .env.example
└── package.json
```

---

## 🚀 Быстрый старт

### 1. Требования

- Node.js ≥ 20
- npm ≥ 10 (или pnpm)
- tmux ≥ 3.0
- Хотя бы один AI CLI: `claude` или `codex`
- Корпоративное приложение Feishu с правами `im:message`, `im:message.group_at_msg`

### 2. Локальная разработка

```bash
git clone https://github.com/LengendXing/feishu-claudecode-bridge.git
cd feishu-claudecode-bridge

npm install
cp .env.example .env       # заполните JWT_SECRET и т.д.

npm run db:migrate
npm run seed

npm run dev                # клиент + сервер параллельно
```

Откройте `http://localhost:3456/`, войдите как `nimasile` с `ADMIN_PASSWORD` из `.env`.

---

## 📦 Развёртывание

### Вариант A — Однострочная удалённая установка (рекомендуется)

На целевом сервере:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/feishu-claudecode-bridge/main/cll.sh)
```

С указанием директории:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/feishu-claudecode-bridge/main/cll.sh) /opt/feishu-bridge
```

Структура после установки:

```
feishu-claudecode-bridge/
├── sourceCode/   ← исходники (git pull для обновления)
└── deploy/       ← рантайм (PM2 стартует отсюда)
```

### Вариант B — Ручной PM2

```bash
git clone https://github.com/LengendXing/feishu-claudecode-bridge.git
cd feishu-claudecode-bridge
bash deploy.sh
```

### Вариант C — Регулярные обновления

```bash
cd sourceCode/
git pull
bash deploy.sh   # пересборка + перезагрузка PM2
```

### Чек-лист после первой установки

1. Отредактируйте `deploy/.env`: `JWT_SECRET`, `ADMIN_PASSWORD`
2. Откройте `http://<server-ip>:3456/`
3. Включите 2FA в **Настройках** (настоятельно рекомендуется)
4. **Машины**: локальная зарегистрирована; добавьте удалённые с SSH-данными
5. **Провайдеры**: Anthropic / OpenAI / пользовательский (base_url + API key)
6. На сервере: `tmux new-session -d -s cc-work`
7. **Привязки**: создайте новую → введите Feishu App ID / Secret / Verification Token / Encrypt Key + выберите CLI + провайдера + модель + effort
8. Упомяните бота в группе Feishu — процесс `cc` / `codex` стартует автоматически

---

## 📘 Руководство пользователя

### Настройка приложения Feishu

1. Перейдите на [open.feishu.cn](https://open.feishu.cn/) и создайте **корпоративное приложение**
2. Активируйте права:
   - `im:message`
   - `im:message:receive_v1`
   - `im:message.group_at_msg`
3. Подписка на события: рекомендуется **режим длинного соединения** (или Request URL `https://<host>/webhook/feishu`)
4. Скопируйте App ID / Secret / Verification Token / Encrypt Key в форму **Привязок** Bridge

### Создание привязки

**Привязки → Новая**:
- **Имя**: например `cc-projectA`
- **Машина**: локальная или зарегистрированная удалённая
- **CLI**: cc / codex
- **Провайдер**: один из настроенных
- **Модель**: автоматическое обнаружение; при сбое — выбор из дефолтов или ввод пользовательского ID
- **Effort**: на основе `maxEffort` модели
- **Учётные данные Feishu**: App ID / Secret / Verification Token / Encrypt Key

После сохранения Bridge открывает WS-соединение Feishu; когда статус становится `online`, можно @-упомянуть бота в чате.

### Web-терминал

Кнопка `Terminal` в строке привязки открывает xterm в браузере — эквивалент:

```bash
tmux attach -t cc-projectA
```

**Важная гарантия безопасности: закрытие вкладки терминала НЕ убивает tmux-сессию — бизнес-процесс продолжает работать.** Ctrl-b d для ручного detach; ResizeObserver синхронизирует размер окна; через 5 минут простоя WS закрывается (на бизнес-процесс не влияет).

### Живой Timeline

Внизу главной страницы — последние 20 сообщений Feishu (SSE), новые элементы влетают сверху, кликом разворачиваются/сворачиваются, теги платформ цветовые.

### Системные логи

Меню **Логи**: SSE-стриминг бэкенд-логов с реплеем при подключении и heartbeat.

### Тема

Иконка солнца/луны в правом верхнем углу переключает Light / Dark; палитра — чёрно-бело-серая.

---

## 📱 Android-приложение bacs-android

> Проект: [https://github.com/LengendXing/bacs-android](https://github.com/LengendXing/bacs-android)

**bacs-android** — официальный Android-клиент:

- 🔔 Получение Timeline-пушей в реальном времени — ответы AI приходят как IM-сообщения
- ⌨️ Отправка команд с телефона без открытия Feishu
- 📊 Мониторинг всех привязок (online / offline / awaiting_choice)
- 📜 Просмотр истории сессий и системных логов
- 🔐 TOTP 2FA с доверием устройств по отпечатку
- 🌙 Следует системной теме Light / Dark

**Подключение**: введите URL Bridge (например, `http://192.168.1.100:3456`) и отсканируйте QR-код со страницы **Настройки** Bridge для входа в одно касание (краткосрочный JWT → клиентский обмен на долгий токен, QR безвреден при утечке).

Полная документация Android: [bacs-android README](https://github.com/LengendXing/bacs-android#readme).

---

## 🔧 Переменные окружения

См. `.env.example`:

| Переменная | По умолчанию | Описание |
|-----------|--------------|----------|
| `BRIDGE_PORT` | `3456` | Порт HTTP / WS |
| `BRIDGE_HOST` | `0.0.0.0` | Адрес привязки |
| `BRIDGE_PROGRESS_INTERVAL` | `30` | Интервал обновления карточки прогресса (с) |
| `BRIDGE_TIMEOUT` | `600` | Макс. ожидание одного хода AI (с) |
| `BRIDGE_POLL_INTERVAL` | `2` | Интервал tmux capture-pane (с) |
| `BRIDGE_MAX_CONCURRENT` | `4` | Макс. одновременных сессий |
| `DB_PATH` | `./data/bridge.db` | Путь к SQLite |
| `JWT_SECRET` | — | **Обязательно** — секрет подписи JWT |
| `ADMIN_PASSWORD` | `admin` | Пароль администратора при первом seed |
| `LOG_LEVEL` | `info` | Уровень логирования |
| `LOG_DIR` | `./logs` | Каталог логов |

---

## ❓ FAQ

**В: Отправил сообщение в Feishu — бот молчит.**
О: Проверьте: ① статус привязки `online`; ② tmux-сессия жива; ③ API-ключ провайдера действителен; ④ откройте меню **Логи** для бэкенд-логов в реальном времени.

**В: Удалённая машина пишет "Not logged in".**
О: Исправлено в v1.0.8 — tmux-launcher обёрнут в `bash -ilc` для загрузки rc-файлов. Если всё равно случается, проверьте, что `claude` / `codex` в `$PATH` в удалённом `~/.bashrc`.

**В: SSH отваливается при долгих задачах.**
О: Исправлено в v1.0.10 — heartbeat снижен с 5min до 30s, 60-секундный idle-disconnect удалён.

**В: Что если tmux-сессия не существует?**
О: Bridge автоматически создаёт сессию (например, `cc-xxx` / `codex-xxx`) при выходе привязки в онлайн. Ручные действия не требуются.

**В: Убьёт ли закрытие вкладки Web-терминала бизнес-процесс?**
О: **Нет.** Терминал только отсоединяет tmux-клиент; сессия продолжает работать. На уровне кода есть жёсткая защита: имена сессий проходят через белый список регулярных выражений, путь закрытия никогда не вызывает `tmux kill-session`.

---

## 🗂 История версий

Полный changelog: [maintain.md](../../maintain.md).

Последние версии:
- **v1.1.7** (текущая) — Многоязычный README (10 языков) + документация bacs-android
- **v1.1.6** — Системный заголовок + удаление logout справа сверху + bacs_chat_time_line Timeline
- **v1.1.5** — Переписан отпечаток доверенного устройства (двухканальный)
- **v1.1.4** — Двух-табовый BindingsView + пагинация + Terminal singleton + 5-мин keep-alive
- **v1.1.3** — Браузерный Web-терминал (xterm + tmux)
- **v1.0.0** — Полная переработка

---

## 🌐 Версии на разных языках

| Язык | Файл |
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

## 📄 Лицензия

MIT © [LengendXing](https://github.com/LengendXing)
