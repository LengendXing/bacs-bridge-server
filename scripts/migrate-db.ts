/**
 * 数据库迁移脚本
 *
 * 读取 src/server/db/migrations/ 下的所有 SQL 文件，
 * 按顺序在目标数据库上执行。
 *
 * 支持通过 DB_PATH 环境变量指定数据库路径（默认 ./data/bridge.db）
 * 支持通过 MIGRATIONS_DIR 环境变量指定迁移文件目录
 *
 * 已执行的迁移记录在 _migrations_meta 表中，不会重复执行。
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../data/bridge.db');
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.resolve(__dirname, '../src/server/db/migrations');

console.log(`[migrate] 数据库: ${DB_PATH}`);
console.log(`[migrate] 迁移目录: ${MIGRATIONS_DIR}`);

// 确保数据目录存在
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`[migrate] 创建数据目录: ${dbDir}`);
}

const db = new Database(DB_PATH);

// 创建迁移记录表
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// 获取已执行的迁移
const applied = new Set(
  db.prepare('SELECT filename FROM _migrations_meta').all().map(r => (r as any).filename),
);

// 读取 SQL 迁移文件（排除 meta 目录下的 snapshot 文件）
const sqlFiles = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

if (sqlFiles.length === 0) {
  console.log('[migrate] 无迁移文件');
  db.close();
  process.exit(0);
}

const insertMeta = db.prepare('INSERT INTO _migrations_meta (filename) VALUES (?)');

let appliedCount = 0;

for (const file of sqlFiles) {
  if (applied.has(file)) {
    console.log(`[migrate] 跳过已执行: ${file}`);
    continue;
  }

  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
  console.log(`[migrate] 执行: ${file}`);

  try {
    db.exec(sql);
    insertMeta.run(file);
    appliedCount++;
    console.log(`[migrate] 成功: ${file}`);
  } catch (e: any) {
    // If error is "already exists", mark it as applied and continue
    if (e.message.includes('already exists') || e.message.includes('duplicate column')) {
      console.warn(`[migrate] 跳过（已存在）: ${file} — ${e.message}`);
      insertMeta.run(file);
      continue;
    }
    console.error(`[migrate] 失败: ${file} — ${e.message}`);
    db.close();
    process.exit(1);
  }
}

db.close();

if (appliedCount > 0) {
  console.log(`[migrate] 完成: 新执行 ${appliedCount} 个迁移`);
} else {
  console.log('[migrate] 完成: 数据库已是最新');
}
