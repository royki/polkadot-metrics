const fs = require('fs');
const path = require('path');
const express = require('express');
const logger = require('./utils/logger');

function loadRoutes(app) {
    const routesPath = path.join(__dirname, 'routes');
    fs.readdirSync(routesPath).forEach(file => {
        if (file.endsWith('.js')) {
            const route = require(path.join(routesPath, file));
            if (typeof route === 'function' || route instanceof express.Router) {
                app.use(route);
                logger.debug(`Loaded route: ${file}`);
            } else {
                logger.warn(`Skipping invalid route file: ${file}`);
            }
        }
    });
}

module.exports = loadRoutes;
