const SimpleStorageHandler = require('./SimpleStorageHandler');
const MapStorageHandler = require('./MapStorageHandler');
const logger = require('../utils/logger');

/**
 * Factory that creates appropriate handlers for storage items
 */
class HandlerFactory {
  constructor(api) {
    if (!api) {
      throw new Error('API instance is required for HandlerFactory');
    }

    this.api = api;

    // Register handlers in order of specificity (most specific first)
    this.handlers = [
      new MapStorageHandler(api),
      new SimpleStorageHandler(api)
    ];

    logger.debug(`HandlerFactory initialized with ${this.handlers.length} handlers`);
  }

  /**
   * Get the appropriate handler for a storage item
   */
  getHandler(pallet, storageItem, meta) {
    if (!this.handlers || this.handlers.length === 0) {
      throw new Error('No handlers registered in HandlerFactory');
    }

    logger.debug(`Finding handler for ${pallet}.${storageItem}`);
    for (const handler of this.handlers) {
      if (handler.canHandle(pallet, storageItem, meta)) {
        logger.debug(`Handler found for ${pallet}.${storageItem}: ${handler.constructor.name}`);
        return handler;
      }
    }

    // If no handler is found, return the SimpleStorageHandler as a fallback
    logger.warn(`No specific handler found for ${pallet}.${storageItem}, using fallback handler`);
    return this.handlers[this.handlers.length - 1]; // SimpleStorageHandler is the last one
  }
}

module.exports = HandlerFactory;
