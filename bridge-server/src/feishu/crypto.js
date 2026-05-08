const crypto = require('crypto');
const config = require('../config').load();

// 验证飞书请求签名
function verify(req) {
  const conf = config.feishu;
  // 开发阶段未配置 secret 时跳过验证
  if (!conf.app_secret) return true;

  const timestamp = req.headers['x-lark-request-timestamp'];
  const nonce = req.headers['x-lark-request-nonce'];
  const signature = req.headers['x-lark-signature'];
  const body = JSON.stringify(req.body);

  if (!timestamp || !nonce || !signature) return false;

  const raw = `${timestamp}${nonce}${body}`;
  const expected = crypto.createHmac('sha256', conf.app_secret).update(raw).digest('base64');
  return signature === expected;
}

// 处理飞书 URL 验证请求
function handleChallenge(body) {
  if (body.challenge) {
    return { challenge: body.challenge };
  }
  return null;
}

// 解密飞书加密消息
function decrypt(encryptBody) {
  const conf = config.feishu;
  if (!conf.encrypt_key) return encryptBody; // 未配置加密，直接返回

  try {
    const data = JSON.parse(encryptBody);
    if (!data.encrypt) return data;

    const key = Buffer.from(conf.encrypt_key, 'utf-8');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, key.slice(0, 16));
    let decrypted = decipher.update(data.encrypt, 'base64', 'utf-8');
    decrypted += decipher.final('utf-8');
    return JSON.parse(decrypted);
  } catch {
    return encryptBody;
  }
}

module.exports = { verify, handleChallenge, decrypt };
