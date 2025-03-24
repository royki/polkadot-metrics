const express = require('express');
const PolkadotAPI = require('./api/polkadotApi');
const ConfigLoader = require('./config/configLoader');
const logger = require('./utils/logger');
const metricsRouter = require('./routes/metrics');
const statusRouter = require('./routes/status');

async function startServer() {
  try {
    // Load configuration
    const configLoader = new ConfigLoader(process.env.CONFIG_PATH || 'config/config.yaml');
    const serverConfig = configLoader.getServerConfig();
    const rpcConfig = configLoader.getRpcConfig();

    // Initialize API
    const api = new PolkadotAPI(rpcConfig);
    await api.connect();

    // Setup express app
    const app = express();

    // Add routes
    app.use('/', metricsRouter);
    app.use('/', statusRouter);

    // Start server
    const server = app.listen(serverConfig.port, () => {
      logger.info(`Server running on port ${serverConfig.port}`);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM signal received. Starting graceful shutdown...');
      await api.disconnect();
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT signal received. Starting graceful shutdown...');
      await api.disconnect();
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

startServer();
