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
                throw new Error(`Storage item ${pallet}.${storageItem} not found`);
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

        for (const metric of metrics) {
            const { pallet, storage_item } = metric;
            if (!this.api.query[pallet]) {
                logger.error(`Invalid pallet: ${pallet}`);
                continue;
            }

            if (!this.api.query[pallet][storage_item]) {
                logger.error(`Invalid storage item: ${pallet}.${storage_item}`);
                logger.info(`Available items for ${pallet}: ${Object.keys(this.api.query[pallet])}`);
            }
        }
    }
}

module.exports = PolkadotAPI;
