const { ApiPromise, WsProvider } = require('@polkadot/api');
const logger = require('../utils/logger');

class RPCManager {
  constructor(rpcConfig) {
    this.rpcUrls = rpcConfig.rpc_urls.sort((a, b) => a.priority - b.priority);
    this.healthCheckInterval = rpcConfig.health_check_interval * 1000 || 30000;
    this.switchThreshold = rpcConfig.switch_threshold || 3;
    this.reconnectInterval = rpcConfig.reconnect_interval * 1000 || 5000;

    this.currentIndex = 0;
    this.failedRequests = 0;
    this.apis = new Map(); // Store multiple API instances
    this.currentApi = null;
    this.isConnected = false;
    this.healthCheckTimer = null;
  }

  async initialize() {
    try {
      // Initialize connections to all RPC endpoints
      await Promise.all(this.rpcUrls.map(async (rpcConfig, index) => {
        try {
          const api = await this.createApiInstance(rpcConfig.url);
          this.apis.set(index, api);
          logger.info(`Connected to RPC endpoint: ${rpcConfig.url}`);
        } catch (err) {
          logger.error(`Failed to connect to RPC endpoint ${rpcConfig.url}: ${err.message}`);
        }
      }));

      // Set the first working API as current
      this.currentApi = this.apis.get(this.currentIndex);
      if (!this.currentApi) {
        throw new Error('No RPC endpoints available');
      }

      this.isConnected = true;
      this.startHealthCheck();
      return this.currentApi;
    } catch (err) {
      logger.error(`Failed to initialize RPC connections: ${err.message}`);
      throw err;
    }
  }

  async createApiInstance(url) {
    const provider = new WsProvider(url);
    const api = await ApiPromise.create({ provider });

    // Setup disconnect handler
    provider.on('disconnected', () => {
      logger.warn(`Disconnected from RPC endpoint: ${url}`);
      this.handleDisconnect();
    });

    return api;
  }

  async getCurrentApi() {
    if (!this.isConnected || !this.currentApi) {
      await this.switchToNextEndpoint();
    }
    return this.currentApi;
  }

  async executeWithFailover(operation) {
    try {
      const api = await this.getCurrentApi();
      const result = await operation(api);
      this.failedRequests = 0; // Reset failed requests on success
      return result;
    } catch (err) {
      logger.error(`RPC request failed: ${err.message}`);
      this.failedRequests++;

      if (this.failedRequests >= this.switchThreshold) {
        await this.switchToNextEndpoint();
        // Retry the operation once with the new endpoint
        const api = await this.getCurrentApi();
        return await operation(api);
      }
      throw err;
    }
  }

  async switchToNextEndpoint() {
    const previousIndex = this.currentIndex;
    let attempts = 0;
    const maxAttempts = this.apis.size;

    while (attempts < maxAttempts) {
      this.currentIndex = (this.currentIndex + 1) % this.rpcUrls.length;

      // Try to get or create API instance for the new endpoint
      let api = this.apis.get(this.currentIndex);
      if (!api || !api.isConnected) {
        try {
          api = await this.createApiInstance(this.rpcUrls[this.currentIndex].url);
          this.apis.set(this.currentIndex, api);
        } catch (err) {
          logger.error(`Failed to connect to next RPC endpoint: ${err.message}`);
          attempts++;
          continue;
        }
      }

      this.currentApi = api;
      this.failedRequests = 0;
      logger.info(`Switched to RPC endpoint: ${this.rpcUrls[this.currentIndex].url}`);
      return;
    }

    // If we couldn't switch to any endpoint, try to reconnect to the previous one
    this.currentIndex = previousIndex;
    throw new Error('No available RPC endpoints');
  }

  handleDisconnect() {
    this.isConnected = false;
    this.switchToNextEndpoint().catch(err => {
      logger.error(`Failed to switch endpoints after disconnect: ${err.message}`);
    });
  }

  startHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      try {
        const api = await this.getCurrentApi();
        await api.rpc.system.health();
      } catch (err) {
        logger.warn(`Health check failed: ${err.message}`);
        this.failedRequests++;
        if (this.failedRequests >= this.switchThreshold) {
          this.switchToNextEndpoint().catch(err => {
            logger.error(`Failed to switch endpoints during health check: ${err.message}`);
          });
        }
      }
    }, this.healthCheckInterval);
  }

  async disconnect() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // Disconnect all API instances
    for (const api of this.apis.values()) {
      if (api && api.disconnect) {
        await api.disconnect();
      }
    }

    this.apis.clear();
    this.currentApi = null;
    this.isConnected = false;
  }
}

module.exports = RPCManager;
