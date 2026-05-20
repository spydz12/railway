module.exports = {
  apps: [
    {
      name: 'ai-trading-os',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1024M',
      env: {
        NODE_ENV: 'production',
      },
      kill_timeout: 10000,
      listen_timeout: 10000,
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
