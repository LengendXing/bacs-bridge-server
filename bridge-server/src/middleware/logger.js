const fs = require('fs');
const path = require('path');
const config = require('../config').load();

const LOG_DIR = path.join(__dirname, '..', '..', config.logging.dir);

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logStream = fs.createWriteStream(
  path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.log`),
  { flags: 'a' }
);

function log(level, message, data) {
  const ts = new Date().toISOString();
  const entry = JSON.stringify({ ts, level, message, data }) + '\n';
  logStream.write(entry);
  if (config.logging.level === 'debug') {
    console.log(`[${ts}] [${level}] ${message}`, data || '');
  }
}

function middleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    log('info', `${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`, {
      ip: req.ip,
      query: req.query,
      body: req.path === '/webhook/feishu' ? '(feishu payload)' : req.body
    });
  });
  next();
}

module.exports = { log, middleware };
