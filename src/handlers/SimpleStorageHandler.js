const StorageHandler = require('./StorageHandler');
const logger = require('../utils/logger');

/**
 * Handler for simple storage items that return scalar values
 */
class SimpleStorageHandler extends StorageHandler {
  canHandle(pallet, storageItem, meta) {
    // Can handle storage items without parameters or with all required params
    return true; // Make this a fallback handler
  }

  async fetchData(pallet, storageItem, params, meta) {
    const storage = this.api.query[pallet][storageItem];
    try {
      // If we have parameters, use them
      if (params && params.length > 0) {
        const result = await storage(...params);
        return result && result.toJSON ? result.toJSON() : result && result.toString ? result.toString() : result;
      } else {
        const result = await storage();
        return result && result.toJSON ? result.toJSON() : result && result.toString ? result.toString() : result;
      }
    } catch (err) {
      logger.error(`Error fetching data for ${pallet}.${storageItem}: ${err.message}`);
      return null;
    }
  }

  formatMetric(metricName, chainName, value, params) {
    return `${metricName}{chain="${chainName}"} ${value}\n`;
  }

  formatStatus(metricName, blockNumber, value, params) {
    return {
      [metricName]: {
        value,
        block_number: blockNumber
      }
    };
  }
}

module.exports = SimpleStorageHandler;
