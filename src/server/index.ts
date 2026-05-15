/**
 * @module server/index
 * @description Express server entry point for bacs-bridge-server.
 *
 * This file bootstraps the HTTP server, applies global middleware,
 * mounts all API route modules, and (in production) serves the
 * Vue 3 SPA built by Vite.
 *
 * Startup sequence:
 * 1. Load configuration from `config.yaml` + env vars.
 * 2. Apply middleware: CORS, JSON body parser, cookie parser, request logger.
 * 3. Mount API routers: auth, bindings, providers, models, sessions, logs.
 * 4. Mount the health-check route.
 * 5. In production: serve static assets from `dist/client` and add SPA fallback.
 * 6. Start listening on the configured port.
 * 7. Attempt to restore WebSocket connections (deferred to Phase 4).
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import config from './config.js';
import * as logger from './middleware/logger.js';
import { restoreAllChannels } from './channel/router.js';
import { mountTerminalWs } from './terminal/ws-server.js';

// ── Route modules ──────────────────────────────────────────────────────
import authRoutes from './routes/auth.js';
import bindingRoutes from './routes/bindings.js';
import providerRoutes from './routes/providers.js';
import modelRoutes from './routes/models.js';
import sessionRoutes from './routes/sessions.js';
import machineRoutes from './routes/machines.js';
import logRoutes from './routes/logs.js';
import healthRoutes from './routes/health.js';
import settingsRoutes from './routes/settings.js';
import timelineRoutes from './routes/timeline.js';

// ── ESM-safe __dirname ────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Application version ───────────────────────────────────────────────
/**
 * Read the application version from the root `package.json`.
 *
 * Uses `fs.readFileSync` + `JSON.parse` instead of an import assertion
 * so that the code works under both ESM and CJS bundling modes.
 *
 * @constant version - The semver string from package.json (e.g. "1.0.0").
 */
const pkgPath = path.resolve(__dirname, '../../package.json');
const pkgRaw = fs.readFileSync(pkgPath, 'utf-8');
const pkgJson = JSON.parse(pkgRaw) as { version: string };
const version: string = pkgJson.version;

// ── Config (singleton loaded at module init time) ────────────────────────
// `config` is the default export from config.ts — already resolved
// from config.yaml + env vars when that module was first imported.

// ── Express app ────────────────────────────────────────────────────────
const app = express();

// ── Global middleware ───────────────────────────────────────────────────

/**
 * CORS — allow requests from the Vue dev server during development.
 * In production the SPA is served from the same origin so CORS is
 * effectively a no-op, but the middleware is kept for API-only usage.
 */
app.use(cors());

/**
 * JSON body parser — limits and settings match the default Express 4.x
 * behaviour (100kb body limit, no reviver).
 */
app.use(express.json());

/**
 * Cookie parser — required for JWT refresh-token and trusted-device
 * cookies that will be introduced in Phase 2.
 */
app.use(cookieParser());

/**
 * Request logger — writes a structured JSON line per request to the
 * daily log file and mirrors to stdout in debug mode.
 */
app.use(logger.middleware);

// ── Public routes (no auth required) ───────────────────────────────────

/** Health check */
app.use(healthRoutes);

/** Authentication (login / logout / 2FA) */
app.use(authRoutes);

// ── Static files + SPA fallback (always served when built) ─────────────

const clientDir = path.resolve(__dirname, '../../dist/client');
const hasClient = fs.existsSync(clientDir);

if (hasClient) {
  app.use(express.static(clientDir));

  app.get('*', (req, _res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health') {
      return next();
    }
    const indexPath = path.join(clientDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      _res.sendFile(indexPath);
    } else {
      _res.status(503).send('管理面板未构建，请先运行 npm run build:client');
    }
  });
}

// ── Protected API routes (require auth) ────────────────────────────────

/** Binding CRUD + status — Phase 2-3 */
app.use(bindingRoutes);

/** Provider CRUD — Phase 3 */
app.use(providerRoutes);

/** Model listing & refresh — Phase 3 */
app.use(modelRoutes);

/** Tmux session listing — Phase 2 */
app.use(sessionRoutes);

/** Machine management — Phase remote-machine */
app.use(machineRoutes);

/** Log viewer — Phase 2 */
app.use(logRoutes);

/** App settings (KV) — v1.0.4-Beta */
app.use(settingsRoutes);

/** Chat timeline — v1.1.6 */
app.use(timelineRoutes);

// ── Start server ───────────────────────────────────────────────────────

const { port, host } = config.server;

// 用 http.createServer 包装，方便挂载 WebSocket（web-terminal 需要 upgrade 事件）
const httpServer = http.createServer(app);

mountTerminalWs(httpServer);

httpServer.listen(port, host, () => {
  logger.log('info', 'Bridge Server 启动', { host, port, version });
  console.log(`Bridge Server v${version} 运行在 http://${host}:${port}`);

  if (hasClient) {
    console.log(`管理面板: http://${host}:${port}/`);
  }

  // ── Restore WebSocket connections ────────────────────────────────
  restoreAllChannels()
    .then(() => logger.log('info', '所有渠道连接已恢复'))
    .catch((err: Error) => logger.log('error', '恢复渠道连接失败', err.message));
});

// ── Export version for other modules ────────────────────────────────────
export { version };
