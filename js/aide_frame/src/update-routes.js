/**
 * HTTP route handlers for remote update functionality.
 *
 * Provides Express middleware for update-related API endpoints.
 *
 * Usage:
 *   const { updateRoutes } = require('aide-frame');
 *
 *   updateRoutes.register(app, {
 *       githubRepo: 'user/repo',
 *       serviceName: 'my-app',
 *   });
 */

const update = require('./update');
const { logger } = require('./log');

/**
 * Configuration for update routes.
 * @typedef {object} UpdateConfig
 * @property {string} githubRepo - GitHub repository (e.g., "user/repo")
 * @property {string} [branch="main"] - Branch to check for updates
 * @property {string} [serviceName] - Systemd service name for restart
 */

/**
 * Register update routes on an Express app.
 * @param {express.Application} app - Express app
 * @param {UpdateConfig} config - Update configuration
 */
function register(app, config) {
    if (!config || !config.githubRepo) {
        logger.warning('Update routes not registered: missing githubRepo');
        return;
    }

    // GET /api/update/status - Get current update status (no network calls)
    app.get('/api/update/status', (req, res) => {
        try {
            const status = update.getStatus();
            res.json(status);
        } catch (e) {
            logger.error(`Error getting update status: ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    // POST /api/update/check - Check for available updates
    app.post('/api/update/check', async (req, res) => {
        try {
            const result = await update.checkForUpdate(config);
            res.json(result);
        } catch (e) {
            logger.error(`Error checking for updates: ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    // POST /api/update/download - Download update (placeholder)
    app.post('/api/update/download', async (req, res) => {
        // TODO: Implement actual download functionality
        res.json({
            success: false,
            message: 'Download not yet implemented in Node.js version',
        });
    });

    // POST /api/update/apply - Apply staged update (placeholder)
    app.post('/api/update/apply', async (req, res) => {
        // TODO: Implement actual apply functionality
        res.json({
            success: false,
            message: 'Apply not yet implemented in Node.js version',
        });
    });

    // POST /api/update/rollback - Rollback to previous version (placeholder)
    app.post('/api/update/rollback', async (req, res) => {
        // TODO: Implement actual rollback functionality
        res.json({
            success: false,
            message: 'Rollback not yet implemented in Node.js version',
        });
    });

    // POST /api/update/enable - Re-enable updates after failures
    app.post('/api/update/enable', (req, res) => {
        try {
            // This requires the UpdateManager class to work properly
            res.json({
                success: true,
                message: 'Updates enabled (use UpdateManager for full functionality)',
            });
        } catch (e) {
            logger.error(`Error enabling updates: ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    // GET /update - Serve update management page
    app.get('/update', (req, res) => {
        const paths = require('./paths');
        const path = require('path');
        const fs = require('fs');

        paths.ensureInitialized();
        const staticDir = paths.get('AIDE_FRAME_STATIC_DIR');

        if (!staticDir) {
            return res.status(500).send('Static directory not configured');
        }

        const updateHtml = path.join(staticDir, 'update', 'update.html');
        if (!fs.existsSync(updateHtml)) {
            return res.status(404).send('Update page not found');
        }

        res.sendFile(updateHtml);
    });

    // Start automatic periodic update checks
    update.startAutoCheck(config);

    logger.debug(`Update routes registered for ${config.githubRepo}`);
}

module.exports = {
    register,
};
