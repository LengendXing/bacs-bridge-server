const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const configPath = path.join(__dirname, '..', 'config.yaml');

function load() {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const config = yaml.load(raw);

  // 环境变量覆盖
  if (process.env.BRIDGE_PORT) config.server.port = parseInt(process.env.BRIDGE_PORT, 10);
  if (process.env.FEISHU_APP_ID) config.feishu.app_id = process.env.FEISHU_APP_ID;
  if (process.env.FEISHU_APP_SECRET) config.feishu.app_secret = process.env.FEISHU_APP_SECRET;
  if (process.env.FEISHU_ENCRYPT_KEY) config.feishu.encrypt_key = process.env.FEISHU_ENCRYPT_KEY;
  if (process.env.FEISHU_VERIFICATION_TOKEN) config.feishu.verification_token = process.env.FEISHU_VERIFICATION_TOKEN;
  if (process.env.BRIDGE_PROGRESS_INTERVAL) config.bridge.progress_interval = parseInt(process.env.BRIDGE_PROGRESS_INTERVAL, 10);
  if (process.env.BRIDGE_TIMEOUT) config.bridge.timeout = parseInt(process.env.BRIDGE_TIMEOUT, 10);
  if (process.env.BRIDGE_MAX_CONCURRENT) config.bridge.max_concurrent = parseInt(process.env.BRIDGE_MAX_CONCURRENT, 10);

  return config;
}

module.exports = { load };
