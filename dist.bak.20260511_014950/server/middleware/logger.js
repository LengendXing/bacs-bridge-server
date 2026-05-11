/**
 * @module middleware/logger
 * @description Structured logging middleware for the Express server.
 *
 * Provides two exports:
 * - **log** — write a structured JSON log entry to a daily log file.
 * - **middleware** — Express middleware that automatically logs every
 *   incoming request with method, path, status code, and response time.
 *
 * Log files are written to the directory specified in
 * `config.logging.dir` (default `./logs`).  A new file is created
 * each day named `YYYY-MM-DD.log`.  The `logs/` directory is created
 * automatically if it does not exist.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config.js';
// ── ESM-safe __dirname ────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ── Initialisation ────────────────────────────────────────────────────
/** Absolute path to the log directory */
const LOG_DIR = path.resolve(__dirname, '../../..', config.logging.dir);
// Ensure log directory exists before any writes
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}
/** Write stream for the current day's log file */
let logStream = createStreamForToday();
/**
 * Create a writable stream for today's log file.
 *
 * The file is opened in append mode (`flags: 'a'`) so that
 * restarting the server does not truncate existing entries.
 *
 * @returns A `fs.WriteStream` pointing at `<LOG_DIR>/YYYY-MM-DD.log`.
 */
function createStreamForToday() {
    const today = new Date().toISOString().slice(0, 10);
    const filePath = path.join(LOG_DIR, `${today}.log`);
    return fs.createWriteStream(filePath, { flags: 'a' });
}
/**
 * Check whether the day has rolled over and, if so, rotate the log
 * stream to a new file.
 */
function rotateIfNeeded() {
    const today = new Date().toISOString().slice(0, 10);
    const currentFile = path.basename(logStream.path.toString());
    if (`${today}.log` !== currentFile) {
        logStream.end();
        logStream = createStreamForToday();
    }
}
// ── Public API ────────────────────────────────────────────────────────
/**
 * Write a structured log entry.
 *
 * The entry is serialised as a single JSON line and appended to the
 * current day's log file.  When `config.logging.level` is `"debug"`,
 * the entry is also printed to stdout.
 *
 * @param level   - Severity level (debug / info / warn / error).
 * @param message - Human-readable description of the event.
 * @param data    - Optional structured data to attach (e.g. request info).
 *
 * @example
 * ```ts
 * log('info', 'User logged in', { userId: 42 });
 * log('error', 'DB connection failed', { err: error.message });
 * ```
 */
export function log(level, message, data) {
    rotateIfNeeded();
    const entry = { ts: new Date().toISOString(), level, message };
    if (data !== undefined) {
        entry.data = data;
    }
    const line = JSON.stringify(entry) + '\n';
    logStream.write(line);
    // Mirror to console in debug mode
    if (config.logging.level === 'debug') {
        console.log(`[${entry.ts}] [${level}] ${message}`, data ?? '');
    }
}
/**
 * Express middleware that logs every completed request.
 *
 * Records the HTTP method, URL path, status code, and response
 * duration in milliseconds.  Sensitive payloads (e.g. Feishu
 * webhooks) are redacted to avoid leaking secrets.
 *
 * @param req  - Express request object.
 * @param res  - Express response object.
 * @param next - Express `next` callback.
 *
 * @example
 * ```ts
 * app.use(logger.middleware);
 * ```
 */
export function middleware(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        log('info', `${req.method} ${req.path} ${res.statusCode} ${duration}ms`, {
            ip: req.ip,
            query: req.query,
            // Redact Feishu webhook payloads which may contain app_secret
            body: req.path === '/webhook/feishu' ? '(feishu payload)' : req.body,
        });
    });
    next();
}
/** 默认导出，方便 import logger from './middleware/logger.js' */
export default { log, middleware };
