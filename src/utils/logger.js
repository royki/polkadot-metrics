const winston = require('winston');
const { combine, timestamp, printf } = winston.format;
const ConfigLoader = require('../config/configLoader');

// Load configuration
const configPath = process.env.CONFIG_PATH || 'config/config.yaml';
const configLoader = new ConfigLoader(configPath);
const loggingConfig = configLoader.getLoggingConfig();

const logger = winston.createLogger({
    level: loggingConfig.level, // Dynamically load log level
    format: combine(
        timestamp(),
        printf(({ level, message, timestamp }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        ...(loggingConfig.log_to_file
            ? [
                new winston.transports.File({ filename: loggingConfig.log_file }),
                new winston.transports.File({ filename: loggingConfig.error_log_file, level: 'error' }),
            ]
            : []),
    ],
});

module.exports = logger;
