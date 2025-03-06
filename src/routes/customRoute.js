const express = require('express');
const PolkadotAPI = require('../api/polkadotApi');
const ConfigLoader = require('../config/configLoader');
const logger = require('../utils/logger');

const router = express.Router();
const configLoader = new ConfigLoader(process.env.CONFIG_PATH || 'config/config.yaml');
const rpcUrl = configLoader.getRpcUrl();
const metricsConfig = configLoader.getMetrics();

const polkadotApi = new PolkadotAPI(rpcUrl);

// Create dynamic routes based on config.yaml
metricsConfig.forEach(palletConfig => {
    palletConfig.storage_items.forEach(storageItem => {
        const routePath = `/metrics/${palletConfig.pallet}/${storageItem.name}`;
        logger.info(`Creating route: ${routePath}`);

        router.get(routePath, async (req, res) => {
            try {
                const params = storageItem.params || [];
                const value = await polkadotApi.fetchMetric(palletConfig.pallet, storageItem.name, params);

                if (value === null || value === undefined) {
                    res.status(404).send('Metric not found');
                } else {
                    res.json({ value });
                }
            } catch (error) {
                logger.error(`Error fetching metric ${palletConfig.pallet}.${storageItem.name}: ${error.message}`);
                res.status(500).send('Internal Server Error');
            }
        });
    });
});

module.exports = router;
