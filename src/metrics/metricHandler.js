const logger = require('../utils/logger');

class MetricHandler {
    constructor(api) {
        this.api = api;
    }

    async resolveParam(paramName) {
        logger.debug(`Resolving parameter: ${paramName}`);
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
        logger.debug(`Fetching metric: ${pallet}.${storageItem} with params: ${params}`);
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

        const result = await storage(...resolvedParams);

        // Handle specific return types
        if (storageItem === 'erasRewardPoints') {
            return result.toJSON();
        } else if (storageItem === 'activeEra') {
            return result.unwrapOrDefault().index.toNumber();
        } else {
            return result.toJSON();
        }
    }

    async getMetricsOutput(metricsConfig, chainName, blockNumber) {
        let metricsOutput = '';
        for (const metric of metricsConfig) {
            const params = Array.isArray(metric.params) ? metric.params : [];
            const value = await this.fetchMetric(
                metric.pallet,
                metric.storage_item,
                params
            );

            metricsOutput += `# HELP ${metric.name} ${metric.name.replace('_', ' ')}\n`;
            metricsOutput += `# TYPE ${metric.name} gauge\n`;

            if (metric.storage_item === 'erasRewardPoints') {
                for (const [validator, points] of Object.entries(value.individual)) {
                    metricsOutput += `${metric.name}{chain="${chainName}",validator="${validator}"} ${points}\n`;
                }
            } else {
                metricsOutput += `${metric.name}{chain="${chainName}"} ${value}\n`;
            }
        }
        return metricsOutput;
    }
}

module.exports = MetricHandler;
