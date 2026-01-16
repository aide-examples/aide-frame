/**
 * AIDE Frame - Node.js Implementation
 *
 * Lightweight application framework with server-side components,
 * especially suited for Raspberry Pi deployments.
 *
 * Usage:
 *   const aideFrame = require('aide-frame');
 *   // or
 *   const { paths, config, HttpServer } = require('aide-frame');
 */

// Core modules (no aide-frame dependencies)
const log = require('./src/log');
const paths = require('./src/paths');
const config = require('./src/config');
const platformDetect = require('./src/platform-detect');

// HTTP modules
const httpServer = require('./src/http-server');
const httpRoutes = require('./src/http-routes');
const docsViewer = require('./src/docs-viewer');

// Update system
const webRequest = require('./src/web-request');
const update = require('./src/update');
const updateRoutes = require('./src/update-routes');

// Utilities
const args = require('./src/args');
const qrcodeUtils = require('./src/qrcode-utils');

module.exports = {
    // Core
    log,
    logger: log.logger,
    paths,
    config,
    platformDetect,

    // HTTP
    httpServer,
    HttpServer: httpServer.HttpServer,
    httpRoutes,
    docsViewer,

    // Update
    webRequest,
    update,
    updateRoutes,

    // Utilities
    args,
    qrcodeUtils,
};
