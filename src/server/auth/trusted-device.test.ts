import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';

function makeMemoryDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      totp_secret TEXT,
      totp_enabled INTEGER DEFAULT 0,
      recovery_codes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE trusted_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_token TEXT NOT NULL UNIQUE,
      device_id TEXT,
      device_name TEXT,
      ip_address TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO users (id, username, password_hash) VALUES (1, 'u1', 'x'), (2, 'u2', 'y');
  `);
  return { db: drizzle(sqlite, { schema }), sqlite };
}

let memDb: ReturnType<typeof makeMemoryDb>;

vi.mock('../db/index.js', () => ({
  getDb: () => memDb.db,
}));

let mod: typeof import('./trusted-device.js');

beforeEach(async () => {
  memDb = makeMemoryDb();
  mod = await import('./trusted-device.js');
});

describe('createTrustedDevice + verifyTrustedDevice', () => {
  it('cookie token 通道：创建后可命中', async () => {
    const token = await mod.createTrustedDevice(1, 'Chrome / macOS', '127.0.0.1');
    expect(token).toMatch(/^td_[a-f0-9]{64}$/);
    expect(mod.verifyTrustedDevice(1, token, undefined)).toBe(true);
  });

  it('deviceId 通道：创建后可命中', async () => {
    await mod.createTrustedDevice(1, 'Chrome / macOS', '127.0.0.1', 'fp_abc123');
    expect(mod.verifyTrustedDevice(1, undefined, 'fp_abc123')).toBe(true);
  });

  it('双通道均未命中返回 false', () => {
    expect(mod.verifyTrustedDevice(1, 'td_notexist', 'fp_notexist')).toBe(false);
  });

  it('userId 不匹配时不通过', async () => {
    const token = await mod.createTrustedDevice(1, 'Chrome / macOS', '127.0.0.1', 'fp_abc');
    expect(mod.verifyTrustedDevice(2, token, 'fp_abc')).toBe(false);
  });

  it('已过期的 token 不通过验证', async () => {
    memDb.sqlite.prepare(`
      INSERT INTO trusted_devices (user_id, device_token, expires_at)
      VALUES (1, 'td_expired', ?)
    `).run(new Date(Date.now() - 1000).toISOString());

    expect(mod.verifyTrustedDevice(1, 'td_expired', undefined)).toBe(false);
  });

  it('已过期的 deviceId 不通过验证', async () => {
    memDb.sqlite.prepare(`
      INSERT INTO trusted_devices (user_id, device_token, device_id, expires_at)
      VALUES (1, 'td_exp2', 'fp_expired', ?)
    `).run(new Date(Date.now() - 1000).toISOString());

    expect(mod.verifyTrustedDevice(1, undefined, 'fp_expired')).toBe(false);
  });

  it('相同 deviceId 重复创建时刷新过期时间（旧记录被删除）', async () => {
    await mod.createTrustedDevice(1, 'Chrome', '127.0.0.1', 'fp_dup');
    await mod.createTrustedDevice(1, 'Chrome', '127.0.0.1', 'fp_dup');

    const rows = memDb.sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM trusted_devices WHERE device_id = 'fp_dup'`
    ).get() as { cnt: number };
    expect(rows.cnt).toBe(1);
  });
});

describe('cleanExpiredDevices', () => {
  it('只删过期的，保留未过期的', () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    const past = new Date(Date.now() - 86400_000).toISOString();

    memDb.sqlite.prepare(`INSERT INTO trusted_devices (user_id, device_token, expires_at) VALUES (1, 'td_alive', ?)`).run(future);
    memDb.sqlite.prepare(`INSERT INTO trusted_devices (user_id, device_token, expires_at) VALUES (1, 'td_dead', ?)`).run(past);

    mod.cleanExpiredDevices(1);

    const remaining = memDb.sqlite.prepare(`SELECT device_token FROM trusted_devices WHERE user_id = 1`).all() as { device_token: string }[];
    const tokens = remaining.map(r => r.device_token);
    expect(tokens).toContain('td_alive');
    expect(tokens).not.toContain('td_dead');
  });

  it('userId 限定：只清当前用户的过期记录，不影响其他用户', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    memDb.sqlite.prepare(`INSERT INTO trusted_devices (user_id, device_token, expires_at) VALUES (1, 'td_u1_dead', ?)`).run(past);
    memDb.sqlite.prepare(`INSERT INTO trusted_devices (user_id, device_token, expires_at) VALUES (2, 'td_u2_dead', ?)`).run(past);

    mod.cleanExpiredDevices(1);

    const u1 = memDb.sqlite.prepare(`SELECT 1 FROM trusted_devices WHERE device_token = 'td_u1_dead'`).get();
    const u2 = memDb.sqlite.prepare(`SELECT 1 FROM trusted_devices WHERE device_token = 'td_u2_dead'`).get();
    expect(u1).toBeUndefined();
    expect(u2).toBeDefined();
  });

  it('不带 userId 时全表清理过期记录', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 86400_000).toISOString();
    memDb.sqlite.prepare(`INSERT INTO trusted_devices (user_id, device_token, expires_at) VALUES (1, 'td_a', ?)`).run(past);
    memDb.sqlite.prepare(`INSERT INTO trusted_devices (user_id, device_token, expires_at) VALUES (2, 'td_b', ?)`).run(past);
    memDb.sqlite.prepare(`INSERT INTO trusted_devices (user_id, device_token, expires_at) VALUES (1, 'td_c', ?)`).run(future);

    mod.cleanExpiredDevices();

    const rows = memDb.sqlite.prepare(`SELECT device_token FROM trusted_devices`).all() as { device_token: string }[];
    expect(rows.map(r => r.device_token)).toEqual(['td_c']);
  });
});

describe('describeUserAgent', () => {
  it('Chrome / macOS', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    expect(mod.describeUserAgent(ua)).toBe('Chrome / macOS');
  });

  it('Safari / iOS', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1';
    expect(mod.describeUserAgent(ua)).toBe('Safari / iOS');
  });

  it('Edge / Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120.0';
    expect(mod.describeUserAgent(ua)).toBe('Edge / Windows');
  });
});
