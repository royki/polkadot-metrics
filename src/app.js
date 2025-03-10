const express = require('express');
const loadRoutes = require('./routeLoader');
const logger = require('./utils/logger');
const ConfigLoader = require('./config/configLoader');

const app = express();
const configLoader = new ConfigLoader(process.env.CONFIG_PATH || 'config/config.yaml');
const port = configLoader.getServerPort();

// Load all routes
loadRoutes(app);

app.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
});
