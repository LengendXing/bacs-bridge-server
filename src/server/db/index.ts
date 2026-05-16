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

  // 运行时确保 app_settings 表存在（drizzle 迁移之外的 KV 表）
  ensureAppSettingsTable(sqlite);

  // 运行时确保 bacs_bots 表存在（v1.1.10 引入）
  ensureBacsBotsTable(sqlite);

  // 一次性迁移：把 bindings 中的飞书机器人凭据导入 bacs_bots
  // 通过 app_settings.botsMigrationDone 标记保证只执行一次
  runBotsMigrationOnce(sqlite);

  // 运行时确保 bindings.bot_id 列存在（v1.1.14 引入）
  ensureBindingBotIdColumn(sqlite);

  // 一次性回填：bindings.feishu_app_id → bindings.bot_id（按 bacs_bots.app_id 匹配）
  // 通过 app_settings.bindingBotIdMigrationDone 标记保证只执行一次
  runBindingBotIdBackfillOnce(sqlite);

  // Seed 默认本机记录
  seedLocalMachine(sqlite);

  return db;
}

/**
 * 兼容老库：确保 app_settings 表存在
 */
function ensureAppSettingsTable(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

/**
 * 兼容老库：确保 bacs_bots 表存在（v1.1.10 引入）
 *
 * 不走 drizzle 迁移文件（保持与 ensureAppSettingsTable 一致的运行时建表风格），
 * 避免老库升级时遗漏。
 */
function ensureBacsBotsTable(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS bacs_bots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL DEFAULT 'feishu',
      name TEXT NOT NULL,
      app_id TEXT,
      secret TEXT,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS bacs_bots_platform_name_idx
      ON bacs_bots (platform, name)
  `);
}

/**
 * 一次性迁移：把现有 bindings 中的飞书机器人凭据迁移到 bacs_bots
 *
 * 幂等：通过 app_settings.key = 'botsMigrationDone' 标记，已迁移则直接返回。
 * 字段映射：
 *   - bindings.process_name    → bacs_bots.name
 *   - bindings.feishu_app_id   → bacs_bots.app_id
 *   - bindings.feishu_app_secret → bacs_bots.secret
 *   - bacs_bots.remark         → NULL（用户后续手动填写）
 *
 * v1.1.10 引入。后续版本：bindings 通过 bot_id 关联此表，本迁移废弃。
 */
function runBotsMigrationOnce(sqlite: Database.Database): void {
  const done = sqlite
    .prepare(`SELECT value FROM app_settings WHERE key = 'botsMigrationDone'`)
    .get() as { value: string } | undefined;
  if (done) return;

  type Row = { process_name: string; feishu_app_id: string | null; feishu_app_secret: string | null };
  const rows = sqlite
    .prepare(
      `SELECT process_name, feishu_app_id, feishu_app_secret
       FROM bindings
       WHERE feishu_app_id IS NOT NULL AND feishu_app_id != ''`
    )
    .all() as Row[];

  const insert = sqlite.prepare(`
    INSERT INTO bacs_bots (platform, name, app_id, secret, remark)
    VALUES ('feishu', ?, ?, ?, NULL)
    ON CONFLICT(platform, name) DO NOTHING
  `);

  let inserted = 0;
  for (const r of rows) {
    if (!r.process_name) continue;
    const result = insert.run(r.process_name, r.feishu_app_id, r.feishu_app_secret);
    if (result.changes > 0) inserted++;
  }

  sqlite
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES ('botsMigrationDone', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(new Date().toISOString());

  // eslint-disable-next-line no-console
  console.log(`[Bots 迁移] 扫描 ${rows.length} 条飞书绑定，新增 ${inserted} 条 Bot 记录`);
}

/**
 * 兼容老库（v1.1.14）：为 bindings 表补齐 bot_id 列。
 *
 * v1.1.14 起新建/编辑绑定走 botId 关联 bacs_bots 表。老库 bindings 表无此列，
 * 启动时通过 PRAGMA + ALTER TABLE 兜底（与 ensureMachineColumns 风格一致）。
 */
function ensureBindingBotIdColumn(sqlite: Database.Database): void {
  const cols = sqlite.prepare(`PRAGMA table_info(bindings)`).all() as { name: string }[];
  const names = new Set(cols.map(c => c.name));
  if (!names.has('bot_id')) {
    sqlite.exec(`ALTER TABLE bindings ADD COLUMN bot_id INTEGER REFERENCES bacs_bots(id) ON DELETE SET NULL`);
  }
}

/**
 * 一次性回填：根据 bindings.feishu_app_id 匹配 bacs_bots.app_id，回填 bindings.bot_id。
 *
 * 幂等：通过 app_settings.key = 'bindingBotIdMigrationDone' 标记。
 * 仅处理 bot_id 为空且 feishu_app_id 非空的行；同一 app_id 在 bacs_bots 中可能有多条
 * （理论上 platform=feishu + name 唯一，但不强制 app_id 唯一），按 id 最小者匹配。
 *
 * v1.1.14 引入。前置：runBotsMigrationOnce（v1.1.10）已把所有 binding 凭据迁入 bacs_bots。
 */
function runBindingBotIdBackfillOnce(sqlite: Database.Database): void {
  const done = sqlite
    .prepare(`SELECT value FROM app_settings WHERE key = 'bindingBotIdMigrationDone'`)
    .get() as { value: string } | undefined;
  if (done) return;

  type Row = { id: string; feishu_app_id: string };
  const rows = sqlite
    .prepare(
      `SELECT id, feishu_app_id
       FROM bindings
       WHERE bot_id IS NULL
         AND feishu_app_id IS NOT NULL
         AND feishu_app_id != ''`
    )
    .all() as Row[];

  const findBot = sqlite.prepare(
    `SELECT id FROM bacs_bots WHERE platform = 'feishu' AND app_id = ? ORDER BY id ASC LIMIT 1`
  );
  const updateBinding = sqlite.prepare(
    `UPDATE bindings SET bot_id = ?, updated_at = datetime('now') WHERE id = ?`
  );

  let matched = 0;
  let missing = 0;
  for (const r of rows) {
    const bot = findBot.get(r.feishu_app_id) as { id: number } | undefined;
    if (bot) {
      updateBinding.run(bot.id, r.id);
      matched++;
    } else {
      missing++;
    }
  }

  sqlite
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES ('bindingBotIdMigrationDone', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(new Date().toISOString());

  // eslint-disable-next-line no-console
  console.log(
    `[Binding-BotId 回填] 扫描 ${rows.length} 条绑定，匹配 ${matched} 条，未匹配 ${missing} 条`
  );
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
