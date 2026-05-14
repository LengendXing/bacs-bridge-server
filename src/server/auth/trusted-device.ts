/**
 * @module auth/trusted-device
 * @description 信任设备管理
 *
 * 双通道验证策略：
 * 1. deviceId（主通道）：浏览器 FingerprintJS 计算的稳定指纹，存 localStorage，
 *    不依赖 cookie，清 cookie 后仍有效。
 * 2. deviceToken（辅助通道）：服务端随机生成，存 httpOnly cookie，
 *    作为 deviceId 丢失时的备用验证手段。
 *
 * 只要任意一个通道命中有效记录，即可跳过 2FA。
 */

import crypto from 'crypto';
import { eq, and, gt, lt, or } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { trustedDevices } from '../db/schema.js';
import { TRUSTED_DEVICE_DAYS } from '../../shared/constants.js';

/**
 * 生成信任设备令牌并存入数据库
 *
 * @param userId - 用户 ID
 * @param deviceName - 设备名称（从 User-Agent 摘要）
 * @param ipAddress - 请求 IP
 * @param deviceId - 浏览器指纹 ID（可选，来自 FingerprintJS）
 * @param days - 有效天数，默认 30
 * @returns 生成的 deviceToken 字符串
 */
export async function createTrustedDevice(
  userId: number,
  deviceName: string,
  ipAddress: string,
  deviceId?: string,
  days = TRUSTED_DEVICE_DAYS,
): Promise<string> {
  const db = getDb();
  const token = `td_${crypto.randomBytes(32).toString('hex')}`;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  // 若已有相同 deviceId 的记录，先删除再写入（刷新过期时间）
  if (deviceId) {
    db.delete(trustedDevices)
      .where(and(eq(trustedDevices.userId, userId), eq(trustedDevices.deviceId, deviceId)))
      .run();
  }

  db.insert(trustedDevices).values({
    userId,
    deviceToken: token,
    deviceId: deviceId ?? null,
    deviceName,
    ipAddress,
    expiresAt,
  }).run();

  return token;
}

/**
 * 验证信任设备（双通道）
 *
 * @param userId - 当前登录用户的 ID（用于校验 token/deviceId 归属）
 * @param deviceToken - 浏览器 cookie 中的令牌（可能为空）
 * @param deviceId - 浏览器 localStorage 中的指纹（可能为空）
 * @returns 是否为信任设备
 */
export function verifyTrustedDevice(
  userId: number,
  deviceToken?: string,
  deviceId?: string,
): boolean {
  if (!deviceToken && !deviceId) return false;

  const db = getDb();
  const now = new Date().toISOString();

  const conditions = [];

  if (deviceToken) {
    conditions.push(
      and(
        eq(trustedDevices.userId, userId),
        eq(trustedDevices.deviceToken, deviceToken),
        gt(trustedDevices.expiresAt, now),
      )!,
    );
  }

  if (deviceId) {
    conditions.push(
      and(
        eq(trustedDevices.userId, userId),
        eq(trustedDevices.deviceId, deviceId),
        gt(trustedDevices.expiresAt, now),
      )!,
    );
  }

  const row = db
    .select()
    .from(trustedDevices)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    .get();

  return !!row;
}

/**
 * 清理过期的信任设备令牌
 */
export function cleanExpiredDevices(userId?: number): void {
  const db = getDb();
  const now = new Date().toISOString();

  if (userId) {
    db.delete(trustedDevices)
      .where(and(eq(trustedDevices.userId, userId), lt(trustedDevices.expiresAt, now)))
      .run();
  } else {
    db.delete(trustedDevices)
      .where(lt(trustedDevices.expiresAt, now))
      .run();
  }
}

/**
 * 从 User-Agent 字符串生成简短设备描述
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

  // iOS / Android 优先于 macOS / Linux
  const os = ua.includes('iPhone') || ua.includes('iPad')
    ? 'iOS'
    : ua.includes('Android')
    ? 'Android'
    : ua.includes('Mac')
    ? 'macOS'
    : ua.includes('Windows')
    ? 'Windows'
    : ua.includes('Linux')
    ? 'Linux'
    : 'Unknown';

  return `${browser} / ${os}`;
}
