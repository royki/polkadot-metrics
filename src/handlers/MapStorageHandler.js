const StorageHandler = require('./StorageHandler');
const logger = require('../utils/logger');

/**
 * Handler for storage maps with one or more parameters
 */
class MapStorageHandler extends StorageHandler {
  canHandle(pallet, storageItem, meta) {
    try {
      const storage = this.api.query[pallet][storageItem];
      return storage && storage.meta && (
        storage.meta.type.isMap ||
        storage.meta.type.isDoubleMap ||
        storage.meta.type.isNMap
      );
    } catch (err) {
      return false;
    }
  }

  /**
   * Convert hex value to decimal string
   */
  convertHexToDecimal(value) {
    if (typeof value === 'string' && value.startsWith('0x')) {
      try {
        return BigInt(value).toString();
      } catch (err) {
        logger.error(`Error converting hex to decimal: ${err.message}`);
        return '0'; // Return 0 for invalid hex values
      }
    }
    return value;
  }

  /**
   * Process value before returning
   */
  processValue(value) {
    if (!value) return null;

    // Handle array values
    if (Array.isArray(value)) {
      return value.map(v => this.convertHexToDecimal(v));
    }

    // Handle object values
    if (typeof value === 'object' && value !== null) {
      const processed = {};
      for (const [k, v] of Object.entries(value)) {
        processed[k] = this.convertHexToDecimal(v);
      }
      return processed;
    }

    // Handle scalar values
    return this.convertHexToDecimal(value);
  }

  async fetchData(pallet, storageItem, params = [], meta) {
    try {
      const storage = this.api.query[pallet][storageItem];

      // For partial or no parameters, use entries()
      if (params.length === 0) {
        // No parameters - get all entries
        const entries = await storage.entries();
        const result = {};
        for (const [key, value] of entries) {
          const keyStr = key.args.map(arg => arg.toString()).join('-');
          const processedValue = this.processValue(value.toJSON());
          if (processedValue !== null) {
            result[keyStr] = processedValue;
          }
        }
        return result;
      } else if (params.length === 1) {
        // One parameter - get entry directly
        try {
          const result = await storage(params[0]);
          return this.processValue(result.toJSON ? result.toJSON() : result.toString());
        } catch (err) {
          // If direct query fails, try entries
          logger.debug(`Direct query failed for ${pallet}.${storageItem}, trying entries`);
          const entries = await storage.entries();
          const result = {};
          for (const [key, value] of entries) {
            const keyArgs = key.args;
            // Match the first parameter
            if (keyArgs[0].toString() === params[0].toString()) {
              const keyStr = keyArgs.map(arg => arg.toString()).join('-');
              const processedValue = this.processValue(value.toJSON());
              if (processedValue !== null) {
                result[keyStr] = processedValue;
              }
            }
          }
          return result;
        }
      }

      // Full parameters - direct query
      const result = await storage(...params);
      return this.processValue(result.toJSON ? result.toJSON() : result.toString());
    } catch (err) {
      logger.error(`Error fetching data for ${pallet}.${storageItem}: ${err.message}`);
      return null;
    }
  }

  getRequiredParamCount(metadata) {
    if (!metadata || !metadata.type) return 0;
    if (metadata.type.isMap) return 1;
    if (metadata.type.isDoubleMap) return 2;
    if (metadata.type.isNMap) return metadata.type.asNMap.keyVec.length;
    return 0;
  }

  formatMetric(metricName, chainName, value, params) {
    // Handle non-object values (direct values)
    if (typeof value !== 'object' || value === null) {
      const processedValue = this.convertHexToDecimal(value);
      if (processedValue === null || processedValue === '') return '';
      return `${metricName}{chain="${chainName}"} ${processedValue}\n`;
    }

    // Handle object values
    let output = '';
    for (const [key, val] of Object.entries(value)) {
      const processedValue = this.convertHexToDecimal(val);
      if (processedValue === null || processedValue === '') continue;

      // Extract labels from the key
      const keyParts = key.split('-');
      const labels = [];

      // Always add chain
      labels.push(`chain="${chainName}"`);

      // Add era if it exists (first part)
      if (keyParts.length > 0) {
        labels.push(`era="${keyParts[0]}"`);
      }

      // Add account if it exists (last part)
      if (keyParts.length > 1) {
        labels.push(`account="${keyParts[keyParts.length - 1]}"`);
      }

      // Create the metric line
      output += `${metricName}{${labels.join(',')}} ${processedValue}\n`;
    }
    return output;
  }

  formatStatus(metricName, blockNumber, value, params) {
    // Process the value first
    const processedValue = this.processValue(value);

    if (typeof processedValue !== 'object' || processedValue === null) {
      return {
        [metricName]: {
          value: processedValue,
          block_number: blockNumber
        }
      };
    }

    return {
      [`${metricName}_all`]: {
        value: processedValue,
        block_number: blockNumber
      }
    };
  }
}

module.exports = MapStorageHandler;
