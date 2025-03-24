const express = require('express');
const PolkadotAPI = require('../api/polkadotApi');
const MetricsManager = require('../metrics/metricsManager');
const ConfigLoader = require('../config/configLoader');
const logger = require('../utils/logger');

const router = express.Router();
const configLoader = new ConfigLoader(process.env.CONFIG_PATH || 'config/config.yaml');
const rpcConfig = configLoader.getRpcConfig();
const metricsConfig = configLoader.getMetrics();
const backendType = configLoader.getMetricsBackendType();
const influxConfig = configLoader.getInfluxDbConfig();

const polkadotApi = new PolkadotAPI(rpcConfig);
const metricsManager = new MetricsManager(backendType, influxConfig);

// Metric name mappings for better clarity
const METRIC_NAME_MAPPINGS = {
    'currentIndex': 'session_current_index',
    'number': 'current_block_number',
};

// Metric descriptions
const METRIC_DESCRIPTIONS = {
    'session_current_index': 'Current session index',
    'current_block_number': 'Current block number of the chain',
    'chain_info': 'Information about the blockchain',
};

// Validate metrics configuration on startup
(async () => {
    try {
        await polkadotApi.connect();
        await polkadotApi.validateMetrics(metricsConfig);
    } catch (error) {
        logger.error(`Failed to validate metrics: ${error.message}`);
    }
})();

// Define metrics dynamically
metricsConfig.forEach(palletConfig => {
    palletConfig.storage_items.forEach(storageItem => {
        const metricName = METRIC_NAME_MAPPINGS[storageItem.name] || storageItem.name;
        metricsManager.defineMetric(metricName, `${palletConfig.pallet}.${storageItem.name}`, ['chain', 'block_number']);
    });
});

router.get('/metrics', async (req, res) => {
    logger.debug('Metrics endpoint hit');
    try {
        const chainName = await polkadotApi.fetchChainName();
        const blockNumber = await polkadotApi.fetchBlockNumber();

        let metricsOutput = '';

        // Add chain info metric
        metricsOutput += `# HELP chain_info ${METRIC_DESCRIPTIONS.chain_info}\n`;
        metricsOutput += `# TYPE chain_info gauge\n`;
        metricsOutput += `chain_info{chain="${chainName}"} 1\n\n`;

        for (const palletConfig of metricsConfig) {
            for (const storageItem of palletConfig.storage_items) {
                try {
                    const params = storageItem.params || [];
                    const value = await polkadotApi.fetchMetric(
                        palletConfig.pallet,
                        storageItem.name,
                        params
                    );

                    // Skip null/undefined values
                    if (value === null || value === undefined) {
                        logger.warn(`Skipping null/undefined value for ${palletConfig.pallet}.${storageItem.name}`);
                        continue;
                    }

                    // Get the mapped metric name or use original if no mapping exists
                    const metricName = METRIC_NAME_MAPPINGS[storageItem.name] || storageItem.name;
                    const description = METRIC_DESCRIPTIONS[metricName] || `${metricName.replace(/_/g, ' ')}`;

                    // Get the appropriate handler
                    const handler = polkadotApi.getHandler(palletConfig.pallet, storageItem.name);
                    if (!handler) {
                        logger.error(`No handler found for ${palletConfig.pallet}.${storageItem.name}`);
                        continue;
                    }

                    // Format the metric using the handler
                    metricsOutput += `# HELP ${metricName} ${description}\n`;
                    metricsOutput += `# TYPE ${metricName} gauge\n`;
                    metricsOutput += handler.formatMetric(metricName, chainName, value, params);
                    metricsOutput += '\n';
                } catch (err) {
                    logger.error(`Error processing metric ${palletConfig.pallet}.${storageItem.name}: ${err.message}`);
                }
            }
        }

        res.set('Content-Type', 'text/plain');
        res.send(metricsOutput);
    } catch (error) {
        logger.error(`Error fetching metrics: ${error.message}`);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
