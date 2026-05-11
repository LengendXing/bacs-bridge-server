/**
 * @module auth/jwt
 * @description JWT 令牌签发与验证
 *
 * 使用 jsonwebtoken 库签发 HS256 JWT。
 * secret 从环境变量 JWT_SECRET 读取，不硬编码。
 */

import jwt from 'jsonwebtoken';
import config from '../config.js';

/** JWT payload 结构 */
export interface JwtPayload {
  /** 用户 ID */
  sub: number;
  /** 用户名 */
  username: string;
}

/**
 * 签发 JWT 令牌
 *
 * @param payload - 用户信息（id + username）
 * @returns 签名后的 JWT 字符串
 *
 * @example
 * ```ts
 * const token = signToken({ sub: 1, username: 'admin' });
 * ```
 */
export function signToken(payload: JwtPayload, expiresIn?: string | number): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opts: any = { expiresIn: expiresIn ?? config.jwt.expiresIn };
  return jwt.sign(payload as object, config.jwt.secret, opts);
}

/**
 * 验证 JWT 令牌
 *
 * @param token - 待验证的 JWT 字符串
 * @returns 解码后的 payload，或 null（令牌无效/过期）
 *
 * @example
 * ```ts
 * const payload = verifyToken(token);
 * if (payload) { console.log(payload.username); }
 * ```
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as unknown as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}
