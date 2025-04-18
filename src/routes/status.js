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
        for (const palletConfig of metricsConfig) {
            for (const storageItem of palletConfig.storage_items) {
                try {
                    const params = storageItem.params || [];
                    const value = await polkadotApi.fetchMetric(
                        palletConfig.pallet,
                        storageItem.name,
                        params
                    );

                    logger.debug(`Processing storage item: ${storageItem.name} with params: ${params}`);

                    // Skip null/undefined values to avoid errors
                    if (value === null || value === undefined) {
                        logger.warn(`Skipping null/undefined value for ${palletConfig.pallet}.${storageItem.name}`);
                        continue;
                    }

                    if (storageItem.name === 'erasRewardPoints' && value.individual) {
                        const eraType = params.includes('activeEra') ? 'activeEra' : 'currentEra';
                        logger.debug(`Detected erasRewardPoints for eraType: ${eraType}`);

                        // Initialize the era object if it doesn't exist
                        if (!metricsData[eraType]) {
                            metricsData[eraType] = {
                                value: {},
                                block_number: blockNumber
                            };
                        }

                        // Store erasRewardPoints under a separate key
                        metricsData[`${eraType}RewardPoints`] = {
                            value: {
                                erasRewardPoints: value
                            },
                            block_number: blockNumber
                        };

                        logger.debug(`Updated metricsData for ${eraType}RewardPoints`);
                    } else if (storageItem.name === 'activeEra' || storageItem.name === 'currentEra') {
                        const eraType = storageItem.name;
                        if (!metricsData[eraType]) {
                            metricsData[eraType] = {
                                value: value,
                                block_number: blockNumber
                            };
                        }
                        logger.debug(`Updated metricsData for ${eraType}`);
                    } else if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0) {
                        // Handle case where we got multiple entries from storage
                        const metricName = `${storageItem.name}_all`;
                        metricsData[metricName] = {
                            value: value,
                            block_number: blockNumber
                        };
                        logger.debug(`Updated metricsData for ${metricName} with multiple entries`);
                    } else {
                        if (!metricsData[storageItem.name]) {
                            metricsData[storageItem.name] = { value, block_number: blockNumber };
                        } else {
                            metricsData[storageItem.name].value = value;
                        }
                        logger.debug(`Updated metricsData for ${storageItem.name}`);
                    }
                } catch (err) {
                    logger.error(`Error processing metric ${palletConfig.pallet}.${storageItem.name}: ${err.message}`);
                    // Continue with next metric instead of failing the entire request
                }
            }
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
