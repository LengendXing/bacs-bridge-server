const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const configPath = path.join(__dirname, '..', 'config.yaml');

function load() {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const config = yaml.load(raw);

  if (process.env.BRIDGE_PORT) config.server.port = parseInt(process.env.BRIDGE_PORT, 10);
  if (process.env.ADMIN_PASSWORD) config.server.admin_password = process.env.ADMIN_PASSWORD;
  if (process.env.BRIDGE_PROGRESS_INTERVAL) config.bridge.progress_interval = parseInt(process.env.BRIDGE_PROGRESS_INTERVAL, 10);
  if (process.env.BRIDGE_TIMEOUT) config.bridge.timeout = parseInt(process.env.BRIDGE_TIMEOUT, 10);
  if (process.env.BRIDGE_MAX_CONCURRENT) config.bridge.max_concurrent = parseInt(process.env.BRIDGE_MAX_CONCURRENT, 10);

  return config;
}

module.exports = { load };
