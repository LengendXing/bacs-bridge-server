/**
 * @module db/index
 * @description SQLite 数据库连接与 Drizzle ORM 初始化
 *
 * 使用 better-sqlite3 作为驱动，Drizzle ORM 作为查询构建器。
 * 启动时自动确保 data 目录存在，并运行待执行的迁移。
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as schema from './schema.js';
// ── ESM 中获取 __dirname ──
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * 初始化数据库连接
 *
 * 1. 确保 data 目录存在
 * 2. 打开 SQLite 连接（启用 WAL 模式提升并发读性能）
 * 3. 创建 Drizzle 实例
 * 4. 运行迁移文件
 *
 * @param dbPath - SQLite 数据库文件路径，默认从配置读取
 * @returns Drizzle 数据库实例
 */
export function initDatabase(dbPath) {
    // 默认路径
    const resolvedPath = dbPath || './data/bridge.db';
    // 确保 data 目录存在
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    // 打开 SQLite 连接
    const sqlite = new Database(resolvedPath);
    // 启用 WAL 模式（Write-Ahead Logging），提升并发读性能
    sqlite.pragma('journal_mode = WAL');
    // 启用外键约束
    sqlite.pragma('foreign_keys = ON');
    // 创建 Drizzle 实例，注入完整 schema 以支持关系查询
    const db = drizzle(sqlite, { schema });
    // 运行迁移
    const migrationsPath = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsPath)) {
        migrate(db, { migrationsFolder: migrationsPath });
    }
    return db;
}
/** 全局数据库单例（延迟初始化） */
let _db = null;
/**
 * 获取数据库单例
 *
 * 首次调用时自动初始化，后续调用返回同一实例。
 *
 * @param dbPath - 可选的数据库路径（仅首次调用有效）
 * @returns Drizzle 数据库实例
 */
export function getDb(dbPath) {
    if (!_db) {
        _db = initDatabase(dbPath);
    }
    return _db;
}
