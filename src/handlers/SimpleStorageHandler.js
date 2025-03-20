const StorageHandler = require('./StorageHandler');
const logger = require('../utils/logger');

/**
 * Helper function to convert hex string to decimal
 * @param {string|number} value - The value to convert
 * @returns {string|number} - The decimal value
 */
function convertHexToDecimal(value) {
  if (typeof value === 'string' && value.startsWith('0x')) {
    try {
      return BigInt(value).toString();
    } catch (err) {
      logger.error(`Error converting hex to decimal: ${err.message}`);
      return value;
    }
  }
  return value;
}

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
    // Convert hex values to decimal before formatting
    const formattedValue = convertHexToDecimal(value);
    return `${metricName}{chain="${chainName}"} ${formattedValue}\n`;
  }

  formatStatus(metricName, blockNumber, value, params) {
    // Convert hex values to decimal for status too
    const formattedValue = convertHexToDecimal(value);
    return {
      [metricName]: {
        value: formattedValue,
        block_number: blockNumber
      }
    };
  }
}

module.exports = SimpleStorageHandler;
