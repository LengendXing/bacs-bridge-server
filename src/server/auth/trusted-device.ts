/**
 * @module auth/trusted-device
 * @description 信任设备管理
 *
 * 用户勾选"信任此设备"后，生成 deviceToken 写入浏览器 cookie。
 * 有效期内（默认 30 天）该设备可跳过 2FA 验证。
 */

import crypto from 'crypto';
import { eq, and, gt } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { trustedDevices } from '../db/schema.js';
import { TRUSTED_DEVICE_DAYS } from '@shared/constants.js';

/**
 * 生成信任设备令牌并存入数据库
 *
 * @param userId - 用户 ID
 * @param deviceName - 设备名称（从 User-Agent 摘要）
 * @param ipAddress - 请求 IP
 * @param days - 有效天数，默认 30
 * @returns 生成的 deviceToken 字符串
 *
 * @example
 * ```ts
 * const token = await createTrustedDevice(1, 'Chrome/macOS', '192.168.1.1');
 * // 'td_a1b2c3d4...'
 * ```
 */
export async function createTrustedDevice(
  userId: number,
  deviceName: string,
  ipAddress: string,
  days = TRUSTED_DEVICE_DAYS,
): Promise<string> {
  const db = getDb();
  const token = `td_${crypto.randomBytes(32).toString('hex')}`;

  // 计算过期时间
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  db.insert(trustedDevices).values({
    userId,
    deviceToken: token,
    deviceName,
    ipAddress,
    expiresAt,
  }).run();

  return token;
}

/**
 * 验证信任设备令牌是否有效
 *
 * @param deviceToken - 浏览器 cookie 中的令牌
 * @returns 用户 ID（令牌有效），或 null（无效/过期）
 *
 * @example
 * ```ts
 * const userId = await verifyTrustedDevice('td_a1b2c3d4...');
 * if (userId) { // 跳过 2FA
 * ```
 */
export function verifyTrustedDevice(deviceToken: string): number | null {
  const db = getDb();
  const now = new Date().toISOString();

  const row = db
    .select()
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.deviceToken, deviceToken),
        gt(trustedDevices.expiresAt, now),
      )
    )
    .get();

  return row?.userId ?? null;
}

/**
 * 清理过期的信任设备令牌
 *
 * 建议在用户登录时调用，保持表清洁。
 *
 * @param userId - 可选，只清理特定用户的过期令牌
 */
export function cleanExpiredDevices(userId?: number): void {
  const db = getDb();
  const now = new Date().toISOString();

  // 直接用 Drizzle 的 delete API：gt(column, value) 表示 column > value
  if (userId) {
    db.delete(trustedDevices)
      .where(and(eq(trustedDevices.userId, userId), gt(trustedDevices.expiresAt, now)))
      .run();
  } else {
    db.delete(trustedDevices)
      .where(gt(trustedDevices.expiresAt, now))
      .run();
  }
}

/**
 * 从 User-Agent 字符串生成简短设备描述
 *
 * @param ua - 浏览器 User-Agent
 * @returns 简短描述，如 "Chrome / macOS" / "Safari / iOS"
 */
export function describeUserAgent(ua: string): string {
  const browser = ua.includes('Chrome') && !ua.includes('Edg')
    ? 'Chrome'
    : ua.includes('Safari') && !ua.includes('Chrome')
    ? 'Safari'
    : ua.includes('Firefox')
    ? 'Firefox'
    : ua.includes('Edg')
    ? 'Edge'
    : 'Unknown';

  const os = ua.includes('Mac')
    ? 'macOS'
    : ua.includes('Windows')
    ? 'Windows'
    : ua.includes('Linux')
    ? 'Linux'
    : ua.includes('iPhone') || ua.includes('iPad')
    ? 'iOS'
    : ua.includes('Android')
    ? 'Android'
    : 'Unknown';

  return `${browser} / ${os}`;
}
