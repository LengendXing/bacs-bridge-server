# 飞书 × AI CLI 桥接系统（bacs-bridge-server） 🇪🇸 Español

> Convierte el bot de Feishu en una puerta de interacción remota para Claude Code / Codex y otras AI CLI. Ya no necesitas hacer SSH al servidor para abrir una terminal — en Feishu, basta con @mencionar al bot para controlar directamente uno o más procesos de programación con IA.

[🌐 Versiones en otros idiomas](#-多语言版本--language-versions) · [🤖 App Android complementaria bacs-android](#-配套安卓端-bacs-android)

---

## 📖 Índice

- [Introducción del proyecto](#-项目简介)
- [Características principales](#-核心特性)
- [Arquitectura del sistema](#-系统架构)
- [Estructura del proyecto](#-项目结构)
- [Inicio rápido](#-快速开始)
- [Guía de despliegue](#-部署指南)
- [Documentación de uso](#-使用文档)
- [App Android complementaria bacs-android](#-配套安卓端-bacs-android)
- [Variables de entorno](#-环境变量)
- [Preguntas frecuentes](#-常见问题)
- [Versiones e iteraciones](#-版本与迭代)
- [Licencia](#-license)

---

## 🌟 Introducción del proyecto

**bacs-bridge-server** es un sistema que realiza un puente bidireccional entre el bot de Feishu y las herramientas AI CLI (Claude Code / Codex). A través de un Bridge Server permanente, enruta los eventos de mensajes de Feishu hacia el proceso CLI designado, y luego envía las respuestas del CLI de vuelta al grupo o chat privado de Feishu.

Escenarios de uso:
- Colaboración en equipo a través de grupos de Feishu para dirigir tareas de programación con IA
- Control remoto de Claude Code en el servidor desde dispositivos sin PC (móvil, tablet)
- Vincular múltiples procesos de IA en un mismo servidor a diferentes grupos de Feishu para aislar proyectos
- Observar en tiempo real el progreso del procesamiento de IA, registros y línea de tiempo de conversaciones desde el navegador o la app Android

---

## ✨ Características principales

| Módulo | Capacidad |
|--------|-----------|
| **Vinculación de múltiples máquinas** | Permite gestionar simultáneamente múltiples procesos CLI en un mismo servidor (cc-a / cc-b / codex-x ...), cada uno vinculado de forma independiente a un bot de Feishu |
| **Gestión de máquinas remotas** | SSH Executor integrado, permite gestionar de forma unificada sesiones tmux de la máquina local + múltiples máquinas remotas |
| **Soporte dual de CLI** | Adaptadores para Claude Code (cc) y Codex, se pueden usar simultáneamente |
| **Configuración flexible de proveedores** | Configuraciones integradas para Anthropic / OpenAI y otros proveedores, soporta base_url y API Key personalizados |
| **Múltiples modelos + Effort** | cc soporta low~max, codex soporta minimal~xhigh, truncado automáticamente según maxEffort del modelo |
| **Web Terminal** | xterm en el navegador conectado directamente al panel de tmux, lo que ves es lo que hay, cerrar la ventana no mata el proceso de negocio |
| **Timeline en tiempo real** | La página principal muestra SSE en tiempo real de todos los mensajes IA ↔ usuario, animaciones TransitionGroup |
| **Autenticación de dos factores TOTP** | 2FA integrado, soporta huella digital de dispositivo de confianza (FingerprintJS) + Cookie Token de doble canal |
| **Registros de auditoría** | Todas las operaciones sensibles (vinculación, inicio de sesión, acceso a Terminal) se registran en audit_logs |
| **Tema estilo macOS** | Tailwind + shadcn/ui en tonos blanco/negro/gris, soporta cambio Light/Dark |
| **Despliegue con PM2 en un clic** | Incluye `deploy.sh` + `ecosystem.config.cjs`, separación de código fuente y tiempo de ejecución |

---

## 🏗 Arquitectura del sistema

```
┌────────────┐   @ bot + mensaje     ┌────────────────┐
│  Usuario    │ ───────────────────▶ │  Feishu Open    │
│ (Feishu/móvil)│ ◀───────────────── │ (Open Feishu)   │
└────────────┘                      └────────┬───────┘
                                              │ Webhook / WS
                                              ▼
                              ┌─────────────────────────┐
                              │   Bridge Server         │
                              │ (Express + Vue + WS)    │
                              │                         │
                              │  ┌──────────────────┐   │
                              │  │ Abstracción Channel│  │   ← Feishu WS Client
                              │  │ Enrutamiento Session│ │
                              │  │ CLI Adapter        │   │
                              │  │ Executor (local+SSH)│  │
                              │  └──────────────────┘   │
                              └────────┬────────────────┘
                                       │ tmux send-keys / capture-pane
                                       ▼
                              ┌─────────────────────────┐
                              │  Máquina local o remota │
                              │  ┌─────┐  ┌─────┐      │
                              │  │ cc  │  │codex│  ... │
                              │  └─────┘  └─────┘      │
                              └─────────────────────────┘
```

Stack tecnológico:
- **Frontend**: Vue 3 + Vite + TypeScript + Pinia + Tailwind + xterm.js
- **Backend**: Node.js 20+ + Express + ws + node-pty + ssh2
- **Base de datos**: SQLite + Drizzle ORM
- **Gestión de procesos**: tmux + PM2

---

## 📁 Estructura del proyecto

```
bacs-bridge-server/
├── src/
│   ├── client/               # Frontend Vue 3
│   │   ├── views/            # 9 páginas principales (Home/Bindings/Machines/Providers/Terminal/Logs/Settings/Login/Layout)
│   │   ├── components/       # Componentes comunes (Pagination/TerminalPanel ...)
│   │   ├── composables/      # useAuth / useDeviceId / useTerminalSession
│   │   └── router/           # vue-router
│   ├── server/               # Backend Express
│   │   ├── routes/           # auth/bindings/machines/providers/sessions/logs/timeline/settings/models/health
│   │   ├── channel/          # Feishu WS Channel + interfaz abstracta
│   │   ├── cli/              # Adaptadores CC / Codex
│   │   ├── executor/         # Ejecutor local + SSH
│   │   ├── terminal/         # pty-bridge + ws-server (Web Terminal)
│   │   ├── auth/             # JWT + TOTP + huella digital de dispositivo de confianza
│   │   ├── db/               # Esquema Drizzle + archivos de migración
│   │   └── session/          # Máquina de estados de sesión (idle / working / awaiting_choice)
│   └── shared/               # Tipos compartidos frontend/backend
├── scripts/                  # migrate-db / seed-admin / migrate-bindings
├── data/                     # Base de datos SQLite (generada en tiempo de ejecución)
├── docs/                     # Documentación (incluye readme/, plans/)
├── deploy.sh                 # Script de despliegue PM2 en un clic
├── cll.sh                    # Script de instalación remota en un clic
├── ecosystem.config.cjs      # Configuración PM2
├── .env.example
└── package.json
```

---

## 🚀 Inicio rápido

### 1. Requisitos del entorno

- Node.js ≥ 20
- npm ≥ 10 (o pnpm)
- tmux ≥ 3.0 (gestión de procesos CLI)
- Al menos una AI CLI ejecutable: `claude` (Claude Code) o `codex`
- Una aplicación empresarial propia de Feishu (necesita activar `im:message`, `im:message.group_at_msg`)

### 2. Inicio local

```bash
# Clonar
git clone https://github.com/LengendXing/bacs-bridge-server.git
cd bacs-bridge-server

# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env
# Editar .env, rellenar JWT_SECRET etc.

# Inicializar base de datos + cuenta seed
npm run db:migrate
npm run seed

# Modo desarrollo (frontend y backend en paralelo)
npm run dev
```

Accede a `http://localhost:3456/`, inicia sesión con la cuenta por defecto `nimasile` / el `ADMIN_PASSWORD` configurado en `.env`.

---

## 📦 Guía de despliegue

### Método 1: Despliegue remoto en un clic (recomendado)

Ejecutar en el servidor de destino:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/bacs-bridge-server/main/cll.sh)
```

Especificar directorio de instalación:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/bacs-bridge-server/main/cll.sh) /opt/bacs-bridge
```

Estructura de directorios tras el despliegue:

```
bacs-bridge-server/
├── sourceCode/   ← Código fuente (actualizar con git pull)
└── deploy/       ← Tiempo de ejecución (PM2 se inicia desde aquí)
```

### Método 2: Despliegue manual con PM2

```bash
git clone https://github.com/LengendXing/bacs-bridge-server.git
cd bacs-bridge-server
bash deploy.sh
```

`deploy.sh` realizará:
1. `npm ci` para instalar dependencias
2. `npm run build` para construir frontend y backend
3. Copiar `dist/`, `scripts/`, `package.json` etc. a `../deploy/`
4. En `../deploy/` ejecutar `pm2 start ecosystem.config.cjs`

### Método 3: Flujo de actualización habitual

```bash
cd sourceCode/
git pull
bash deploy.sh   # Construcción automática + reinicio PM2
```

### Pasos obligatorios tras el primer despliegue

1. Editar `deploy/.env`, rellenar `JWT_SECRET`, `ADMIN_PASSWORD`
2. Acceder desde el navegador a `http://<IP-del-servidor>:3456/`
3. Tras iniciar sesión con la cuenta por defecto, ir a «Configuración» y activar 2FA (muy recomendado)
4. Menú «Máquinas»: la máquina local ya está lista por defecto; si necesitas máquinas remotas, créalas y rellena las credenciales SSH
5. Menú «Proveedores»: crear proveedor Anthropic / OpenAI / personalizado, rellenar base_url + API Key
6. En el servidor, iniciar sesión tmux: `tmux new-session -d -s cc-work`
7. Menú «Vinculaciones»: añadir vinculación de bot de Feishu, rellenar App ID / App Secret / Verification Token / Encrypt Key + seleccionar CLI + proveedor + modelo + Effort
8. En el grupo de Feishu, @mencionar al bot y enviar cualquier mensaje → el backend iniciará automáticamente el proceso cc/codex y realizará el puente

---

## 📘 Documentación de uso

### Configuración de la aplicación Feishu

1. Ir a [Feishu Open Platform](https://open.feishu.cn/), crear una **aplicación empresarial propia**
2. Activar permisos:
   - `im:message` (enviar mensajes)
   - `im:message:receive_v1` (recibir mensajes)
   - `im:message.group_at_msg` (recibir @menciones en grupo)
3. Suscripción a eventos: activar **modo de conexión larga** (recomendado) o configurar Request URL `https://<host>/webhook/feishu`
4. Copiar App ID / App Secret / Verification Token / Encrypt Key → pegar en la configuración de «Vinculaciones» del Bridge

### Crear una vinculación

Ir al menú «Vinculaciones» → añadir nueva:
- **Nombre de vinculación**: personalizado (ej. `cc-projectA`)
- **Máquina (host)**: seleccionar la máquina local o una máquina remota previamente creada
- **Tipo de CLI**: cc / codex
- **Proveedor**: seleccionar un proveedor ya creado
- **Modelo**: se detecta automáticamente desde el proveedor; si la detección falla, se puede seleccionar manualmente un modelo por defecto o introducir un ID de modelo personalizado
- **Effort**: muestra los niveles disponibles según el maxEffort del modelo
- **Cuatro datos de la aplicación Feishu**: App ID / Secret / Verification Token / Encrypt Key

Tras guardar, el Bridge intentará conectarse automáticamente a la conexión larga WS de Feishu; cuando el estado cambie a `online`, ya podrás @mencionar al bot en el grupo de Feishu.

### Web Terminal

En la lista de «Vinculaciones», haz clic en el botón `Terminal` para abrir xterm directamente en el navegador, equivalente a ejecutar localmente:

```bash
tmux attach -t cc-projectA
```

**Restricción de seguridad clave: cerrar la pestaña del Terminal en el navegador no eliminará la sesión de tmux, el proceso de negocio sigue ejecutándose**.

Soporta Ctrl-b d para detach manual, ResizeObserver sincroniza el tamaño de la ventana, y tras 5 minutos sin operación se desconecta automáticamente el WebSocket (el proceso de negocio no se ve afectado).

### Timeline en tiempo real

La zona de Timeline en la parte inferior de la página principal muestra los últimos 20 mensajes de Feishu (SSE en tiempo real), las nuevas entradas se deslizan desde arriba con animación scale+fade, haz clic para expandir/colapsar el contenido completo, las etiquetas de plataforma se distinguen por colores (Feishu verde / Telegram azul reservado).

### Registros del sistema

Menú «Registros»: desplazamiento en tiempo real de los registros de ejecución del backend vía SSE (soporta reproducción de las últimas N líneas + heartbeat para mantener conexión).

### Cambio de tema

Icono de sol/luna en la esquina superior derecha para alternar entre los modos Light / Dark, la paleta de colores es en tonos blanco/negro/gris.

---

## 📱 App Android complementaria bacs-android

> Repositorio del proyecto: [https://github.com/LengendXing/bacs-android](https://github.com/LengendXing/bacs-android)

**bacs-android** es la app Android oficial complementaria de este sistema, que te permite desde el móvil:

- 🔔 Recibir en tiempo real las notificaciones del Timeline del Bridge, las respuestas de la IA llegan como mensajes de chat
- ⌨️ Introducir comandos directamente desde el móvil y enviarlos de vuelta al Bridge, sin necesidad de abrir Feishu
- 📊 Ver el estado de todos los procesos CLI vinculados (online / offline / awaiting_choice)
- 📜 Consultar historial de sesiones y registros del sistema
- 🔐 Inicio de sesión con doble factor TOTP + confianza por huella digital del dispositivo
- 🌙 Tema Light / Dark siguiendo el sistema

**Método de conexión**: Al iniciar la app, introduce la dirección del Bridge Server (ej. `http://192.168.1.100:3456`), escanea el código QR de inicio rápido desde la página de configuración para completar el inicio de sesión en un clic (JWT temporal de 60s → el cliente intercambia por un token de larga duración, evitando filtraciones del código QR).

Para la documentación completa del **proyecto Android**, consulta el [README de bacs-android](https://github.com/LengendXing/bacs-android#readme).

---

## 🔧 Variables de entorno

`.env` (ver `.env.example`):

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `BRIDGE_PORT` | `3456` | Puerto de escucha HTTP / WS |
| `BRIDGE_HOST` | `0.0.0.0` | Dirección de escucha |
| `BRIDGE_PROGRESS_INTERVAL` | `30` | Intervalo de actualización de tarjetas de progreso (segundos) |
| `BRIDGE_TIMEOUT` | `600` | Timeout de espera de IA por sesión (segundos) |
| `BRIDGE_POLL_INTERVAL` | `2` | Intervalo de sondeo tmux capture-pane (segundos) |
| `BRIDGE_MAX_CONCURRENT` | `4` | Número máximo de sesiones concurrentes |
| `DB_PATH` | `./data/bridge.db` | Ruta del archivo SQLite |
| `JWT_SECRET` | — | **Obligatorio**, clave de firma JWT |
| `ADMIN_PASSWORD` | `admin` | Contraseña del administrador en el primer seed |
| `LOG_LEVEL` | `info` | Nivel de registro |
| `LOG_DIR` | `./logs` | Directorio de registros |

---

## ❓ Preguntas frecuentes

**P: No hay respuesta tras enviar un mensaje en Feishu?**
R: Verifica primero: ① el estado de la vinculación es `online`; ② la sesión tmux del servidor está activa; ③ la API Key del proveedor es válida; ④ consulta los registros del backend en tiempo real desde el menú «Registros».

**P: Fallo de inicio de sesión en máquina remota (Not logged in)?**
R: Corregido en v1.0.8 — asegúrate de usar el comando de inicio de tmux envuelto con `bash -ilc` para cargar los archivos rc remotos. Si el problema persiste, verifica si en el `~/.bashrc` remoto se puede encontrar el ejecutable `claude` / `codex`.

**P: Pérdida de conexión SSH durante tareas largas?**
R: Corregido en v1.0.10 — heartbeat cambiado de 5min a 30s, y se eliminó la desconexión proactiva por inactividad de 60s.

**P: Qué hacer si la sesión tmux no existe?**
R: El Bridge crea automáticamente la sesión correspondiente cuando la «vinculación se conecta» (ej. `cc-xxx`, `codex-xxx`), no requiere operación manual.

**P: Cerrar la ventana del navegador de Web Terminal elimina el proceso de negocio?**
R: **No**. Web Terminal solo hace detach del cliente de tmux, la sesión de negocio sigue ejecutándose. A nivel de código hay una defensa forzada: `session-name` pasa por una lista blanca con regex, la ruta de cierre nunca invoca `tmux kill-session`.

---

## 🗂 Versiones e iteraciones

El registro completo de iteraciones está en [maintain.md](../maintain.md).

Versiones recientes:
- **v1.1.7** (actual) — README multilingüe (10+ idiomas) + presentación de bacs-android complementario
- **v1.1.6** — Título del sistema + eliminación de logout en esquina superior derecha + bacs_chat_time_line Timeline en tiempo real
- **v1.1.5** — Refactorización de huella digital de dispositivo de confianza (doble canal: deviceId + cookie token)
- **v1.1.4** — BindingsView doble Tab + paginación de listas + Terminal singleton + keep-alive de 5min
- **v1.1.3** — Web Terminal en navegador (xterm + tmux)
- **v1.0.0** — Refactorización completa (Vite + Vue 3 + Express + Drizzle + tema macOS)

---

## 🌐 多语言版本 / Language Versions

| 语言 | Language | 文件 |
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
