const { ApiPromise, WsProvider } = require('@polkadot/api');
const logger = require('../utils/logger');
const RPCManager = require('./rpcManager');
const SimpleStorageHandler = require('../handlers/SimpleStorageHandler');
const MapStorageHandler = require('../handlers/MapStorageHandler');

class PolkadotAPI {
    constructor(rpcConfig) {
        this.rpcManager = new RPCManager(rpcConfig);
        this.handlers = [
            new SimpleStorageHandler(),
            new MapStorageHandler()
        ];
        this.chainName = null;
    }

    async connect() {
        try {
            const api = await this.rpcManager.initialize();

            // Initialize handlers with the API
            for (const handler of this.handlers) {
                handler.setApi(api);
            }

            // Get chain name once at startup
            const chain = await api.rpc.system.chain();
            this.chainName = chain.toString();

            logger.info(`Connected to chain: ${this.chainName}`);
            return true;
        } catch (err) {
            logger.error(`Failed to connect to blockchain: ${err.message}`);
            throw err;
        }
    }

    async disconnect() {
        await this.rpcManager.disconnect();
    }

    async getApi() {
        return await this.rpcManager.getCurrentApi();
    }

    async fetchChainName() {
        if (this.chainName) return this.chainName;

        return await this.rpcManager.executeWithFailover(async (api) => {
            const chain = await api.rpc.system.chain();
            this.chainName = chain.toString();
            return this.chainName;
        });
    }

    async fetchBlockNumber() {
        return await this.rpcManager.executeWithFailover(async (api) => {
            const header = await api.rpc.chain.getHeader();
            return header.number.toNumber();
        });
    }

    async validateMetrics(metricsConfig) {
        return await this.rpcManager.executeWithFailover(async (api) => {
            for (const palletConfig of metricsConfig) {
                const pallet = palletConfig.pallet;

                if (!api.query[pallet]) {
                    throw new Error(`Pallet ${pallet} not found`);
                }

                for (const item of palletConfig.storage_items) {
                    if (!api.query[pallet][item.name]) {
                        throw new Error(`Storage item ${pallet}.${item.name} not found`);
                    }
                }
            }
            return true;
        });
    }

    async fetchMetric(pallet, storageItem, params = []) {
        return await this.rpcManager.executeWithFailover(async (api) => {
            // Update handlers with current API instance
            for (const handler of this.handlers) {
                handler.setApi(api);
            }

            // Get storage item metadata
            const storage = api.query[pallet][storageItem];
            const meta = storage.meta;

            // Find appropriate handler
            const handler = this.handlers.find(h => h.canHandle(pallet, storageItem, meta));
            if (!handler) {
                throw new Error(`No handler found for ${pallet}.${storageItem}`);
            }

            return await handler.fetchData(pallet, storageItem, params, meta);
        });
    }

    getHandler(pallet, storageItem) {
        return this.handlers.find(h => h.canHandle(pallet, storageItem));
    }
}

module.exports = PolkadotAPI;
