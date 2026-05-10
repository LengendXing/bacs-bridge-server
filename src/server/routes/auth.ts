/**
 * @module routes/auth
 * @description 认证路由（登录 / 登出 / 2FA 设置 / 2FA 验证 / 密码修改）
 *
 * 登录流程：
 * 1. POST /api/auth/login → 账号密码校验 → 未开启 2FA 直接返回 JWT
 * 2. 已开启 2FA → 返回 { require2fa: true, tempToken }
 * 3. POST /api/auth/2fa/verify → 验证 TOTP 码 → 返回 JWT
 * 4. 信任设备 cookie → 可跳过 2FA
 */

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { users, trustedDevices } from '../db/schema.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signToken, verifyToken, type JwtPayload } from '../auth/jwt.js';
import { generateSecret, buildOtpAuthUri, verifyTotp, generateRecoveryCodes, verifyRecoveryCode } from '../auth/totp.js';
import { createTrustedDevice, verifyTrustedDevice, cleanExpiredDevices, describeUserAgent } from '../auth/trusted-device.js';
import { requireAuth } from '../middleware/auth.js';
import logger from '../middleware/logger.js';

const router = Router();

/**
 * POST /api/auth/login
 *
 * 登录接口：
 * - 验证账号密码
 * - 检查信任设备 cookie（可跳过 2FA）
 * - 未开启 2FA → 直接返回 JWT
 * - 已开启 2FA → 返回临时 token，等待 2FA 验证
 */
router.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ code: 1003, message: '请输入账号和密码' });
  }

  try {
    const db = getDb();

    // 查找用户
    const user = db.select().from(users).where(eq(users.username, username)).get();
    if (!user) {
      return res.json({ code: 1002, message: '账号或密码错误' });
    }

    // 验证密码
    const passwordOk = await verifyPassword(password, user.passwordHash);
    if (!passwordOk) {
      return res.json({ code: 1002, message: '账号或密码错误' });
    }

    // 清理过期信任设备
    cleanExpiredDevices(user.id);

    // 检查信任设备 cookie
    const deviceToken = req.cookies?.trusted_device;
    if (deviceToken) {
      const trustedUserId = verifyTrustedDevice(deviceToken);
      if (trustedUserId === user.id) {
        // 信任设备，跳过 2FA
        const jwt = signToken({ sub: user.id, username: user.username });
        logger.log('info', `用户 ${username} 登录（信任设备跳过 2FA）`);
        return res.json({ code: 0, data: { token: jwt, require2fa: false } });
      }
    }

    // 未开启 2FA → 直接返回 JWT
    if (!user.totpEnabled) {
      const jwt = signToken({ sub: user.id, username: user.username });
      logger.log('info', `用户 ${username} 登录`);
      return res.json({ code: 0, data: { token: jwt, require2fa: false } });
    }

    // 已开启 2FA → 返回临时 token
    const tempToken = signToken({ sub: user.id, username: `${username}:2fa-pending` });
    logger.log('info', `用户 ${username} 登录，等待 2FA 验证`);
    res.json({ code: 0, data: { require2fa: true, tempToken } });
  } catch (e: any) {
    logger.log('error', '登录失败', e.message);
    res.json({ code: 1001, message: '登录失败' });
  }
});

/**
 * POST /api/auth/2fa/verify
 *
 * 2FA 验证接口：
 * - 验证临时 token
 * - 校验 TOTP 6 位验证码（或恢复码）
 * - 可选：信任此设备（写入 cookie）
 * - 返回正式 JWT
 */
router.post('/api/auth/2fa/verify', async (req, res) => {
  const { tempToken, code, trustDevice } = req.body;

  if (!tempToken || !code) {
    return res.json({ code: 1003, message: '缺少临时令牌或验证码' });
  }

  try {
    // 验证临时 token
    const payload = verifyToken(tempToken);
    if (!payload || !payload.username.endsWith(':2fa-pending')) {
      return res.json({ code: 1002, message: '临时令牌无效或已过期' });
    }

    const username = payload.username.replace(':2fa-pending', '');
    const db = getDb();

    // 查找用户
    const user = db.select().from(users).where(eq(users.username, username)).get();
    if (!user || !user.totpSecret) {
      return res.json({ code: 1002, message: '用户不存在或未启用 2FA' });
    }

    // 先尝试 TOTP 验证码
    let verified = verifyTotp(code, user.totpSecret);

    // TOTP 失败 → 尝试恢复码
    let usedRecoveryCode = false;
    if (!verified && user.recoveryCodes) {
      const matched = verifyRecoveryCode(code, user.recoveryCodes);
      if (matched) {
        verified = true;
        usedRecoveryCode = true;
        // 移除已用的恢复码
        const codes: string[] = JSON.parse(user.recoveryCodes);
        const idx = codes.indexOf(matched);
        if (idx >= 0) {
          codes.splice(idx, 1);
          db.update(users)
            .set({ recoveryCodes: JSON.stringify(codes), updatedAt: new Date().toISOString() })
            .where(eq(users.id, user.id))
            .run();
        }
      }
    }

    if (!verified) {
      return res.json({ code: 1002, message: '验证码错误' });
    }

    // 签发正式 JWT
    const jwt = signToken({ sub: user.id, username: user.username });

    // 信任设备
    if (trustDevice) {
      const ua = req.headers['user-agent'] || 'Unknown';
      const ip = req.ip || '';
      const deviceToken = await createTrustedDevice(
        user.id,
        describeUserAgent(ua),
        ip,
      );
      // 设置 cookie，30 天有效
      res.cookie('trusted_device', deviceToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'lax',
      });
    }

    logger.log('info', `用户 ${username} 2FA 验证通过${usedRecoveryCode ? '（恢复码）' : ''}`);
    res.json({ code: 0, data: { token: jwt } });
  } catch (e: any) {
    logger.log('error', '2FA 验证失败', e.message);
    res.json({ code: 1001, message: '验证失败' });
  }
});

/**
 * POST /api/auth/logout
 *
 * 登出接口：清除信任设备 cookie
 */
router.post('/api/auth/logout', (req, res) => {
  res.clearCookie('trusted_device');
  res.json({ code: 0, message: '已退出' });
});

/**
 * GET /api/auth/2fa/setup
 *
 * 2FA 设置接口（需登录）：
 * - 生成 TOTP 密钥
 * - 返回 otpauth:// URI（前端生成 QR 码）
 * - 密钥暂存用户记录，未启用前不影响登录
 */
router.get('/api/auth/2fa/setup', requireAuth, (req, res) => {
  const userId = req.user!.sub;
  const db = getDb();

  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    return res.json({ code: 1004, message: '用户不存在' });
  }

  // 生成新密钥
  const secret = generateSecret();
  const qrUrl = buildOtpAuthUri(secret, user.username);

  // 暂存密钥（不启用，等用户确认验证码后才启用）
  db.update(users)
    .set({ totpSecret: secret, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .run();

  logger.log('info', `用户 ${user.username} 开始 2FA 设置`);
  res.json({ code: 0, data: { qrUrl, secret } });
});

/**
 * POST /api/auth/2fa/enable
 *
 * 启用 2FA（需登录）：
 * - 验证用户输入的第一个 TOTP 码
 * - 通过 → 启用 totpEnabled + 生成恢复码
 * - 同时信任当前设备
 */
router.post('/api/auth/2fa/enable', requireAuth, (req, res) => {
  const userId = req.user!.sub;
  const { code } = req.body;

  if (!code) {
    return res.json({ code: 1003, message: '请输入验证码' });
  }

  const db = getDb();
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || !user.totpSecret) {
    return res.json({ code: 1004, message: '请先调用 /api/auth/2fa/setup 生成密钥' });
  }

  // 验证 TOTP 码
  if (!verifyTotp(code, user.totpSecret)) {
    return res.json({ code: 1002, message: '验证码错误，请重试' });
  }

  // 生成恢复码
  const recoveryCodes = generateRecoveryCodes();

  // 启用 2FA
  db.update(users)
    .set({
      totpEnabled: true,
      recoveryCodes: JSON.stringify(recoveryCodes),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId))
    .run();

  // 信任当前设备
  const ua = req.headers['user-agent'] || 'Unknown';
  const ip = req.ip || '';
  createTrustedDevice(userId, describeUserAgent(ua), ip)
    .then(deviceToken => {
      res.cookie('trusted_device', deviceToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'lax',
      });
    })
    .catch(() => { /* 非关键 */ });

  logger.log('info', `用户 ${user.username} 启用 2FA`);
  res.json({ code: 0, data: { recoveryCodes } });
});

/**
 * POST /api/auth/2fa/disable
 *
 * 禁用 2FA（需登录 + 验证当前密码）
 */
router.post('/api/auth/2fa/disable', requireAuth, async (req, res) => {
  const userId = req.user!.sub;
  const { password } = req.body;

  if (!password) {
    return res.json({ code: 1003, message: '请输入密码确认' });
  }

  const db = getDb();
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    return res.json({ code: 1004, message: '用户不存在' });
  }

  // 验证密码
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return res.json({ code: 1002, message: '密码错误' });
  }

  // 禁用 2FA
  db.update(users)
    .set({
      totpEnabled: false,
      totpSecret: null,
      recoveryCodes: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId))
    .run();

  logger.log('info', `用户 ${user.username} 禁用 2FA`);
  res.json({ code: 0, message: '已禁用两步验证' });
});

/**
 * GET /api/auth/2fa/status
 *
 * 查询当前用户的 2FA 状态
 */
router.get('/api/auth/2fa/status', requireAuth, (req, res) => {
  const userId = req.user!.sub;
  const db = getDb();

  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    return res.json({ code: 1004, message: '用户不存在' });
  }

  res.json({ code: 0, data: { enabled: !!user.totpEnabled } });
});

/**
 * POST /api/auth/change-password
 *
 * 修改密码（需登录 + 验证旧密码）
 */
router.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const userId = req.user!.sub;
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.json({ code: 1003, message: '请输入旧密码和新密码' });
  }

  if (newPassword.length < 6) {
    return res.json({ code: 1003, message: '新密码至少 6 位' });
  }

  const db = getDb();
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    return res.json({ code: 1004, message: '用户不存在' });
  }

  // 验证旧密码
  const ok = await verifyPassword(oldPassword, user.passwordHash);
  if (!ok) {
    return res.json({ code: 1002, message: '旧密码错误' });
  }

  // 哈希新密码
  const newHash = await hashPassword(newPassword);
  db.update(users)
    .set({ passwordHash: newHash, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .run();

  logger.log('info', `用户 ${user.username} 修改密码`);
  res.json({ code: 0, message: '密码已修改' });
});

export default router;
