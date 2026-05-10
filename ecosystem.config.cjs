/**
 * PM2 部署配置
 *
 * 使用方式:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup   # 注册开机自启
 */
module.exports = {
  apps: [
    {
      name: 'feishu-bridge',
      script: 'src/server/index.ts',
      interpreter: 'node_modules/.bin/tsx',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        BRIDGE_PORT: 3456,
      },
      // 日志配置
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      // 监听文件变化（生产环境关闭）
      watch: false,
      // 优雅退出
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
