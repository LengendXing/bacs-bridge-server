# Feishu × AI CLI Bridge (bacs-bridge-server)

> Verwandelt den Feishu (Lark)-Bot in eine Remote-Schnittstelle für AI-CLI-Tools wie Claude Code / Codex. Kein SSH und kein Terminal-Öffnen mehr — einfach den Bot in Feishu erwähnen und einen oder mehrere AI-Coding-Prozesse steuern.

[🌐 Weitere Sprachen](#-sprachversionen) · [🤖 Android-App: bacs-android](#-android-app-bacs-android)

---

## 📖 Inhaltsverzeichnis

- [Einführung](#-einführung)
- [Hauptfunktionen](#-hauptfunktionen)
- [Architektur](#-architektur)
- [Projektstruktur](#-projektstruktur)
- [Schnellstart](#-schnellstart)
- [Deployment](#-deployment)
- [Benutzerhandbuch](#-benutzerhandbuch)
- [Android-App bacs-android](#-android-app-bacs-android)
- [Umgebungsvariablen](#-umgebungsvariablen)
- [FAQ](#-faq)
- [Versionshistorie](#-versionshistorie)
- [Lizenz](#-lizenz)

---

## 🌟 Einführung

**bacs-bridge-server** ist eine bidirektionale Brücke zwischen Feishu (Lark)-Bots und AI-CLI-Tools (Claude Code / Codex). Ein dauerhaft laufender Bridge Server leitet Feishu-Nachrichten an bestimmte CLI-Prozesse weiter und sendet deren Antworten zurück in den entsprechenden Feishu-Chat.

Anwendungsfälle:
- Ein Team treibt AI-Coding-Aufgaben gemeinsam aus einer Feishu-Gruppe voran
- Remote-Steuerung von Claude Code vom Handy / Tablet aus
- Isolation mehrerer AI-Prozesse auf einem Server, jeweils mit eigenem Feishu-Chat verbunden
- Live-Beobachtung von AI-Fortschritt, Logs und Timeline aus Browser oder Android-App

---

## ✨ Hauptfunktionen

| Modul | Fähigkeit |
|-------|-----------|
| **Multi-Prozess-Binding** | Mehrere CLI-Prozesse (cc-a / cc-b / codex-x ...) gleichzeitig auf einem Server, jeder an seinen eigenen Feishu-Bot gebunden |
| **Remote-Host-Verwaltung** | Eingebauter SSH-Executor verwaltet tmux-Sessions auf lokalem + mehreren Remote-Rechnern |
| **Duale CLI-Unterstützung** | Claude Code (`cc`)- und Codex-Adapter beliebig kombinierbar |
| **Provider-Konfiguration** | Anthropic / OpenAI / benutzerdefinierte `base_url` + API-Key |
| **Modelle + Effort** | `cc` unterstützt `low~max`, `codex` `minimal~xhigh`, automatisch durch `maxEffort` des Modells begrenzt |
| **Web-Terminal** | xterm im Browser direkt am tmux-Pane; Schließen des Tabs tötet den Geschäftsprozess NICHT |
| **Live-Timeline** | SSE-Push aller Nachrichten auf der Startseite mit animierten Einblendungen |
| **TOTP 2FA** | Eingebaute Zwei-Faktor-Auth mit Dual-Channel-Trusted-Device (FingerprintJS + Cookie-Token) |
| **Audit-Logs** | Bindings, Logins, Terminal-Sessions in `audit_logs` |
| **macOS-Look** | Tailwind + shadcn/ui in Schwarz/Weiß/Grau mit Light/Dark-Umschalter |
| **PM2-One-Click** | Mitgeliefertes `deploy.sh` + `ecosystem.config.cjs`, Source/Runtime getrennt |

---

## 🏗 Architektur

```
┌────────────┐  @ Bot + Nachricht   ┌────────────────┐
│  Benutzer  │ ────────────────────▶│  Feishu Cloud   │
│ (Web/Phone)│ ◀───────────────────  │ (Open Platform) │
└────────────┘                       └────────┬───────┘
                                              │ Webhook / WS
                                              ▼
                              ┌─────────────────────────┐
                              │   Bridge Server         │
                              │ (Express + Vue + WS)    │
                              │                         │
                              │  ┌──────────────────┐   │
                              │  │ Channel-Layer    │   │   ← Feishu WS Client
                              │  │ Session-Router   │   │
                              │  │ CLI-Adapter      │   │
                              │  │ Executor (SSH+L) │   │
                              │  └──────────────────┘   │
                              └────────┬────────────────┘
                                       │ tmux send-keys / capture-pane
                                       ▼
                              ┌─────────────────────────┐
                              │ Lokaler / Remote-Host   │
                              │ ┌─────┐  ┌─────┐        │
                              │ │ cc  │  │codex│  ...   │
                              │ └─────┘  └─────┘        │
                              └─────────────────────────┘
```

Stack:
- **Frontend**: Vue 3 + Vite + TypeScript + Pinia + Tailwind + xterm.js
- **Backend**: Node.js 20+ + Express + ws + node-pty + ssh2
- **Datenbank**: SQLite + Drizzle ORM
- **Prozess-Supervision**: tmux + PM2

---

## 📁 Projektstruktur

```
bacs-bridge-server/
├── src/
│   ├── client/          # Vue 3 Frontend
│   ├── server/          # Express Backend
│   └── shared/          # Gemeinsame TypeScript-Typen
├── scripts/             # migrate-db / seed-admin
├── data/                # SQLite (Runtime)
├── docs/                # readme/ + plans/
├── deploy.sh            # PM2-Deployment-Script
├── cll.sh               # Remote-One-Line-Installer
├── ecosystem.config.cjs
├── .env.example
└── package.json
```

---

## 🚀 Schnellstart

### 1. Voraussetzungen

- Node.js ≥ 20
- npm ≥ 10 (oder pnpm)
- tmux ≥ 3.0
- Mindestens eine AI-CLI: `claude` oder `codex`
- Feishu **Custom Enterprise App** mit Berechtigungen `im:message`, `im:message.group_at_msg`

### 2. Lokale Entwicklung

```bash
git clone https://github.com/LengendXing/bacs-bridge-server.git
cd bacs-bridge-server

npm install
cp .env.example .env       # JWT_SECRET etc. eintragen

npm run db:migrate
npm run seed

npm run dev                # Client + Server parallel
```

Öffne `http://localhost:3456/`, melde dich als `nimasile` mit dem `ADMIN_PASSWORD` aus `.env` an.

---

## 📦 Deployment

### Variante A — One-Line Remote-Install (empfohlen)

Auf dem Zielserver:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/bacs-bridge-server/main/cll.sh)
```

Mit Verzeichnisangabe:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/bacs-bridge-server/main/cll.sh) /opt/bacs-bridge
```

Struktur nach der Installation:

```
bacs-bridge-server/
├── sourceCode/   ← Source (git pull zum Aktualisieren)
└── deploy/       ← Runtime (PM2 startet hier)
```

### Variante B — Manuelles PM2

```bash
git clone https://github.com/LengendXing/bacs-bridge-server.git
cd bacs-bridge-server
bash deploy.sh
```

### Variante C — Routine-Updates

```bash
cd sourceCode/
git pull
bash deploy.sh   # Rebuild + PM2-Reload
```

### Checkliste nach der ersten Installation

1. `deploy/.env` editieren: `JWT_SECRET`, `ADMIN_PASSWORD`
2. `http://<server-ip>:3456/` öffnen
3. 2FA in den **Einstellungen** aktivieren (dringend empfohlen)
4. **Maschinen**: Lokaler Host ist registriert; Remote-Hosts mit SSH-Credentials hinzufügen
5. **Provider**: Anthropic / OpenAI / Custom anlegen (base_url + API-Key)
6. Auf dem Server: `tmux new-session -d -s cc-work`
7. **Bindings**: Neu → Feishu App ID / Secret / Verification Token / Encrypt Key + CLI + Provider + Modell + Effort
8. Bot in Feishu-Gruppe erwähnen — `cc` / `codex`-Prozess startet automatisch

---

## 📘 Benutzerhandbuch

### Feishu-App-Konfiguration

1. Auf [open.feishu.cn](https://open.feishu.cn/) eine **Custom Enterprise App** erstellen
2. Berechtigungen aktivieren:
   - `im:message`
   - `im:message:receive_v1`
   - `im:message.group_at_msg`
3. Event-Subscription: **Long-Connection-Modus** bevorzugt (oder Request-URL `https://<host>/webhook/feishu`)
4. App ID / Secret / Verification Token / Encrypt Key in das **Bindings**-Formular kopieren

### Binding erstellen

**Bindings → Neu**:
- **Name**: z.B. `cc-projectA`
- **Maschine**: lokal oder registrierte Remote
- **CLI**: cc / codex
- **Provider**: einer der konfigurierten
- **Modell**: automatische Erkennung; bei Fehler aus Defaults wählen oder Custom-ID eingeben
- **Effort**: auf Basis des `maxEffort` des Modells
- **Feishu-Credentials**: App ID / Secret / Verification Token / Encrypt Key

Nach dem Speichern öffnet Bridge die Feishu-WS-Verbindung; sobald Status `online`, kann der Bot per @-Mention im Chat verwendet werden.

### Web-Terminal

Button `Terminal` in der Binding-Zeile öffnet xterm im Browser — entspricht:

```bash
tmux attach -t cc-projectA
```

**Wichtige Sicherheitszusage: Schließen des Terminal-Tabs tötet die tmux-Session NICHT — der Geschäftsprozess läuft weiter.** Ctrl-b d zum manuellen Detach; ResizeObserver synchronisiert die Fenstergröße; nach 5 Minuten Idle wird WS geschlossen (Geschäftsprozess nicht betroffen).

### Live-Timeline

Unten auf der Startseite werden die letzten 20 Feishu-Nachrichten per SSE gepusht, neue Einträge gleiten von oben ein, Klick zum Auf-/Zuklappen, Plattform-Tags farblich.

### System-Logs

Menü **Logs**: SSE-gestreamte Backend-Logs live mit Replay beim Verbinden und Heartbeat.

### Theme

Sonne/Mond oben rechts schaltet Light / Dark; Palette ist Schwarz/Weiß/Grau.

---

## 📱 Android-App bacs-android

> Projekt: [https://github.com/LengendXing/bacs-android](https://github.com/LengendXing/bacs-android)

**bacs-android** ist der offizielle Android-Client:

- 🔔 Live-Empfang von Timeline-Pushes — AI-Antworten kommen wie IM-Nachrichten
- ⌨️ Befehle vom Handy senden, ohne Feishu zu öffnen
- 📊 Status aller Bindings überwachen (online / offline / awaiting_choice)
- 📜 Verlauf der Sessions und System-Logs einsehen
- 🔐 TOTP 2FA mit Device-Fingerprint-Trust
- 🌙 Folgt dem Light/Dark-Systemmodus

**Verbindung**: Bridge-URL eingeben (z.B. `http://192.168.1.100:3456`) und QR-Code aus den **Einstellungen** der Bridge scannen für One-Tap-Login (kurzlebiges JWT → Client-seitiger Tausch gegen Long-Token, daher harmlos bei QR-Leak).

Vollständige Android-Dokumentation: [bacs-android README](https://github.com/LengendXing/bacs-android#readme).

---

## 🔧 Umgebungsvariablen

Siehe `.env.example`:

| Variable | Default | Beschreibung |
|----------|---------|--------------|
| `BRIDGE_PORT` | `3456` | HTTP/WS-Port |
| `BRIDGE_HOST` | `0.0.0.0` | Bind-Adresse |
| `BRIDGE_PROGRESS_INTERVAL` | `30` | Refresh-Intervall der Progress-Karte (s) |
| `BRIDGE_TIMEOUT` | `600` | Max. Wartezeit pro AI-Turn (s) |
| `BRIDGE_POLL_INTERVAL` | `2` | tmux capture-pane-Poll-Intervall (s) |
| `BRIDGE_MAX_CONCURRENT` | `4` | Max. parallele Sessions |
| `DB_PATH` | `./data/bridge.db` | SQLite-Pfad |
| `JWT_SECRET` | — | **Pflicht** — JWT-Signatur |
| `ADMIN_PASSWORD` | `admin` | Admin-Passwort beim ersten Seed |
| `LOG_LEVEL` | `info` | Log-Level |
| `LOG_DIR` | `./logs` | Log-Verzeichnis |

---

## ❓ FAQ

**F: Nachricht in Feishu gesendet — Bot schweigt.**
A: Prüfen: ① Binding-Status `online`; ② tmux-Session lebt; ③ Provider-API-Key gültig; ④ Menü **Logs** für Backend-Live-Logs.

**F: Remote-Maschine meldet "Not logged in".**
A: In v1.0.8 behoben — tmux-Launcher in `bash -ilc` gekapselt, damit Remote-rc-Dateien geladen werden. Falls weiterhin: `claude` / `codex` muss im `$PATH` der Remote-`~/.bashrc` sein.

**F: SSH bricht bei Langläufen ab.**
A: In v1.0.10 behoben — Heartbeat von 5min auf 30s, 60s-Idle-Disconnect entfernt.

**F: Was, wenn die tmux-Session nicht existiert?**
A: Bridge erstellt sie automatisch (z.B. `cc-xxx` / `codex-xxx`) beim Online-Gehen des Bindings.

**F: Tötet das Schließen des Web-Terminal-Tabs den Geschäftsprozess?**
A: **Nein.** Das Terminal detacht nur den tmux-Client; die Session läuft weiter. Code-seitig harter Guard: Session-Namen via Whitelist-Regex; der Close-Pfad ruft niemals `tmux kill-session`.

---

## 🗂 Versionshistorie

Vollständiges Changelog: [maintain.md](../../maintain.md).

Aktuelle Versionen:
- **v1.1.7** (aktuell) — Mehrsprachiges README (10 Sprachen) + bacs-android-Doku
- **v1.1.6** — System-Titel + Logout oben rechts entfernt + bacs_chat_time_line Timeline
- **v1.1.5** — Trusted-Device-Fingerprint Rewrite (Dual-Channel)
- **v1.1.4** — BindingsView Dual-Tab + Pagination + Terminal-Singleton + 5-min Keep-Alive
- **v1.1.3** — Browser-Web-Terminal (xterm + tmux)
- **v1.0.0** — Vollständige Neugestaltung

---

## 🌐 Sprachversionen

| Sprache | Datei |
|---------|-------|
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

## 📄 Lizenz

MIT © [LengendXing](https://github.com/LengendXing)
