const yaml = require('js-yaml');
const fs = require('fs');
const logger = require('../utils/logger');

class ConfigLoader {
    constructor(configPath) {
        this.configPath = configPath;
        this.config = null;
        this.loadConfig();
    }

    loadConfig() {
        try {
            this.config = yaml.load(fs.readFileSync(this.configPath, 'utf8'));
            this.validateConfig();
        } catch (error) {
            logger.error(`Error loading config: ${error.message}`);
            throw error;
        }
    }

    validateConfig() {
        if (!this.config) {
            throw new Error('Config is empty');
        }

        // Validate blockchain config
        if (!this.config.blockchain) {
            throw new Error('Blockchain configuration is missing');
        }

        if (!this.config.blockchain.rpc_urls || !Array.isArray(this.config.blockchain.rpc_urls)) {
            throw new Error('RPC URLs configuration is missing or invalid');
        }

        // Validate each RPC URL entry
        this.config.blockchain.rpc_urls.forEach((rpcConfig, index) => {
            if (!rpcConfig.url) {
                throw new Error(`RPC URL is missing for entry ${index}`);
            }
            if (typeof rpcConfig.priority !== 'number') {
                logger.warn(`Priority not specified for RPC URL ${rpcConfig.url}, setting default priority ${index + 1}`);
                rpcConfig.priority = index + 1;
            }
        });

        // Set default values for optional blockchain settings
        this.config.blockchain.health_check_interval = this.config.blockchain.health_check_interval || 30;
        this.config.blockchain.switch_threshold = this.config.blockchain.switch_threshold || 3;
        this.config.blockchain.reconnect_interval = this.config.blockchain.reconnect_interval || 5;

        // Validate metrics configuration
        if (!this.config.metrics || !Array.isArray(this.config.metrics)) {
            throw new Error('Metrics configuration is missing or invalid');
        }
    }

    getRpcConfig() {
        return this.config.blockchain;
    }

    getMetrics() {
        return this.config.metrics;
    }

    getMetricsBackendType() {
        return this.config.metrics_backend?.type || 'prometheus';
    }

    getInfluxDbConfig() {
        return this.config.metrics_backend?.influxdb;
    }

    getParamResolvers() {
        return this.config.param_resolvers || {};
    }

    getLoggingConfig() {
        return this.config.logging || {
            level: 'info',
            log_to_file: false
        };
    }

    getServerConfig() {
        return this.config.server || {
            port: 8080
        };
    }
}

module.exports = ConfigLoader;
