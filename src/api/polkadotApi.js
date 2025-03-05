const { ApiPromise, WsProvider } = require('@polkadot/api');
const logger = require('../utils/logger');
const ConfigLoader = require('../config/configLoader');

class PolkadotAPI {
    constructor(rpcUrl) {
        this.rpcUrl = rpcUrl;
        this.api = null;
        this.isConnecting = false;
        this.configLoader = new ConfigLoader(process.env.CONFIG_PATH || 'config/config.yaml');
        this.paramResolvers = this.configLoader.getParamResolvers();
    }

    async connect() {
        if (this.api) return;
        if (this.isConnecting) {
            while (this.isConnecting) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }

        try {
            this.isConnecting = true;
            const provider = new WsProvider(this.rpcUrl);
            this.api = await ApiPromise.create({ provider });

            this.api.on('disconnected', () => {
                logger.error('Disconnected from Polkadot node');
                this.api = null;
            });
        } catch (error) {
            logger.error(`Failed to connect to Polkadot node: ${error.message}`);
            throw error;
        } finally {
            this.isConnecting = false;
        }
    }

    async fetchChainName() {
        if (!this.api) await this.connect();
        return (await this.api.rpc.system.chain()).toString().toLowerCase();
    }

    async fetchBlockNumber() {
        if (!this.api) await this.connect();
        const header = await this.api.rpc.chain.getHeader();
        return header.number.toNumber();
    }

    async resolveParam(pallet, paramName) {
        if (!this.api) await this.connect();

        try {
            // If it's a reference to another storage item
            if (this.paramResolvers[pallet]?.[paramName]) {
                const paramValue = await this.api.query[pallet][paramName]();
                const resolver = this.paramResolvers[pallet][paramName];
                return eval(`paramValue.${resolver}`);
            }

            // Otherwise just return the param as is
            return paramName;
        } catch (error) {
            logger.error(`Error resolving parameter: ${paramName} for pallet: ${pallet} - ${error.message}`);
            throw error;
        }
    }

    async fetchMetric(pallet, storageItem, params = []) {
        try {
            if (!this.api) await this.connect();

            // Validate pallet exists
            if (!this.api.query[pallet]) {
                throw new Error(`Pallet ${pallet} not found`);
            }

            const storage = this.api.query[pallet][storageItem];
            if (!storage) {
                throw new Error(`Invalid storage item: ${pallet}.${storageItem}`);
            }

            // Check if there are explicitly defined params in the config
            const hasDefinedParams = params && params.length > 0;

            // Get required param count from metadata
            const meta = storage.creator?.meta;
            let requiredParamCount = 0;

            if (meta) {
                if (meta.type.isDoubleMap) {
                    requiredParamCount = 2;
                } else if (meta.type.isMap) {
                    requiredParamCount = 1;
                } else if (meta.type.isNMap) {
                    requiredParamCount = meta.type.asNMap.keyVec.length;
                }
            }

            logger.debug(`Storage item ${pallet}.${storageItem} requires ${requiredParamCount} params, got ${params.length}`);

            // Special case for staking.claimedRewards with 1 parameter
            if (pallet === 'staking' && storageItem === 'claimedRewards' && params.length === 1) {
                try {
                    logger.debug(`Using special handling for staking.claimedRewards with era ${params[0]}`);

                    // Directly use entries() and filter them
                    const entries = await this.api.query.staking.claimedRewards.entries();
                    logger.debug(`Found ${entries.length} total entries for claimedRewards`);

                    const era = Number(params[0]);
                    const result = {};

                    for (const [key, value] of entries) {
                        try {
                            // Safe access to the arguments using optional chaining and conditional checks
                            if (key && key.args && key.args.length >= 2) {
                                const keyEra = key.args[0].toNumber ? key.args[0].toNumber() : Number(key.args[0]);

                                // Only process keys that match our target era
                                if (keyEra === era) {
                                    const validator = key.args[1].toString();
                                    result[validator] = value.toJSON ? value.toJSON() : value.toString();
                                    logger.debug(`Found match for era ${era}, validator: ${validator}`);
                                }
                            }
                        } catch (err) {
                            logger.warn(`Error processing entry for claimedRewards: ${err.message}`);
                        }
                    }

                    logger.debug(`Found ${Object.keys(result).length} matching entries for era ${era}`);
                    return result;
                } catch (err) {
                    logger.error(`Error in special handling: ${err.stack}`);
                    // Fall back to general approach if special handling fails
                }
            }

            // If no params provided but they're required, fetch all entries
            if (requiredParamCount > 0 && !hasDefinedParams) {
                logger.debug(`Fetching all entries for ${pallet}.${storageItem} (no params provided)`);
                return await this.fetchAllEntries(storage, storageItem);
            }
            // If partial params provided (not enough), use entries() with partial params
            else if (requiredParamCount > params.length && hasDefinedParams) {
                // Most of this code won't run for staking.claimedRewards with 1 parameter
                // due to the special case handling above
                logger.debug(`Fetching entries for ${pallet}.${storageItem} with partial params: ${params}`);

                // We'll use a more generic approach for other storage items
                try {
                    // Resolve the parameters
                    const resolvedParams = await Promise.all(
                        params.map(async param => {
                            if (typeof param === 'string' && this.paramResolvers[pallet]?.[param]) {
                                return await this.resolveParam(pallet, param);
                            }
                            return param;
                        })
                    );

                    // Fallback to fetching all entries and filtering
                    const entries = await this.fetchAllEntries(storage, storageItem);
                    const filteredEntries = {};

                    // Find entries where the first parameter matches
                    Object.keys(entries).forEach(key => {
                        const keyParts = key.split('_');
                        let matches = true;

                        // Check each param we have
                        for (let i = 0; i < resolvedParams.length; i++) {
                            if (String(keyParts[i]) !== String(resolvedParams[i])) {
                                matches = false;
                                break;
                            }
                        }

                        // If all params match, include this entry
                        if (matches) {
                            filteredEntries[key] = entries[key];
                        }
                    });

                    return filteredEntries;
                } catch (err) {
                    logger.error(`Error fetching with partial params: ${err.message}`);
                    throw new Error(`Could not fetch entries with partial parameters: ${err.message}`);
                }
            }
            // If all required params provided, use standard query
            else {
                // Standard case: resolve parameters and fetch single value
                const resolvedParams = await Promise.all(
                    params.map(async param => {
                        if (typeof param === 'string' && this.paramResolvers[pallet]?.[param]) {
                            return await this.resolveParam(pallet, param);
                        }
                        return param;
                    })
                );

                logger.debug(`Fetching ${pallet}.${storageItem} with params: ${JSON.stringify(resolvedParams)}`);
                const result = await storage(...resolvedParams);

                // Add additional logging to debug null/undefined values
                logger.debug(`API response type for ${pallet}.${storageItem}: ${result ? (typeof result) : 'null/undefined'}`);

                // Handle specific return types
                if (result === null || result === undefined) {
                    logger.warn(`Received null/undefined response for ${pallet}.${storageItem}`);
                    return null; // Return null instead of throwing an error
                } else if (storageItem === 'erasRewardPoints') {
                    return result.toJSON();
                } else if (storageItem === 'activeEra') {
                    return result.unwrapOrDefault().index.toNumber();
                } else {
                    // Add explicit null check before calling toJSON
                    if (result.toJSON) {
                        return result.toJSON();
                    } else {
                        logger.warn(`No toJSON method on result for ${pallet}.${storageItem}`);
                        return result.toString ? result.toString() : null;
                    }
                }
            }
        } catch (error) {
            logger.error(`Error fetching metric ${pallet}.${storageItem}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Helper method to fetch all entries for a storage item
     */
    async fetchAllEntries(storage, storageItem) {
        try {
            const entries = await storage.entries();
            if (entries.length === 0) {
                return {};
            }

            // Process and return all entries
            const result = {};
            for (const [key, value] of entries) {
                // Extract the param values from the key
                const paramValues = key.args.map(arg => arg.toString());
                const paramKey = paramValues.join('_');

                // Add to result with the param as key
                if (storageItem === 'erasRewardPoints') {
                    result[paramKey] = value.toJSON();
                } else {
                    const unwrapped = value.unwrapOr ? value.unwrapOr(value) : value;
                    result[paramKey] = unwrapped.toJSON ? unwrapped.toJSON() : unwrapped.toString();
                }
            }

            return result;
        } catch (err) {
            logger.error(`Error fetching all entries: ${err.message}`);
            return {};
        }
    }

    // Helper method to validate metric existence
    async validateMetrics(metrics) {
        if (!this.api) await this.connect();

        for (const palletConfig of metrics) {
            for (const storageItem of palletConfig.storage_items) {
                const { name } = storageItem;
                if (!this.api.query[palletConfig.pallet]) {
                    logger.error(`Invalid pallet: ${palletConfig.pallet}`);
                    continue;
                }

                if (!this.api.query[palletConfig.pallet][name]) {
                    logger.error(`Invalid storage item: ${palletConfig.pallet}.${name}`);
                    logger.info(`Available items for ${palletConfig.pallet}: ${Object.keys(this.api.query[palletConfig.pallet])}`);
                }
            }
        }
    }
}

module.exports = PolkadotAPI;
