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
import os from 'os';
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
export function initDatabase(dbPath?: string): ReturnType<typeof drizzle> {
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

  // 运行时 schema 修复（兼容老库）：如缺少 os_version / builtin 列则补上
  ensureMachineColumns(sqlite);

  // Seed 默认本机记录
  seedLocalMachine(sqlite);

  return db;
}

/**
 * 兼容老库：为 machines 表补齐新增列
 */
function ensureMachineColumns(sqlite: Database.Database): void {
  const cols = sqlite.prepare(`PRAGMA table_info(machines)`).all() as { name: string }[];
  const names = new Set(cols.map(c => c.name));
  if (!names.has('os_version')) {
    sqlite.exec(`ALTER TABLE machines ADD COLUMN os_version TEXT`);
  }
  if (!names.has('builtin')) {
    sqlite.exec(`ALTER TABLE machines ADD COLUMN builtin INTEGER NOT NULL DEFAULT 0`);
  }
}

/**
 * 确保 machines 表存在一条 builtin=1 的本机记录（local / localhost）。
 * - 不存在则插入
 * - 存在则刷新 osVersion 为当前系统版本
 */
function seedLocalMachine(sqlite: Database.Database): void {
  const platform = os.platform(); // 'darwin' | 'linux' | 'win32' | ...
  const osType = platform === 'darwin' ? 'mac' : platform === 'linux' ? 'linux' : platform;
  const osVersion = `${os.type()} ${os.release()}`;

  const existing = sqlite.prepare(`SELECT id FROM machines WHERE builtin = 1 LIMIT 1`).get() as { id: number } | undefined;

  if (!existing) {
    sqlite.prepare(`
      INSERT INTO machines (name, host, port, os_type, os_version, auth_type, username, status, builtin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run('local', 'localhost', 22, osType, osVersion, 'password', os.userInfo().username || 'local', 'online');
  } else {
    // 启动时刷新本机系统版本（系统升级或迁移后）
    sqlite.prepare(`
      UPDATE machines SET os_type = ?, os_version = ?, status = 'online', updated_at = datetime('now')
      WHERE id = ?
    `).run(osType, osVersion, existing.id);
  }
}

/** 全局数据库单例（延迟初始化） */
let _db: ReturnType<typeof drizzle> | null = null;

/**
 * 获取数据库单例
 *
 * 首次调用时自动初始化，后续调用返回同一实例。
 *
 * @param dbPath - 可选的数据库路径（仅首次调用有效）
 * @returns Drizzle 数据库实例
 */
export function getDb(dbPath?: string): ReturnType<typeof drizzle> {
  if (!_db) {
    _db = initDatabase(dbPath);
  }
  return _db;
}

/** 导出 Drizzle 实例的类型，供其他模块引用 */
export type DatabaseInstance = ReturnType<typeof drizzle>;
