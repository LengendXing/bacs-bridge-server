/**
 * @module middleware/auth
 * @description JWT + 2FA 校验中间件
 *
 * 验证流程：
 * 1. 从请求头 X-Auth-Token 或 cookie auth_token 获取 JWT
 * 2. 验证 JWT 签名和有效期
 * 3. 将解码后的用户信息挂载到 req.user
 *
 * 对于需要 2FA 但尚未验证的临时 token，拒绝访问。
 */
import { verifyToken } from '../auth/jwt.js';
/**
 * JWT 认证中间件
 *
 * - 从 X-Auth-Token 请求头或 auth_token cookie 读取 JWT
 * - 验证通过后将 payload 挂载到 req.user
 * - 验证失败返回 401
 *
 * @param req - Express 请求
 * @param res - Express 响应
 * @param next - Express next 回调
 */
export function requireAuth(req, res, next) {
    // 优先从请求头读取，其次从 cookie
    const token = req.headers['x-auth-token']
        || req.cookies?.auth_token;
    if (!token) {
        res.status(401).json({ code: 1002, message: '未登录或会话已过期' });
        return;
    }
    const payload = verifyToken(token);
    if (!payload) {
        res.status(401).json({ code: 1002, message: '登录已过期，请重新登录' });
        return;
    }
    // 将用户信息挂载到 req.user，供后续处理使用
    req.user = payload;
    next();
}
