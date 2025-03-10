const { ApiPromise, WsProvider } = require('@polkadot/api');
const logger = require('../utils/logger');
const ConfigLoader = require('../config/configLoader');
const HandlerFactory = require('../handlers/HandlerFactory');

class PolkadotAPI {
    constructor(rpcUrl) {
        this.rpcUrl = rpcUrl;
        this.api = null;
        this.isConnecting = false;
        this.configLoader = new ConfigLoader(process.env.CONFIG_PATH || 'config/config.yaml');
        this.paramResolvers = this.configLoader.getParamResolvers();
        this.handlerFactory = null; // Will be initialized after API connection
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
                this.handlerFactory = null; // Reset handlerFactory when disconnected
            });

            // Initialize handler factory after connection
            logger.debug('Initializing HandlerFactory');
            this.handlerFactory = new HandlerFactory(this.api);
            logger.debug('HandlerFactory initialized successfully');
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

            // Ensure handlerFactory is initialized
            if (!this.handlerFactory) {
                logger.debug('HandlerFactory not initialized, initializing now');
                this.handlerFactory = new HandlerFactory(this.api);
            }

            // Validate pallet and storage item
            if (!this.api.query[pallet]) {
                throw new Error(`Pallet ${pallet} not found`);
            }

            const storage = this.api.query[pallet][storageItem];
            if (!storage) {
                throw new Error(`Invalid storage item: ${pallet}.${storageItem}`);
            }

            // Resolve any parameter references
            const resolvedParams = await Promise.all(
                params.map(async param => {
                    if (typeof param === 'string' && this.paramResolvers[pallet]?.[param]) {
                        return await this.resolveParam(pallet, param);
                    }
                    return param;
                })
            );

            // Get the appropriate handler and fetch data
            const meta = storage.creator?.meta;

            // Debug logging to troubleshoot handler factory issues
            logger.debug(`Getting handler for ${pallet}.${storageItem}`);
            logger.debug(`HandlerFactory exists: ${!!this.handlerFactory}`);

            const handler = this.handlerFactory.getHandler(pallet, storageItem, meta);
            logger.debug(`Handler acquired: ${handler.constructor.name}`);

            return await handler.fetchData(pallet, storageItem, resolvedParams, meta);
        } catch (error) {
            logger.error(`Error fetching metric ${pallet}.${storageItem}: ${error.message}`);

            // Fallback to old implementation if handler approach fails
            if (error.message.includes('getHandler is not a function')) {
                logger.warn(`Falling back to direct query for ${pallet}.${storageItem}`);
                try {
                    const storage = this.api.query[pallet][storageItem];
                    if (params && params.length > 0) {
                        const result = await storage(...params);
                        return result.toJSON ? result.toJSON() : result.toString();
                    } else {
                        const result = await storage();
                        return result.toJSON ? result.toJSON() : result.toString();
                    }
                } catch (fallbackError) {
                    logger.error(`Fallback also failed: ${fallbackError.message}`);
                    throw fallbackError;
                }
            } else {
                throw error;
            }
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
