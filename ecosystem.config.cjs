// PM2 Ecosystem config to ensure .env is loaded
// Using .cjs extension for CommonJS (PM2 requires CommonJS format)
module.exports = {
  apps: [{
    name: 'gurulink-api',
    script: 'src/index.js',
    cwd: '/var/www/gurulink_api',
    env_file: '.env',
    env: {
      NODE_ENV: 'production'
    },
    // Auto-restart on crash
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    // Logs
    error_file: '/var/log/pm2/gurulink-api-error.log',
    out_file: '/var/log/pm2/gurulink-api-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};











