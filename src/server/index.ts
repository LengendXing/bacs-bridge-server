/**
 * @module server/index
 * @description Express server entry point for feishu-claudecode-bridge.
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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import config from './config.js';
import * as logger from './middleware/logger.js';

// ── Route modules ──────────────────────────────────────────────────────
import authRoutes from './routes/auth.js';
import bindingRoutes from './routes/bindings.js';
import providerRoutes from './routes/providers.js';
import modelRoutes from './routes/models.js';
import sessionRoutes from './routes/sessions.js';
import logRoutes from './routes/logs.js';
import healthRoutes from './routes/health.js';

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

// ── API routes ─────────────────────────────────────────────────────────

/** Health check (always available, no auth required) */
app.use(healthRoutes);

/** Authentication (login / logout / 2FA) — Phase 2 */
app.use(authRoutes);

/** Binding CRUD + status — Phase 2-3 */
app.use(bindingRoutes);

/** Provider CRUD — Phase 3 */
app.use(providerRoutes);

/** Model listing & refresh — Phase 3 */
app.use(modelRoutes);

/** Tmux session listing — Phase 2 */
app.use(sessionRoutes);

/** Log viewer — Phase 2 */
app.use(logRoutes);

// ── Production: static files + SPA fallback ────────────────────────────

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  /**
   * Absolute path to the Vite-built client assets.
   * `dist/client` is the default output directory when `vite build`
   * is configured with `build.outDir: 'dist/client'`.
   */
  const clientDir = path.resolve(__dirname, '../../dist/client');

  // Serve static assets (JS, CSS, images, fonts, etc.)
  app.use(express.static(clientDir));

  /**
   * SPA fallback — for any request that does NOT start with `/api/`
   * or match `/health`, return `index.html` so that Vue Router can
   * handle the route client-side.
   *
   * @param req  - Express request.
   * @param res  - Express response.
   * @param next - Express next callback (passed through for API routes).
   */
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

// ── Start server ───────────────────────────────────────────────────────

const { port, host } = config.server;

app.listen(port, host, () => {
  logger.log('info', 'Bridge Server 启动', { host, port, version });
  console.log(`Bridge Server v${version} 运行在 http://${host}:${port}`);

  if (isProduction) {
    console.log(`管理面板: http://${host}:${port}/`);
  } else {
    console.log(`管理面板（开发）: http://localhost:5173/`);
  }

  // ── Restore WebSocket connections ────────────────────────────────
  // TODO: restore WS connections after Phase 4
  // The following block will be enabled once the Feishu WebSocket
  // channel module (`src/server/channel/feishu`) is implemented.
  try {
    // Dynamic import wrapped in try/catch — the module does not
    // exist yet, so we intentionally catch and log a debug message.
    //
    // import('../channel/feishu/index.js').then(mod => {
    //   mod.restoreAll().catch((err: Error) =>
    //     logger.log('error', '恢复 WebSocket 连接失败', err.message),
    //   );
    // }).catch(() => {
    //   logger.log('debug', 'WebSocket channel module not available yet');
    // });
  } catch {
    // Intentionally silent — WS restoration is deferred to Phase 4.
    logger.log('debug', 'WebSocket channel module not available yet');
  }
});

// ── Export version for other modules ────────────────────────────────────
export { version };
