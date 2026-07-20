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
const http = require('http');
const https = require('https');
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
function getServerUrl(port, platform = null, basePath = '') {
    const hostname = os.hostname();
    const suffix = basePath ? basePath + '/' : '';

    // WSL2: localhost works for Windows host access
    if (platform === 'wsl2') {
        return `http://localhost:${port}${suffix}`;
    }

    // Try to get local IP from network interfaces
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                // Skip internal (loopback) and non-IPv4 addresses
                if (!iface.internal && iface.family === 'IPv4') {
                    return `http://${iface.address}:${port}${suffix}`;
                }
            }
        }
    } catch (e) {
        // Ignore errors
    }

    return `http://${hostname}:${port}${suffix}`;
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
     * @param {string} [options.httpsCertPath] - Path to TLS certificate (PEM). When set
     *   together with httpsKeyPath, the server speaks HTTPS instead of HTTP.
     * @param {string} [options.httpsKeyPath]  - Path to TLS private key (PEM).
     */
    constructor(options = {}) {
        this.port = options.port || 8080;
        this.basePath = options.basePath || '';
        this.appDir = options.appDir;
        this.staticDir = options.staticDir || (options.appDir ? path.join(options.appDir, 'static') : null);
        this.docsConfig = options.docsConfig || null;
        this.updateConfig = options.updateConfig || null;
        this.httpsCertPath = options.httpsCertPath || null;
        this.httpsKeyPath  = options.httpsKeyPath  || null;
        if (!!this.httpsCertPath !== !!this.httpsKeyPath) {
            throw new Error('HttpServer: httpsCertPath and httpsKeyPath must both be set, or both be omitted.');
        }

        this._server = null;
        this._running = false;
        this._scheme  = (this.httpsCertPath && this.httpsKeyPath) ? 'https' : 'http';

        // Initialize Express app
        this.app = express();
        this.app.use(express.json({ limit: '5mb' }));

        // Register early middleware (e.g., cookie parser) before any routes
        if (options.earlyMiddleware) {
            for (const mw of options.earlyMiddleware) {
                this.app.use(mw);
            }
        }

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

        // Register docs/help routes if docsConfig provided
        if (this.docsConfig) {
            const httpRoutes = require('./http-routes');
            httpRoutes.register(this.app, { ...this.docsConfig, basePath: this.basePath });
        }

        // Register update routes if updateConfig provided
        if (this.updateConfig) {
            const updateRoutes = require('./update-routes');
            updateRoutes.register(this.app, { ...this.updateConfig, basePath: this.basePath });
        }
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
        return new Promise((resolve, reject) => {
            if (this._running) {
                resolve();
                return;
            }

            let listenApp = this.app;

            if (this.basePath) {
                // Mount entire app as sub-app under basePath
                const wrapper = express();
                wrapper.enable('strict routing');
                wrapper.get(this.basePath, (req, res) => res.redirect(301, this.basePath + '/'));
                wrapper.use(this.basePath, this.app);
                listenApp = wrapper;
            }

            // A failing listen() must REJECT this promise. Without an 'error' handler the
            // `listening` callback simply never fires, so the promise neither resolves nor
            // rejects — it dangles, the caller's .then() never runs, and the emitted 'error'
            // escapes as an uncaughtException. A logger that catches uncaughtException (as
            // aide-rap's winston does) then keeps the process ALIVE: fully booted, holding
            // the system's server.lock, reported "online" by its supervisor — and serving
            // nothing. It also blocks the next start, which is then refused with the
            // singleton-lock message, so the symptom presents as an entirely different bug.
            // Lehrgeld 2026-07-20 (study@corno): five failed starts in a row, each leaving
            // the zombie that broke the next.
            //
            // A dead listener is unrecoverable, so the caller must be able to fail fast and
            // exit non-zero. The message names port and cause: an operator who reads
            // "EADDRINUSE :18349" is done in seconds.
            const onListenError = (err) => {
                const why = err && err.code === 'EADDRINUSE'
                    ? `port ${this.port} is already in use (EADDRINUSE) — another instance is probably running`
                    : `${err && err.code ? err.code + ': ' : ''}${err && err.message ? err.message : String(err)}`;
                const e = new Error(`HttpServer: cannot listen on ${this._scheme}://0.0.0.0:${this.port} — ${why}`);
                e.code = err && err.code;
                e.cause = err;
                this._running = false;
                reject(e);
            };

            if (this._scheme === 'https') {
                const cert = fs.readFileSync(this.httpsCertPath);
                const key  = fs.readFileSync(this.httpsKeyPath);
                this._server = https.createServer({ cert, key }, listenApp).listen(this.port, '0.0.0.0', () => {
                    this._running = true;
                    this._url = `https://localhost:${this.port}${this.basePath || ''}`;
                    resolve();
                });
            } else {
                this._server = listenApp.listen(this.port, '0.0.0.0', () => {
                    this._running = true;
                    this._url = `http://localhost:${this.port}${this.basePath || ''}`;
                    resolve();
                });
            }
            // Bound AFTER listen() so it is attached to the actual server object; 'error' is
            // emitted asynchronously, so this still lands before any bind failure surfaces.
            this._server.on('error', onListenError);
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
     * Log the server URL. Call this after all startup tasks are complete.
     */
    logReady() {
        console.log('');
        logger.info(`Press Ctrl+C to stop`);
        logger.info(`Server started on ${this._url}`);
    }

    /**
     * Start server and block until Ctrl+C.
     */
    run() {
        // Handle Ctrl+C gracefully
        const shutdown = () => {
            logger.info('Shutting down...');
            this.stop();
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        this.start().then(() => this.logReady());
    }
}

module.exports = {
    HttpServer,
    getServerUrl,
    restartServer,
};
