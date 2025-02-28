const express = require('express');
const PolkadotAPI = require('../api/polkadotApi');
const ConfigLoader = require('../config/configLoader');
const logger = require('../utils/logger');

const router = express.Router();
const configLoader = new ConfigLoader(process.env.CONFIG_PATH || 'config/config.yaml');
const rpcUrl = configLoader.getRpcUrl();
const metricsConfig = configLoader.getMetrics();

const polkadotApi = new PolkadotAPI(rpcUrl);

router.get('/status', async (req, res) => {
    try {
        const chainName = await polkadotApi.fetchChainName();
        const blockNumber = await polkadotApi.fetchBlockNumber();

        const metricsData = {};
        for (const metric of metricsConfig) {
            const params = Array.isArray(metric.params) ? metric.params : [];
            const value = await polkadotApi.fetchMetric(
                metric.pallet,
                metric.storage_item,
                params
            );
            metricsData[metric.name] = { value, block_number: blockNumber };
        }

        res.json({
            timestamp: new Date().toISOString(),
            chain: chainName,
            block_number: blockNumber,
            metrics: metricsData,
        });
    } catch (error) {
        logger.error(`Error fetching status: ${error.message}`);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
