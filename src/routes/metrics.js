const express = require('express');
const PolkadotAPI = require('../api/polkadotApi');
const MetricsManager = require('../metrics/metricsManager');
const ConfigLoader = require('../config/configLoader');
const logger = require('../utils/logger');

const router = express.Router();
const configLoader = new ConfigLoader(process.env.CONFIG_PATH || 'config/config.yaml');
const rpcUrl = configLoader.getRpcUrl();
const metricsConfig = configLoader.getMetrics();
const backendType = configLoader.getMetricsBackendType();
const influxConfig = configLoader.getInfluxDbConfig();

const polkadotApi = new PolkadotAPI(rpcUrl);
const metricsManager = new MetricsManager(backendType, influxConfig);

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
metricsConfig.forEach(metric => {
    metricsManager.defineMetric(metric.name, `${metric.pallet}.${metric.storage_item}`, ['chain', 'block_number']);
});

router.get('/metrics', async (req, res) => {
    console.log('Metrics endpoint hit');
    try {
        const chainName = await polkadotApi.fetchChainName();
        const blockNumber = await polkadotApi.fetchBlockNumber();

        let metricsOutput = '';
        for (const metric of metricsConfig) {
            const params = Array.isArray(metric.params) ? metric.params : [];
            const value = await polkadotApi.fetchMetric(
                metric.pallet,
                metric.storage_item,
                params
            );

            metricsOutput += `# HELP ${metric.name} ${metric.name.replace('_', ' ')}\n`;
            metricsOutput += `# TYPE ${metric.name} gauge\n`;

            if (metric.storage_item === 'erasRewardPoints') {
                for (const [validator, points] of Object.entries(value.individual)) {
                    metricsOutput += `${metric.name}{chain="${chainName}",validator="${validator}"} ${points}\n`;
                }
            } else {
                metricsOutput += `${metric.name}{chain="${chainName}"} ${value}\n`;
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
