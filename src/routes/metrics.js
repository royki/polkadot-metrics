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
metricsConfig.forEach(palletConfig => {
    palletConfig.storage_items.forEach(storageItem => {
        metricsManager.defineMetric(storageItem.name, `${palletConfig.pallet}.${storageItem.name}`, ['chain', 'block_number']);
    });
});

router.get('/metrics', async (req, res) => {
    console.log('Metrics endpoint hit');
    try {
        const chainName = await polkadotApi.fetchChainName();
        const blockNumber = await polkadotApi.fetchBlockNumber();

        let metricsOutput = '';
        for (const palletConfig of metricsConfig) {
            for (const storageItem of palletConfig.storage_items) {
                const params = storageItem.params || [];
                const value = await polkadotApi.fetchMetric(
                    palletConfig.pallet,
                    storageItem.name,
                    params
                );

                metricsOutput += `# HELP ${storageItem.name} ${storageItem.name.replace('_', ' ')}\n`;
                metricsOutput += `# TYPE ${storageItem.name} gauge\n`;

                if (storageItem.name === 'erasRewardPoints') {
                    for (const [validator, points] of Object.entries(value.individual)) {
                        metricsOutput += `${storageItem.name}{chain="${chainName}",validator="${validator}"} ${points}\n`;
                    }
                } else {
                    metricsOutput += `${storageItem.name}{chain="${chainName}"} ${value}\n`;
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
