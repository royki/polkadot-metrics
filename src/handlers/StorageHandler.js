const logger = require('../utils/logger');

/**
 * Base class for storage item handlers
 */
class StorageHandler {
  constructor(api) {
    this.api = api;
  }

  /**
   * Set the API instance for this handler
   */
  setApi(api) {
    this.api = api;
  }

  /**
   * Determine if this handler can process the given storage item
   */
  canHandle(pallet, storageItem, meta) {
    return false; // Base class can't handle anything
  }

  /**
   * Fetch data for the storage item
   */
  async fetchData(pallet, storageItem, params, meta) {
    throw new Error('Method not implemented');
  }

  /**
   * Format data for metrics output
   */
  formatMetric(metricName, chainName, value, params) {
    throw new Error('Method not implemented');
  }

  /**
   * Format data for status output
   */
  formatStatus(metricName, blockNumber, value, params) {
    throw new Error('Method not implemented');
  }
}

module.exports = StorageHandler;
