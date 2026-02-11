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
 *       updateableDirs: ['static', 'demos'],  // Directories where files can be deleted
 *       requiredFiles: ['VERSION'],           // Files that must be in the update
 *       autoVerify: true,                     // Auto-confirm after verifyDelay
 *       verifyDelay: 60,                      // Seconds to wait before confirming
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
 * @property {boolean} [useReleases=true] - Use GitHub Releases (tarball) vs raw files
 * @property {string[]} [updateableDirs=[]] - Directories where files may be deleted
 * @property {string[]} [requiredFiles=["VERSION"]] - Files that must be in update
 * @property {boolean} [autoVerify=true] - Auto-confirm update after verifyDelay
 * @property {number} [verifyDelay=60] - Seconds to wait before confirming update
 */

// Module-level manager instance
let _manager = null;

/**
 * Get or create UpdateManager instance.
 * @param {UpdateConfig} config - Update configuration
 * @returns {update.UpdateManager}
 */
function getManager(config) {
    if (!_manager) {
        _manager = new update.UpdateManager({
            enabled: config.enabled !== false,
            source: {
                repo: config.githubRepo,
                branch: config.branch || 'main',
                useReleases: config.useReleases !== false,
            },
            serviceName: config.serviceName,
            autoCheck: config.autoCheck !== false,
            autoCheckHours: config.autoCheckHours || 24,
            updateableDirs: config.updateableDirs || [],
            requiredFiles: config.requiredFiles || ['VERSION'],
        });

        // Start auto-check
        _manager.startAutoCheck();

        // Start verification if pending
        if (config.autoVerify !== false) {
            _manager.scheduleVerification(config.verifyDelay || 60);
        }
    }
    return _manager;
}

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
            const manager = getManager(config);
            const status = manager.getStatus();
            res.json(status);
        } catch (e) {
            logger.error(`Error getting update status: ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    // POST /api/update/check - Check for available updates
    app.post('/api/update/check', async (req, res) => {
        try {
            const manager = getManager(config);
            const result = await manager.checkForUpdates();
            res.json(result);
        } catch (e) {
            logger.error(`Error checking for updates: ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    // POST /api/update/download - Download update and stage it
    app.post('/api/update/download', async (req, res) => {
        try {
            const manager = getManager(config);
            const result = await manager.downloadUpdate();
            res.json(result);
        } catch (e) {
            logger.error(`Error downloading update: ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    // POST /api/update/apply - Apply staged update
    app.post('/api/update/apply', async (req, res) => {
        try {
            const manager = getManager(config);
            const result = await manager.applyUpdate();
            res.json(result);
        } catch (e) {
            logger.error(`Error applying update: ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    // POST /api/update/rollback - Rollback to previous version
    app.post('/api/update/rollback', async (req, res) => {
        try {
            const manager = getManager(config);
            const result = await manager.rollback();
            res.json(result);
        } catch (e) {
            logger.error(`Error rolling back: ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    // POST /api/update/enable - Re-enable updates after failures
    app.post('/api/update/enable', (req, res) => {
        try {
            const manager = getManager(config);
            const result = manager.enableUpdates();
            res.json(result);
        } catch (e) {
            logger.error(`Error enabling updates: ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    // POST /api/update/confirm - Manually confirm update (if not auto-verify)
    app.post('/api/update/confirm', (req, res) => {
        try {
            const manager = getManager(config);
            const result = manager.confirmUpdate();
            res.json(result);
        } catch (e) {
            logger.error(`Error confirming update: ${e.message}`);
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

        if (config.basePath) {
            let html = fs.readFileSync(updateHtml, 'utf8');
            html = html.replace('<head>', `<head>\n    <base href="${config.basePath}/">`);
            res.type('html').send(html);
        } else {
            res.sendFile(updateHtml);
        }
    });

    logger.debug(`Update routes registered for ${config.githubRepo}`);
}

module.exports = {
    register,
    getManager,
};
