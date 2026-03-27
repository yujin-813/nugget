module.exports = {
  apps: [
    {
      name: 'eve-event-app',
      cwd: '/srv/eve-event-app/current',
      script: 'npm',
      args: 'start',
      env_file: '/srv/eve-event-app/.env.eve',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '700M',
      env: {
        NODE_ENV: 'production',
        PORT: 3100,
      },
    },
  ],
};
