/**
 * PM2 部署配置
 *
 * 运行在 deploy/ 目录中，所有路径相对于 deploy/
 */
module.exports = {
  apps: [
    {
      name: 'bacs-bridge-server',
      script: 'dist/server/index.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        BRIDGE_PORT: 3456,
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      watch: false,
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
