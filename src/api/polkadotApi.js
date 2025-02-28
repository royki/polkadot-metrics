const { ApiPromise, WsProvider } = require('@polkadot/api');
const logger = require('../utils/logger');

class PolkadotAPI {
    constructor(rpcUrl) {
        this.rpcUrl = rpcUrl;
        this.api = null;
        this.isConnecting = false;
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

    async resolveParam(paramName) {
        if (!this.api) await this.connect();
        const paramValue = await this.api.query.staking[paramName]();
        if (paramName === 'activeEra') {
            return paramValue.unwrapOrDefault().index.toNumber();
        } else if (paramName === 'currentEra') {
            return paramValue.unwrapOrDefault().toNumber();
        } else {
            throw new Error(`Unable to resolve parameter: ${paramName}`);
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

            // Resolve parameters if they are parameter names
            const resolvedParams = await Promise.all(
                params.map(async param => {
                    if (typeof param === 'string') {
                        return await this.resolveParam(param);
                    }
                    return param;
                })
            );

            logger.debug(`Fetching ${pallet}.${storageItem} with params: ${resolvedParams}`);
            const result = await storage(...resolvedParams);

            // Log the API response for verification
            logger.debug(`API response for ${pallet}.${storageItem}: ${JSON.stringify(result.toJSON())}`);

            // Handle specific return types
            if (storageItem === 'erasRewardPoints') {
                return result.toJSON();
            } else if (storageItem === 'activeEra') {
                return result.unwrapOrDefault().index.toNumber();
            } else {
                return result.toJSON();
            }
        } catch (error) {
            logger.error(`Error fetching metric ${pallet}.${storageItem}: ${error.message}`);
            throw error;
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
