const StorageHandler = require('./StorageHandler');
const logger = require('../utils/logger');

/**
 * Handler for storage maps with one or more parameters
 */
class MapStorageHandler extends StorageHandler {
  canHandle(pallet, storageItem, meta) {
    return meta && meta.type && (meta.type.isMap || meta.type.isDoubleMap || meta.type.isNMap);
  }

  async fetchData(pallet, storageItem, params, meta) {
    try {
      const storage = this.api.query[pallet][storageItem];
      const requiredParamCount = this._getRequiredParamCount(meta);

      logger.debug(`MapStorageHandler: ${pallet}.${storageItem} requires ${requiredParamCount} params, got ${params.length}`);

      // Full query - we have all the required parameters
      if (params.length >= requiredParamCount) {
        const result = await storage(...params);
        return result && result.toJSON ? result.toJSON() : result && result.toString ? result.toString() : result;
      }

      // Partial query - we don't have all required parameters
      // Fetch all entries and filter
      const entries = await storage.entries();
      const filteredEntries = {};

      for (const [key, value] of entries) {
        if (!key || !key.args) continue;

        const keyParams = key.args;

        // Check if the provided params match the beginning of the key params
        let matches = true;
        for (let i = 0; i < params.length; i++) {
          if (i >= keyParams.length) {
            matches = false;
            break;
          }
          const keyParam = keyParams[i].toJSON ? keyParams[i].toJSON() : keyParams[i].toString();
          if (String(keyParam) !== String(params[i])) {
            matches = false;
            break;
          }
        }

        if (matches) {
          const remainingParams = keyParams.slice(params.length);
          const paramKey = remainingParams.length > 0
            ? remainingParams.map(p => p.toString()).join('_')
            : 'value';

          filteredEntries[paramKey] = value && value.toJSON ? value.toJSON() : value && value.toString ? value.toString() : value;
        }
      }

      return filteredEntries;
    } catch (err) {
      logger.error(`Error in MapStorageHandler for ${pallet}.${storageItem}: ${err.message}`);
      return {};
    }
  }

  _getRequiredParamCount(meta) {
    if (!meta) return 0;
    if (meta.type.isDoubleMap) return 2;
    if (meta.type.isMap) return 1;
    if (meta.type.isNMap && meta.type.asNMap) return meta.type.asNMap.keyVec.length;
    return 0;
  }

  formatMetric(metricName, chainName, value, params) {
    if (typeof value !== 'object' || value === null) {
      return `${metricName}{chain="${chainName}"} ${value}\n`;
    }

    let output = '';
    for (const [paramKey, paramValue] of Object.entries(value)) {
      const formattedValue = typeof paramValue === 'object'
        ? JSON.stringify(paramValue)
        : paramValue;

      output += `${metricName}{chain="${chainName}",param="${paramKey}"} ${formattedValue}\n`;
    }

    return output;
  }

  formatStatus(metricName, blockNumber, value, params) {
    if (typeof value !== 'object' || value === null) {
      return {
        [metricName]: {
          value,
          block_number: blockNumber
        }
      };
    }

    return {
      [`${metricName}_all`]: {
        value,
        block_number: blockNumber
      }
    };
  }
}

module.exports = MapStorageHandler;
