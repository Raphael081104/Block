module.exports = {
  apps: [
    {
      name: "block-bot",
      script: "src/bot.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "2G",
      env: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "logs/error.log",
      out_file: "logs/out.log",
      merge_logs: true,
      restart_delay: 5000,
      max_restarts: 50,
    },
  ],
};
