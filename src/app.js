const express = require('express');
const ConfigLoader = require('./config/configLoader');
const metricsRouter = require('./routes/metrics');
const statusRouter = require('./routes/status');
const logger = require('./utils/logger');

// Get the configuration file path from command-line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('Error: Configuration file path is required.');
    console.error('Usage: node src/app.js <path-to-config-file>');
    process.exit(1);
}
const configPath = args[0];

// Load configuration
const configLoader = new ConfigLoader(configPath);
const PORT = configLoader.getServerPort();

// Initialize Express app
const app = express();
app.use(express.json());
app.use('/', statusRouter);  // Changed from /status
app.use('/', metricsRouter); // Changed from /metrics

// Add error handling middleware
app.use((err, req, res, next) => {
    logger.error(`Error handling request: ${err.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
});

// Start the server
app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});

process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled Rejection: ${reason}`);
    process.exit(1);
});
