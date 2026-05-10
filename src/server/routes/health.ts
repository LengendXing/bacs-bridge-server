/**
 * @module routes/health
 * @description Health-check route for service monitoring.
 *
 * Exposes a single `GET /health` endpoint that returns a JSON payload
 * indicating the server is alive, along with the current application
 * version read from `package.json` via `fs.readFileSync` (avoids
 * import-assertion syntax for CJS compatibility).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import type { ApiResponse } from '@shared/types.js';
import { ErrorCode } from '@shared/constants.js';

// ── ESM-safe __dirname ────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Read the application version from the root `package.json`.
 *
 * Uses `fs.readFileSync` + `JSON.parse` instead of a static `import`
 * assertion so that the code works under both ESM and CJS bundling.
 *
 * @returns The semver version string (e.g. "1.0.0").
 */
function readVersion(): string {
  const pkgPath = path.resolve(__dirname, '../../../package.json');
  const raw = fs.readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(raw) as { version: string };
  return pkg.version;
}

const router = Router();

/**
 * `GET /health`
 *
 * Returns a lightweight health-check payload used by load-balancers,
 * Docker HEALTHCHECK, or monitoring systems.
 *
 * @returns `ApiResponse` with `code: 0`, `message: "ok"`, and `data.version`.
 *
 * @example
 * ```sh
 * curl http://localhost:3456/health
 * # → { "code": 0, "message": "ok", "data": { "version": "1.0.0" } }
 * ```
 */
router.get('/health', (_req, res) => {
  const body: ApiResponse<{ version: string }> = {
    code: ErrorCode.SUCCESS,
    message: 'ok',
    data: { version: readVersion() },
  };
  res.json(body);
});

export default router;
