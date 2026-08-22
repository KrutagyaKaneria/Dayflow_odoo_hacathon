const { createApp } = require('./app');

const config = (() => {
  try {
    return require('./config/db').config;
  } catch (err) {
    console.error(`[dayflow] Configuration error: ${err.message}`);
    process.exit(1);
  }
})();

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(
    `[dayflow] backend listening on port ${config.port} (env: ${config.nodeEnv})`
  );
});

function shutdown(signal) {
  console.log(`[dayflow] ${signal} received, shutting down...`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
