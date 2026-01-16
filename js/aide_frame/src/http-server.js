/**
 * Simple HTTP server utilities for aide-frame applications.
 *
 * Provides a lightweight HTTP server based on Express with JSON/HTML response helpers
 * and integrated docs/help route handling.
 *
 * Usage:
 *   const { HttpServer } = require('aide-frame');
 *
 *   const server = new HttpServer({
 *       port: 8080,
 *       appDir: __dirname,
 *       docsConfig: { appName: 'My App' }
 *   });
 *
 *   server.addRoutes((app) => {
 *       app.get('/', (req, res) => res.sendFile('index.html'));
 *       app.get('/api/status', (req, res) => res.json({ ok: true }));
 *   });
 *
 *   server.run();  // Blocking, handles Ctrl+C
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dgram = require('dgram');

const paths = require('./paths');
const { logger } = require('./log');

/**
 * Get the best URL to reach the server.
 *
 * Tries in order:
 * 1. For WSL2: localhost (Windows host can access via localhost)
 * 2. Local IP via network interfaces
 * 3. Hostname as fallback
 *
 * @param {number} port - Server port
 * @param {string|null} platform - Platform string (e.g., 'wsl2', 'raspi', 'linux')
 * @returns {string} URL string like "http://192.168.1.100:8080"
 */
function getServerUrl(port, platform = null) {
    const hostname = os.hostname();

    // WSL2: localhost works for Windows host access
    if (platform === 'wsl2') {
        return `http://localhost:${port}`;
    }

    // Try to get local IP from network interfaces
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                // Skip internal (loopback) and non-IPv4 addresses
                if (!iface.internal && iface.family === 'IPv4') {
                    return `http://${iface.address}:${port}`;
                }
            }
        }
    } catch (e) {
        // Ignore errors
    }

    return `http://${hostname}:${port}`;
}

/**
 * Restart the server process after a short delay.
 *
 * This exits the process with code 0, expecting systemd or similar
 * to restart it automatically.
 *
 * @param {number} delay - Seconds to wait before exit (allows response to be sent)
 * @returns {object} Object with success message (for JSON response)
 */
function restartServer(delay = 0.5) {
    setTimeout(() => {
        process.exit(0);
    }, delay * 1000);
    return { success: true, message: 'Restarting...' };
}

/**
 * HTTP Server with lifecycle management.
 */
class HttpServer {
    /**
     * Initialize HTTP server.
     *
     * @param {object} options - Configuration options
     * @param {number} options.port - Port to listen on (default: 8080)
     * @param {string} options.appDir - Application directory (for paths.init)
     * @param {string} options.staticDir - Directory for static files (default: appDir/static)
     * @param {object} options.docsConfig - DocsConfig for docs/help routes
     * @param {object} options.updateConfig - UpdateConfig for remote update functionality
     */
    constructor(options = {}) {
        this.port = options.port || 8080;
        this.appDir = options.appDir;
        this.staticDir = options.staticDir || (options.appDir ? path.join(options.appDir, 'static') : null);
        this.docsConfig = options.docsConfig || null;
        this.updateConfig = options.updateConfig || null;

        this._server = null;
        this._running = false;

        // Initialize Express app
        this.app = express();
        this.app.use(express.json());

        // Initialize paths if appDir provided
        if (this.appDir) {
            paths.init(this.appDir);
        }

        this._setupRoutes();
    }

    /**
     * Setup default routes for static files and framework features.
     * @private
     */
    _setupRoutes() {
        // Framework static files (/static/frame/*)
        const aideFrameStaticDir = paths.get('AIDE_FRAME_STATIC_DIR');
        if (aideFrameStaticDir && fs.existsSync(aideFrameStaticDir)) {
            this.app.use('/static/frame', express.static(aideFrameStaticDir));
        }

        // App static files (/static/*)
        if (this.staticDir && fs.existsSync(this.staticDir)) {
            this.app.use('/static', express.static(this.staticDir));
        }

        // Docs and help routes will be set up by http-routes module
        // Update routes will be set up by update-routes module
    }

    /**
     * Add custom routes to the Express app.
     *
     * @param {function} callback - Function that receives the Express app
     */
    addRoutes(callback) {
        callback(this.app);
    }

    /**
     * Get the Express app instance for advanced configuration.
     * @returns {express.Application}
     */
    getApp() {
        return this.app;
    }

    /**
     * Start the server.
     * @returns {Promise} Resolves when server is listening
     */
    start() {
        return new Promise((resolve) => {
            if (this._running) {
                resolve();
                return;
            }

            this._server = this.app.listen(this.port, '0.0.0.0', () => {
                this._running = true;
                logger.info(`Server started on http://localhost:${this.port}`);
                resolve();
            });
        });
    }

    /**
     * Stop the server.
     */
    stop() {
        if (this._server) {
            this._server.close();
            this._running = false;
            logger.info('Server stopped');
        }
    }

    /**
     * Start server and block until Ctrl+C.
     */
    run() {
        this.start();

        // Handle Ctrl+C gracefully
        const shutdown = () => {
            logger.info('Shutting down...');
            this.stop();
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        logger.info('Press Ctrl+C to stop');
    }
}

module.exports = {
    HttpServer,
    getServerUrl,
    restartServer,
};
