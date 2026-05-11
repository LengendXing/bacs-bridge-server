/**
 * @module auth/password
 * @description 密码哈希与验证
 *
 * 使用 bcrypt 对密码进行哈希处理，cost factor 默认 12。
 * bcrypt 自带 salt，无需单独生成。
 */
import bcrypt from 'bcrypt';
/** bcrypt cost factor（越高越安全，但越慢） */
const SALT_ROUNDS = 12;
/**
 * 对明文密码进行哈希
 *
 * @param plainText - 用户输入的明文密码
 * @returns bcrypt 哈希字符串
 *
 * @example
 * ```ts
 * const hash = await hashPassword('my-secret');
 * // $2b$12$xxxx...
 * ```
 */
export async function hashPassword(plainText) {
    return bcrypt.hash(plainText, SALT_ROUNDS);
}
/**
 * 验证明文密码是否匹配哈希
 *
 * @param plainText - 用户输入的明文密码
 * @param hash - 数据库中存储的 bcrypt 哈希
 * @returns true 表示密码正确
 *
 * @example
 * ```ts
 * const ok = await verifyPassword('my-secret', storedHash);
 * ```
 */
export async function verifyPassword(plainText, hash) {
    return bcrypt.compare(plainText, hash);
}
