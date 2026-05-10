/**
 * @module auth/totp
 * @description TOTP 两步验证
 *
 * 基于 otplib 实现 TOTP（Time-based One-Time Password），
 * 兼容 Google Authenticator / Microsoft Authenticator 等主流验证器 App。
 *
 * 流程：
 * 1. setupTotp() → 生成密钥 + otpauth:// URI
 * 2. 前端用 URI 生成 QR 码，用户扫码绑定
 * 3. verifyTotp() → 验证用户输入的 6 位数字码
 * 4. generateRecoveryCodes() → 生成一次性恢复码（防丢失认证器）
 */

import { authenticator } from 'otplib';
import crypto from 'crypto';

/** TOTP 配置：6 位数字码，30 秒步长 */
authenticator.options = {
  step: 30,
  window: 1, // 允许前后 1 个时间窗口（共 3 个码有效）
};

/**
 * 生成 TOTP 密钥
 *
 * @returns base32 编码的密钥字符串
 *
 * @example
 * ```ts
 * const secret = generateSecret();
 * // 'JBSWY3DPEHPK3PXP'
 * ```
 */
export function generateSecret(): string {
  return authenticator.generateSecret();
}

/**
 * 构建 otpauth:// URI（用于 QR 码生成）
 *
 * @param secret - TOTP 密钥
 * @param username - 用户名（显示在验证器 App 中）
 * @returns otpauth://totp/... URI
 *
 * @example
 * ```ts
 * const uri = buildOtpAuthUri('JBSWY3DPEHPK3PXP', 'admin');
 * // 'otpauth://totp/FeishuBridge:admin?secret=JBSWY3DPEHPK3PXP&issuer=FeishuBridge'
 * ```
 */
export function buildOtpAuthUri(secret: string, username: string): string {
  const issuer = 'FeishuBridge';
  return authenticator.keyuri(username, issuer, secret);
}

/**
 * 验证 TOTP 码
 *
 * @param token - 用户输入的 6 位验证码
 * @param secret - 该用户的 TOTP 密钥
 * @returns true 表示验证通过
 *
 * @example
 * ```ts
 * const ok = verifyTotp('123456', user.totpSecret);
 * ```
 */
export function verifyTotp(token: string, secret: string): boolean {
  return authenticator.verify({ token, secret });
}

/**
 * 生成恢复码（一次性备用码）
 *
 * 当用户丢失认证器时，可用恢复码代替 TOTP 验证码登录。
 * 每个恢复码使用一次后即失效。
 *
 * @param count - 生成数量，默认 8 个
 * @returns 恢复码数组
 *
 * @example
 * ```ts
 * const codes = generateRecoveryCodes();
 * // ['a1b2-c3d4', 'e5f6-g7h8', ...]
 * ```
 */
export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // 每个恢复码 = 4 组 4 位 hex，用 - 连接
    const part1 = crypto.randomBytes(2).toString('hex');
    const part2 = crypto.randomBytes(2).toString('hex');
    codes.push(`${part1}-${part2}`);
  }
  return codes;
}

/**
 * 验证恢复码是否在列表中（并返回匹配索引，调用方应移除已用码）
 *
 * @param code - 用户输入的恢复码
 * @param recoveryCodes - 存储的恢复码 JSON 数组字符串
 * @returns 匹配的恢复码本身，或 null
 *
 * @example
 * ```ts
 * const matched = verifyRecoveryCode('a1b2-c3d4', user.recoveryCodes);
 * ```
 */
export function verifyRecoveryCode(code: string, recoveryCodes: string): string | null {
  try {
    const codes: string[] = JSON.parse(recoveryCodes);
    const idx = codes.indexOf(code);
    if (idx >= 0) return codes[idx];
    return null;
  } catch {
    return null;
  }
}
