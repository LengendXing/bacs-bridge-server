import crypto from 'node:crypto';
import config from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(): Buffer {
  const secret = config.jwt.secret;
  if (!secret || secret === 'change_me_in_production') {
    throw new Error('JWT_SECRET 未配置或使用默认值，禁止加密凭据');
  }
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    Buffer.from(secret, 'utf-8'),
    Buffer.from('feishu-bridge-credential-encryption-v1', 'utf-8'),
    Buffer.from('aes-256-gcm-key', 'utf-8'),
    32,
  ));
}

export function encryptCredential(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  let encrypted = cipher.update(plaintext, 'utf-8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted].join(':');
}

export function decryptCredential(encrypted: string): string {
  const key = deriveKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new Error('凭据格式无效');
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(parts[2], 'base64', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}

export function sanitizeMachine(machine: Record<string, any>): Record<string, any> {
  const { password, privateKey, passphrase, ...rest } = machine;
  return {
    ...rest,
    password: undefined,
    privateKey: privateKey ? `${String(privateKey).slice(0, 20)}...` : undefined,
    passphrase: undefined,
    hasPassword: !!password,
    hasPrivateKey: !!privateKey,
    hasPassphrase: !!passphrase,
  };
}
