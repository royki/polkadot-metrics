const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

class ConfigLoader {
    constructor(configPath) {
        this.config = this.loadConfig(configPath);
    }

    loadConfig(configPath) {
        try {
            // Resolve the absolute path to the config file
            const resolvedPath = path.resolve(configPath);

            // Check if the file exists
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`Configuration file not found at: ${resolvedPath}`);
            }

            // Load the YAML/YML file
            const fileContent = fs.readFileSync(resolvedPath, 'utf8');
            return yaml.load(fileContent);
        } catch (e) {
            throw new Error(`Failed to load configuration: ${e.message}`);
        }
    }

    getServerPort() {
        return this.config.server.port;
    }

    getRpcUrl() {
        return this.config.blockchain.rpc_url;
    }

    getMetricsBackendType() {
        return this.config.metrics_backend.type;
    }

    getInfluxDbConfig() {
        return this.config.metrics_backend.influxdb;
    }

    getMetrics() {
        return this.config.metrics;
    }

    getLoggingConfig() {
        return this.config.logging;
    }

    validateConfig(config) {
        const requiredFields = ['server', 'blockchain', 'metrics_backend', 'metrics', 'logging'];
        for (const field of requiredFields) {
            if (!config[field]) {
                throw new Error(`Missing required configuration field: ${field}`);
            }
        }
    }
}

module.exports = ConfigLoader;
