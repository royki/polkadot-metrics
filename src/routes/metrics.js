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
                const params = storageItem.params || [];

                try {
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

                    // Special handling for bounties to ensure consistent format
                    if (palletConfig.pallet === 'bounties' && storageItem.name === 'bounties') {
                        // Get the base metric name
                        const baseMetric = METRIC_NAME_MAPPINGS[storageItem.name] || storageItem.name;

                        // Add metric information headers
                        metricsOutput += `# HELP ${baseMetric} Bounty data\n`;
                        metricsOutput += `# TYPE ${baseMetric} gauge\n`;

                        // For single bounty or multiple bounties, format consistently
                        if (typeof value === 'object' && value !== null) {
                            // Case 1: It's a single bounty object with direct query
                            if (value.proposer && params.length > 0) {
                                // When a bounty ID is provided directly, use that ID
                                const bountyId = params[0];

                                // Process each property of the bounty
                                for (const [prop, propValue] of Object.entries(value)) {
                                    // Special handling for status which is a nested object
                                    if (prop === 'status' && typeof propValue === 'object') {
                                        metricsOutput += `${baseMetric}_status{chain="${chainName}",bounty_id="${bountyId}"} ${JSON.stringify(propValue)}\n`;
                                    } else if (typeof propValue !== 'object' || propValue === null) {
                                        metricsOutput += `${baseMetric}_${prop}{chain="${chainName}",bounty_id="${bountyId}"} ${propValue}\n`;
                                    } else {
                                        metricsOutput += `${baseMetric}_${prop}{chain="${chainName}",bounty_id="${bountyId}"} ${JSON.stringify(propValue)}\n`;
                                    }
                                }
                            }
                            // Case 2: It's a collection of bounties (no direct bounty ID query)
                            else {
                                // Check if this is the collection format (object with numeric keys)
                                const hasNumericKeys = Object.keys(value).some(key => !isNaN(parseInt(key)));

                                if (hasNumericKeys) {
                                    // Process as collection of bounties
                                    for (const [bountyId, bountyData] of Object.entries(value)) {
                                        if (typeof bountyData === 'object' && bountyData !== null) {
                                            // For each bounty property, output a separate metric
                                            for (const [prop, propValue] of Object.entries(bountyData)) {
                                                if (typeof propValue !== 'object' || propValue === null) {
                                                    metricsOutput += `${baseMetric}_${prop}{chain="${chainName}",bounty_id="${bountyId}"} ${propValue}\n`;
                                                } else {
                                                    metricsOutput += `${baseMetric}_${prop}{chain="${chainName}",bounty_id="${bountyId}"} ${JSON.stringify(propValue)}\n`;
                                                }
                                            }
                                        }
                                    }
                                }
                                // Case 3: It's a single bounty in the old format (direct properties)
                                else if (value.proposer) {
                                    const bountyId = params.length > 0 ? params[0] : "unknown";
                                    for (const [prop, propValue] of Object.entries(value)) {
                                        if (typeof propValue !== 'object' || propValue === null) {
                                            metricsOutput += `${baseMetric}_${prop}{chain="${chainName}",bounty_id="${bountyId}"} ${propValue}\n`;
                                        } else {
                                            metricsOutput += `${baseMetric}_${prop}{chain="${chainName}",bounty_id="${bountyId}"} ${JSON.stringify(propValue)}\n`;
                                        }
                                    }
                                }
                            }
                        }

                        metricsOutput += '\n'; // Add spacing after all bounty metrics
                        continue; // Skip the default processing
                    }

                    // Get the mapped metric name or use original if no mapping exists
                    const metricName = METRIC_NAME_MAPPINGS[storageItem.name] || storageItem.name;
                    const description = METRIC_DESCRIPTIONS[metricName] || `${metricName.replace(/_/g, ' ')}`;

                    metricsOutput += `# HELP ${metricName} ${description}\n`;
                    metricsOutput += `# TYPE ${metricName} gauge\n`;

                    if (storageItem.name === 'erasRewardPoints' && value.individual) {
                        const eraType = params.includes('activeEra') ? 'activeEra' : 'currentEra';
                        logger.debug(`Evaluating erasRewardPoints for ${eraType}`);
                        for (const [validator, points] of Object.entries(value.individual)) {
                            metricsOutput += `${metricName}{chain="${chainName}",era="${eraType}",validator="${validator}"} ${points}\n`;
                        }
                    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                        // Handle case where we got multiple entries from storage with params
                        // Make sure value is a non-null object before calling Object.entries
                        try {
                            const entries = Object.entries(value);
                            logger.debug(`Processing object with ${entries.length} entries for ${palletConfig.pallet}.${storageItem.name}`);

                            for (const [paramKey, paramValue] of entries) {
                                // Additional null checks for paramValue
                                const formattedValue = paramValue === null || paramValue === undefined
                                    ? "null"
                                    : typeof paramValue === 'object'
                                        ? JSON.stringify(paramValue)
                                        : paramValue;

                                metricsOutput += `${metricName}{chain="${chainName}",param="${paramKey}"} ${formattedValue}\n`;
                            }
                        } catch (err) {
                            logger.error(`Error processing object entries for ${palletConfig.pallet}.${storageItem.name}: ${err.message}`);
                            // Fallback to simpler representation
                            metricsOutput += `${metricName}{chain="${chainName}"} ${JSON.stringify(value)}\n`;
                        }
                    } else if (Array.isArray(value)) {
                        // Handle array values
                        logger.debug(`Processing array with ${value.length} items for ${palletConfig.pallet}.${storageItem.name}`);
                        metricsOutput += `${metricName}{chain="${chainName}"} ${JSON.stringify(value)}\n`;
                    } else {
                        // Simple scalar value
                        metricsOutput += `${metricName}{chain="${chainName}"} ${value}\n`;
                    }

                    metricsOutput += '\n'; // Add spacing between metrics
                } catch (error) {
                    logger.error(`Error processing metric ${palletConfig.pallet}.${storageItem.name}: ${error.message}`);
                    // Continue with the next metric instead of failing the entire request
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
