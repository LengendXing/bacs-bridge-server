# 🇫🇷 飞书 × AI CLI 桥接系统（feishu-claudecode-bridge）

> Transformez votre bot Feishu en portail d'interaction distant pour Claude Code / Codex et autres CLI IA. Plus besoin de se connecter en SSH au serveur pour ouvrir un terminal — il suffit d'@ le bot dans Feishu pour piloter directement un ou plusieurs processus de programmation IA.

[🌐 Versions multilingues](#-多语言版本--language-versions) · [🤖 Application Android bacs-android](#-配套安卓端-bacs-android)

---

## 📖 Sommaire

- [Présentation du projet](#-项目简介)
- [Fonctionnalités clés](#-核心特性)
- [Architecture système](#-系统架构)
- [Structure du projet](#-项目结构)
- [Démarrage rapide](#-快速开始)
- [Guide de déploiement](#-部署指南)
- [Documentation d'utilisation](#-使用文档)
- [Application Android bacs-android](#-配套安卓端-bacs-android)
- [Variables d'environnement](#-环境变量)
- [Questions fréquentes](#-常见问题)
- [Versions et itérations](#-版本与迭代)
- [License](#-license)

---

## 🌟 Présentation du projet

**feishu-claudecode-bridge** est un système de pont bidirectionnel entre un bot Feishu et des outils CLI IA (Claude Code / Codex). Il achemine les événements de messages Feishu vers un processus CLI désigné via un Bridge Server persistant, puis renvoie les réponses du CLI au groupe Feishu ou à la conversation privée Feishu.

Cas d'usage :
- Pilotage collaboratif de tâches de programmation IA via un groupe Feishu en équipe
- Contrôle à distance de Claude Code sur un serveur depuis un appareil mobile ou une tablette, sans PC
- Association de plusieurs processus IA sur un même serveur à différents groupes Feishu pour l'isolation des projets
- Observation en temps réel de la progression IA, des journaux et de la Timeline des conversations via le navigateur ou l'application Android

---

## ✨ Fonctionnalités clés

| Module | Capacité |
|--------|----------|
| **Multi-machines** | Gestion simultanée de plusieurs processus CLI sur un même serveur (cc-a / cc-b / codex-x ...), chacun lié de manière indépendante à un bot Feishu |
| **Gestion des machines distantes** | SSH Executor intégré pour gérer uniformément les sessions tmux de la machine locale et de plusieurs machines distantes |
| **Double CLI** | Adaptateurs pour Claude Code (cc) et Codex, utilisables simultanément |
| **Configuration flexible des fournisseurs** | Configurations intégrées pour Anthropic / OpenAI etc., support de base_url et API Key personnalisés |
| **Multi-modèles + Effort** | cc supporte low~max, codex supporte minimal~xhigh, troncature automatique selon le maxEffort du modèle |
| **Web Terminal** | Terminal xterm dans le navigateur connecté directement au pane tmux, tel quel — fermer la fenêtre ne tue pas le processus métier |
| **Timeline en temps réel** | Zone Timeline sur la page d'accueil avec SSE pour toutes les messages IA ↔ utilisateur, animation TransitionGroup |
| **Authentification TOTP à deux facteurs** | 2FA intégrée, support de l'empreinte digitale de confiance (FingerprintJS) + Cookie Token en double canal |
| **Journaux d'audit** | Toutes les opérations sensibles (liaison, connexion, accès Terminal) sont consignées dans audit_logs |
| **Thème style macOS** | Thème noir/blanc/gris avec Tailwind + shadcn/ui, basculement Light/Dark |
| **Déploiement PM2 en un clic** | `deploy.sh` + `ecosystem.config.cjs` intégrés, séparation du code source et du runtime |

---

## 🏗 Architecture système

```
┌────────────┐   @ bot + message    ┌────────────────┐
│  Utilisateur│ ───────────────────▶│  Plateforme     │
│ (Feishu/mobile) │ ◀───────────────── │ Feishu Ouverte │
└────────────┘                     └────────┬───────┘
                                            │ Webhook / WS
                                            ▼
                              ┌─────────────────────────┐
                              │   Bridge Server         │
                              │ (Express + Vue + WS)    │
                              │                         │
                              │  ┌──────────────────┐   │
                              │  │ Abstraction Channel│   │   ← Client WS Feishu
                              │  │ Routage Session   │   │
                              │  │ CLI Adapter        │   │
                              │  │ Executor (local+SSH)│   │
                              │  └──────────────────┘   │
                              └────────┬────────────────┘
                                       │ tmux send-keys / capture-pane
                                       ▼
                              ┌─────────────────────────┐
                              │  Machine locale ou distante │
                              │  ┌─────┐  ┌─────┐       │
                              │  │ cc  │  │codex│  ...  │
                              │  └─────┘  └─────┘       │
                              └─────────────────────────┘
```

Stack technique :
- **Frontend** : Vue 3 + Vite + TypeScript + Pinia + Tailwind + xterm.js
- **Backend** : Node.js 20+ + Express + ws + node-pty + ssh2
- **Base de données** : SQLite + Drizzle ORM
- **Gestion de processus** : tmux + PM2

---

## 📁 Structure du projet

```
feishu-claudecode-bridge/
├── src/
│   ├── client/               # Frontend Vue 3
│   │   ├── views/            # 9 pages principales (Home/Bindings/Machines/Providers/Terminal/Logs/Settings/Login/Layout)
│   │   ├── components/       # Composants réutilisables (Pagination/TerminalPanel ...)
│   │   ├── composables/      # useAuth / useDeviceId / useTerminalSession
│   │   └── router/           # vue-router
│   ├── server/               # Backend Express
│   │   ├── routes/           # auth/bindings/machines/providers/sessions/logs/timeline/settings/models/health
│   │   ├── channel/          # Channel WS Feishu + interface abstraite
│   │   ├── cli/              # Adaptateurs CC / Codex
│   │   ├── executor/         # Exécuteurs local + SSH
│   │   ├── terminal/         # pty-bridge + ws-server (Web Terminal)
│   │   ├── auth/             # JWT + TOTP + empreinte digitale de confiance
│   │   ├── db/               # Schéma Drizzle + fichiers de migration
│   │   └── session/          # Machine à états de session (idle / working / awaiting_choice)
│   └── shared/               # Types partagés frontend/backend
├── scripts/                  # migrate-db / seed-admin / migrate-bindings
├── data/                     # Base SQLite (générée au runtime)
├── docs/                     # Documentation (dont readme/、plans/)
├── deploy.sh                 # Script de déploiement PM2 en un clic
├── cll.sh                    # Script d'installation à distance en un clic
├── ecosystem.config.cjs      # Configuration PM2
├── .env.example
└── package.json
```

---

## 🚀 Démarrage rapide

### 1. Prérequis

- Node.js ≥ 20
- npm ≥ 10 (ou pnpm)
- tmux ≥ 3.0 (hébergement des processus CLI)
- Au moins un CLI IA exécutable : `claude` (Claude Code) ou `codex`
- Une application personnalisée d'entreprise Feishu (avec permissions `im:message`、`im:message.group_at_msg` activées)

### 2. Lancement local

```bash
# Cloner
git clone https://github.com/LengendXing/feishu-claudecode-bridge.git
cd feishu-claudecode-bridge

# Installer les dépendances
npm install

# Copier les variables d'environnement
cp .env.example .env
# Éditer .env, renseigner JWT_SECRET etc.

# Initialiser la base de données + compte seed
npm run db:migrate
npm run seed

# Mode développement (frontend + backend en parallèle)
npm run dev
```

Accédez à `http://localhost:3456/`, connectez-vous avec le compte par défaut `nimasile` / le mot de passe `ADMIN_PASSWORD` défini dans `.env`.

---

## 📦 Guide de déploiement

### Méthode 1 : Déploiement à distance en un clic (recommandé)

Sur le serveur cible, exécutez :

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/feishu-claudecode-bridge/main/cll.sh)
```

Spécifier le répertoire d'installation :

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/LengendXing/feishu-claudecode-bridge/main/cll.sh) /opt/feishu-bridge
```

Structure des répertoires après déploiement :

```
feishu-claudecode-bridge/
├── sourceCode/   ← Code source (mise à jour via git pull)
└── deploy/       ← Runtime (PM2 démarre depuis ici)
```

### Méthode 2 : Déploiement PM2 manuel

```bash
git clone https://github.com/LengendXing/feishu-claudecode-bridge.git
cd feishu-claudecode-bridge
bash deploy.sh
```

`deploy.sh` effectue :
1. `npm ci` pour installer les dépendances
2. `npm run build` pour construire le frontend et le backend
3. Copie de `dist/`、`scripts/`、`package.json` etc. vers `../deploy/`
4. Dans `../deploy/`, exécution de `pm2 start ecosystem.config.cjs`

### Méthode 3 : Processus de mise à jour courante

```bash
cd sourceCode/
git pull
bash deploy.sh   # Construction automatique + redémarrage PM2
```

### À faire impérativement après le premier déploiement

1. Éditez `deploy/.env`, renseignez `JWT_SECRET`、`ADMIN_PASSWORD`
2. Accédez dans le navigateur à `http://<IP_serveur>:3456/`
3. Après connexion avec le compte par défaut, allez dans « Réglages » pour activer la 2FA (fortement recommandé)
4. Menu « Machines » : la machine locale est prête par défaut ; pour une machine distante, créez-en une et renseignez les identifiants SSH
5. Menu « Fournisseurs » : créez un fournisseur Anthropic / OpenAI / personnalisé, renseignez base_url + API Key
6. Sur le serveur, lancez une session tmux : `tmux new-session -d -s cc-work`
7. Menu « Bindings » : ajoutez une liaison de bot Feishu, renseignez App ID / App Secret / Verification Token / Encrypt Key + sélectionnez CLI + fournisseur + modèle + Effort
8. Dans un groupe Feishu, @ le bot en envoyant un message quelconque → le backend démarrera automatiquement le processus cc/codex et établira le pont

---

## 📘 Documentation d'utilisation

### Configuration de l'application Feishu

1. Accédez à la [Plateforme Ouverte Feishu](https://open.feishu.cn/), créez une **application personnalisée d'entreprise**
2. Activez les permissions :
   - `im:message` (envoi de messages)
   - `im:message:receive_v1` (réception de messages)
   - `im:message.group_at_msg` (réception des @ en groupe)
3. Abonnement aux événements : activez le **mode connexion longue** (recommandé) ou configurez l'URL de requête `https://<host>/webhook/feishu`
4. Copiez App ID / App Secret / Verification Token / Encrypt Key → collez dans la configuration « Bindings » du Bridge

### Créer une liaison

Accédez au menu « Bindings » → Ajouter :
- **Nom de la liaison** : personnalisé (ex. `cc-projectA`)
- **Machine (host)** : sélectionnez la machine locale ou une machine distante préalablement créée
- **Type de CLI** : cc / codex
- **Fournisseur** : sélectionnez un fournisseur déjà créé
- **Modèle** : exploration automatique depuis le fournisseur ; en cas d'échec, sélection manuelle du modèle par défaut ou saisie d'un ID de modèle personnalisé
- **Effort** : les niveaux disponibles sont affichés selon le maxEffort du modèle
- **Quatre éléments de l'application Feishu** : App ID / Secret / Verification Token / Encrypt Key

Après enregistrement, le Bridge tente automatiquement de se connecter au WS de connexion longue Feishu. Une fois le statut passé à `online`, vous pouvez utiliser le bot en l'@ dans un groupe Feishu.

### Web Terminal

Cliquez sur le bouton `Terminal` dans la liste des « Bindings » pour ouvrir directement un xterm dans le navigateur, équivalent à l'exécution locale de :

```bash
tmux attach -t cc-projectA
```

**Contrainte de sécurité importante : fermer l'onglet Terminal du navigateur ne tue pas la session tmux, le processus métier continue de tourner.**

Supporte Ctrl-b d pour détachement manuel, ResizeObserver pour synchroniser la taille de la fenêtre, déconnexion automatique du WebSocket après 5 minutes d'inactivité (le processus métier n'est pas affecté).

### Timeline en temps réel

La zone Timeline en bas de la page d'accueil affiche les 20 derniers messages Feishu (push en temps réel via SSE). Les nouvelles entrées glissent depuis le haut avec une animation scale+fade, clic pour développer/réduire le contenu complet, tags de plateforme colorés (vert Feishu / bleu Telegram réservé).

### Journaux système

Menu « Journaux » : défilement en temps réel des journaux d'exécution du backend via SSE (supporte la replay des N dernières lignes + heartbeat de maintien de connexion).

### Basculement de thème

Icône soleil/lune en haut à droite pour basculer entre les modes Light / Dark, palette de couleurs noir/blanc/gris.

---

## 📱 Application Android bacs-android

> Adresse du projet : [https://github.com/LengendXing/bacs-android](https://github.com/LengendXing/bacs-android)

**bacs-android** est l'application Android officielle du système, vous permettant depuis votre téléphone de :

- 🔔 Recevoir en temps réel les push de la Timeline du Bridge, les réponses IA arrivent comme des messages IM
- ⌨️ Saisir directement des commandes sur le téléphone et les renvoyer au Bridge, sans ouvrir Feishu
- 📊 Consulter l'état de tous les processus CLI liés (online / offline / awaiting_choice)
- 📜 Parcourir l'historique des sessions et les journaux système
- 🔐 Connexion TOTP à deux facteurs + confiance par empreinte digitale de l'appareil
- 🌙 Thème Light / Dark suivant le système

**Méthode de connexion** : Après le lancement de l'application, renseignez l'adresse du Bridge Server (ex. `http://192.168.1.100:3456`), scannez le QR code de connexion rapide dans la page Réglages pour vous connecter en un clic (JWT court de 60s → échange côté client pour un token long, évitant les fuites du QR code).

**Documentation complète du projet Android** : voir [bacs-android README](https://github.com/LengendXing/bacs-android#readme).

---

## 🔧 Variables d'environnement

`.env` (voir `.env.example`) :

| Variable | Défaut | Description |
|----------|--------|-------------|
| `BRIDGE_PORT` | `3456` | Port d'écoute HTTP / WS |
| `BRIDGE_HOST` | `0.0.0.0` | Adresse d'écoute |
| `BRIDGE_PROGRESS_INTERVAL` | `30` | Intervalle de rafraîchissement des cartes de progression (secondes) |
| `BRIDGE_TIMEOUT` | `600` | Délai d'attente IA par requête (secondes) |
| `BRIDGE_POLL_INTERVAL` | `2` | Intervalle de polling tmux capture-pane (secondes) |
| `BRIDGE_MAX_CONCURRENT` | `4` | Nombre maximum de sessions concurrentes |
| `DB_PATH` | `./data/bridge.db` | Chemin du fichier SQLite |
| `JWT_SECRET` | — | **Obligatoire**, clé de signature JWT |
| `ADMIN_PASSWORD` | `admin` | Mot de passe administrateur lors du premier seed |
| `LOG_LEVEL` | `info` | Niveau de journalisation |
| `LOG_DIR` | `./logs` | Répertoire des journaux |

---

## ❓ Questions fréquentes

**Q : Pas de réponse après l'envoi d'un message Feishu ?**
R : Vérifiez en priorité : ① le statut de la liaison est-il `online` ; ② la session tmux sur le serveur est-elle active ; ③ la API Key du fournisseur est-elle valide ; ④ consultez les journaux backend en temps réel dans le menu « Journaux ».

**Q : Échec de connexion sur machine distante (Not logged in) ?**
R : Corrigé dans v1.0.8 — assurez-vous d'utiliser la commande tmux encapsulée dans `bash -ilc` pour charger les fichiers rc distants. Si le problème persiste, vérifiez que les exécutables `claude` / `codex` sont accessibles depuis `~/.bashrc` distant.

**Q : Perte de connexion SSH pendant une tâche longue ?**
R : Corrigé dans v1.0.10 — heartbeat passé de 5min à 30s, et suppression de la déconnexion主动主动 par inactivité de 60s.

**Q : Comment gérer une session tmux inexistante ?**
R : Le Bridge crée automatiquement la session correspondante lors de la « mise en ligne d'une liaison » (ex. `cc-xxx`、`codex-xxx`), aucune intervention manuelle nécessaire.

**Q : Fermer la fenêtre du navigateur Web Terminal tue-t-il le processus métier ?**
R : **Non**. Le Web Terminal détache uniquement le client tmux, la session métier continue de tourner. Protection forcée dans le code : `session-name` passe par une regex de liste blanche, le chemin de fermeture n'appelle jamais `tmux kill-session`.

---

## 🗂 Versions et itérations

Journal complet des itérations : [maintain.md](../../maintain.md).

Versions récentes :
- **v1.1.7** (actuelle) — README multilingue (10+ langues) + présentation de l'application bacs-android associée
- **v1.1.6** — Titre système + suppression du bouton de déconnexion + bacs_chat_time_line Timeline en temps réel
- **v1.1.5** — Refactorisation de l'empreinte digitale de confiance (double canal : deviceId + cookie token)
- **v1.1.4** — BindingsView double Tab + pagination des listes + Terminal singleton + keep-alive 5min
- **v1.1.3** — Web Terminal dans le navigateur (xterm + tmux)
- **v1.0.0** — Refonte complète (Vite + Vue 3 + Express + Drizzle + thème macOS)

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

---
