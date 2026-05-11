/**
 * @module config
 * @description Server configuration loader.
 *
 * Loads settings from `config.yaml` at the project root and merges
 * environment-variable overrides on top.  Every config value has a
 * sensible default so the server can start even when the YAML file
 * or specific env vars are absent.
 *
 * Supported environment variable overrides:
 * - BRIDGE_PORT           → server.port
 * - ADMIN_PASSWORD        → server.adminPassword
 * - BRIDGE_PROGRESS_INTERVAL → bridge.progressInterval
 * - BRIDGE_TIMEOUT        → bridge.timeout
 * - BRIDGE_MAX_CONCURRENT → bridge.maxConcurrent
 * - JWT_SECRET            → jwt.secret
 * - DB_PATH               → database.path
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
// ── ESM-safe __dirname ────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ── Defaults ───────────────────────────────────────────────────────────
/** Default configuration values used when the YAML file or env vars are missing. */
const DEFAULTS = {
    server: {
        port: 3456,
        host: '0.0.0.0',
        adminPassword: 'admin',
    },
    bridge: {
        progressInterval: 60,
        timeout: 600,
        pollInterval: 2,
        maxConcurrent: 4,
    },
    logging: {
        level: 'info',
        dir: './logs',
    },
    database: {
        path: './data/bridge.db',
    },
    jwt: {
        secret: 'change_me_in_production',
        expiresIn: '24h',
    },
};
// ── Loader ─────────────────────────────────────────────────────────────
/**
 * Load and return the application configuration.
 *
 * Resolution order (later wins):
 * 1. Built-in {@link DEFAULTS}
 * 2. Values from `config.yaml` at the project root
 * 3. Environment variable overrides
 *
 * @returns The fully-merged {@link AppConfig} object.
 *
 * @example
 * ```ts
 * import { load } from './config.js';
 * const cfg = load();
 * console.log(cfg.server.port); // 3456 (or BRIDGE_PORT)
 * ```
 */
export function load() {
    // 1. Start from defaults
    const cfg = structuredClone(DEFAULTS);
    // 2. Overlay YAML values
    const yamlPath = path.resolve(__dirname, '../../config.yaml');
    if (fs.existsSync(yamlPath)) {
        const raw = fs.readFileSync(yamlPath, 'utf-8');
        const parsed = yaml.load(raw);
        if (parsed.server)
            Object.assign(cfg.server, parsed.server);
        if (parsed.bridge)
            Object.assign(cfg.bridge, parsed.bridge);
        if (parsed.logging)
            Object.assign(cfg.logging, parsed.logging);
        if (parsed.database)
            Object.assign(cfg.database, parsed.database);
        if (parsed.jwt)
            Object.assign(cfg.jwt, parsed.jwt);
        // Compatibility: old YAML uses "admin_password" / "expires_in"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyParsed = parsed;
        if (anyParsed.server?.admin_password) {
            cfg.server.adminPassword = anyParsed.server.admin_password;
        }
        if (anyParsed.jwt?.expires_in) {
            cfg.jwt.expiresIn = anyParsed.jwt.expires_in;
        }
    }
    // 3. Environment variable overrides
    if (process.env.BRIDGE_PORT) {
        cfg.server.port = parseInt(process.env.BRIDGE_PORT, 10);
    }
    if (process.env.ADMIN_PASSWORD) {
        cfg.server.adminPassword = process.env.ADMIN_PASSWORD;
    }
    if (process.env.BRIDGE_PROGRESS_INTERVAL) {
        cfg.bridge.progressInterval = parseInt(process.env.BRIDGE_PROGRESS_INTERVAL, 10);
    }
    if (process.env.BRIDGE_TIMEOUT) {
        cfg.bridge.timeout = parseInt(process.env.BRIDGE_TIMEOUT, 10);
    }
    if (process.env.BRIDGE_MAX_CONCURRENT) {
        cfg.bridge.maxConcurrent = parseInt(process.env.BRIDGE_MAX_CONCURRENT, 10);
    }
    if (process.env.JWT_SECRET) {
        cfg.jwt.secret = process.env.JWT_SECRET;
    }
    if (process.env.DB_PATH) {
        cfg.database.path = process.env.DB_PATH;
    }
    return cfg;
}
/** 单例配置对象，应用启动时加载一次 */
const config = load();
export default config;
