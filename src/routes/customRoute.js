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
        let routePath = `/metrics/${palletConfig.pallet}/${storageItem.name}`;

        // Generate route parameters if storage item has params
        if (storageItem.params && storageItem.params.length > 0) {
            const paramPlaceholders = storageItem.params.map(param => `:${param}`).join('/');
            routePath += `/${paramPlaceholders}`;
        }

        logger.info(`Creating route: ${routePath}`);

        router.get(routePath, async (req, res) => {
            try {
                // Extract parameters from the route in the order specified in config
                const params = storageItem.params
                    ? storageItem.params.map(param => req.params[param])
                    : [];

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
