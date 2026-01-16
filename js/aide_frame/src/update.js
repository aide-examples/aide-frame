/**
 * Remote update manager for applications.
 *
 * Provides GitHub-based updates with:
 * - Version checking against GitHub repository
 * - Automatic periodic update checks
 * - State persistence
 *
 * Note: Download, apply, and rollback features are not yet implemented
 * in the Node.js version. Use the Python version for full functionality.
 *
 * Usage:
 *   const { UpdateManager, getLocalVersion } = require('aide-frame').update;
 *
 *   // Configure for your application
 *   const manager = new UpdateManager({
 *       source: {
 *           repo: "username/repo-name",
 *           branch: "main"
 *       },
 *       serviceName: "myapp",
 *   });
 *
 *   // Check for updates
 *   const result = await manager.checkForUpdates();
 *
 *   // Get current status
 *   const status = manager.getStatus();
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const paths = require('./paths');
const { fetchJson, fetchText } = require('./web-request');
const { logger } = require('./log');
const platformDetect = require('./platform-detect');

/**
 * Update states
 */
const UpdateState = {
    IDLE: 'idle',
    CHECKING: 'checking',
    DOWNLOADING: 'downloading',
    VERIFYING: 'verifying',
    STAGED: 'staged',
    APPLYING: 'applying',
    FAILED: 'failed',
    DISABLED: 'disabled',
};

/**
 * Read the local version from VERSION file.
 * @returns {string} Version string or "0.0.0" if not found
 */
function getLocalVersion() {
    paths.ensureInitialized();
    const versionFile = paths.VERSION_FILE;

    if (!versionFile || !fs.existsSync(versionFile)) {
        return '0.0.0';
    }

    try {
        return fs.readFileSync(versionFile, 'utf8').trim();
    } catch (e) {
        logger.error(`Error reading version file: ${e.message}`);
        return '0.0.0';
    }
}

/**
 * Compare two version strings.
 *
 * @param {string} local - Local version
 * @param {string} remote - Remote version
 * @returns {number} 1 if remote > local, 0 if equal, -1 if remote < local
 */
function compareVersions(local, remote) {
    function parseVersion(v) {
        // Handle versions like "1.2.3" or "1.2.3-dev"
        const base = v.split('-')[0];
        const parts = base.split('.');
        return parts.map(p => parseInt(p, 10) || 0);
    }

    try {
        const localParts = parseVersion(local);
        const remoteParts = parseVersion(remote);

        const maxLen = Math.max(localParts.length, remoteParts.length);
        for (let i = 0; i < maxLen; i++) {
            const l = localParts[i] || 0;
            const r = remoteParts[i] || 0;
            if (r > l) return 1;
            if (r < l) return -1;
        }
        return 0;
    } catch (e) {
        return 0; // Can't compare, assume equal
    }
}

/**
 * Manages remote updates from GitHub.
 *
 * Configuration options:
 *   enabled: bool - Enable/disable updates
 *   source.repo: str - GitHub repo (e.g., "username/repo")
 *   source.branch: str - Branch for fallback version check
 *   source.useReleases: bool - Use GitHub Releases (default: true)
 *   serviceName: str - Service name for restart
 *   autoCheck: bool - Periodically check for updates
 *   autoCheckHours: int - Hours between auto-checks
 */
class UpdateManager {
    static DEFAULT_CONFIG = {
        enabled: true,
        source: {
            repo: null,  // Must be set by application
            branch: 'main',
            useReleases: true,
        },
        serviceName: null,
        autoCheck: true,
        autoCheckHours: 24,
    };

    constructor(config = {}) {
        paths.ensureInitialized();

        // Merge config with defaults
        this.config = {
            ...UpdateManager.DEFAULT_CONFIG,
            ...config,
            source: {
                ...UpdateManager.DEFAULT_CONFIG.source,
                ...(config.source || {}),
            },
        };

        this.stateDir = paths.UPDATE_STATE_DIR;
        this.stateFile = this.stateDir
            ? path.join(this.stateDir, 'state.json')
            : null;

        this._ensureStateDir();
        this._state = this._loadState();
        this._autoCheckTimer = null;
    }

    _ensureStateDir() {
        if (!this.stateDir) return;
        if (!fs.existsSync(this.stateDir)) {
            try {
                fs.mkdirSync(this.stateDir, { recursive: true });
            } catch (e) {
                // May fail on read-only filesystem
            }
        }
    }

    _loadState() {
        const defaultState = {
            current_version: getLocalVersion(),
            available_version: null,
            update_state: 'idle',
            pending_verification: false,
            consecutive_failures: 0,
            updates_disabled: false,
            backup_version: null,
            last_check: null,
            last_update: null,
        };

        if (!this.stateFile) return defaultState;

        try {
            if (fs.existsSync(this.stateFile)) {
                const savedState = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
                return { ...defaultState, ...savedState };
            }
        } catch (e) {
            // Return default state on error
        }

        return defaultState;
    }

    _saveState() {
        if (!this.stateFile) return;
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify(this._state, null, 2));
        } catch (e) {
            // May fail on read-only filesystem
        }
    }

    /**
     * Start automatic periodic update checks.
     */
    startAutoCheck() {
        if (!this.config.autoCheck) return;
        if (!this.config.enabled) return;

        const hours = this.config.autoCheckHours || 24;
        const intervalMs = hours * 3600 * 1000;

        const doCheck = async () => {
            try {
                const result = await this.checkForUpdates();
                if (result.update_available) {
                    logger.info(`Update available: ${result.available_version}`);
                } else {
                    logger.debug(`Auto-check complete: ${result.message || 'up to date'}`);
                }
            } catch (e) {
                logger.warning(`Auto-check failed: ${e.message}`);
            }

            // Schedule next check
            this._scheduleNextCheck(intervalMs);
        };

        // Check if we need to run immediately
        let runNow = true;
        const lastCheck = this._state.last_check;

        if (lastCheck) {
            try {
                const lastDt = new Date(lastCheck);
                const elapsed = Date.now() - lastDt.getTime();
                if (elapsed < intervalMs) {
                    // Schedule for remaining time
                    const remaining = intervalMs - elapsed;
                    logger.debug(`Next update check in ${(remaining / 3600000).toFixed(1)} hours`);
                    this._scheduleNextCheck(remaining);
                    runNow = false;
                }
            } catch (e) {
                // Invalid date, run now
            }
        }

        if (runNow) {
            // Run first check after short delay (don't block startup)
            this._autoCheckTimer = setTimeout(doCheck, 5000);
            logger.debug('Update auto-check scheduled (first check in 5s)');
        }
    }

    _scheduleNextCheck(ms) {
        if (this._autoCheckTimer) {
            clearTimeout(this._autoCheckTimer);
        }

        this._autoCheckTimer = setTimeout(async () => {
            try {
                const result = await this.checkForUpdates();
                if (result.update_available) {
                    logger.info(`Update available: ${result.available_version}`);
                }
            } catch (e) {
                logger.warning(`Auto-check failed: ${e.message}`);
            }
            // Reschedule
            const hours = this.config.autoCheckHours || 24;
            this._scheduleNextCheck(hours * 3600 * 1000);
        }, ms);
    }

    /**
     * Stop automatic update checks.
     */
    stopAutoCheck() {
        if (this._autoCheckTimer) {
            clearTimeout(this._autoCheckTimer);
            this._autoCheckTimer = null;
        }
    }

    /**
     * Get current update status for API response.
     * @returns {object} Status object
     */
    getStatus() {
        const localVersion = getLocalVersion();
        const available = this._state.available_version;

        // Determine update availability
        let updateAvailable = false;
        let versionComparison = 'unknown';
        if (available) {
            const cmp = compareVersions(localVersion, available);
            if (cmp === 1) {
                updateAvailable = true;
                versionComparison = 'update_available';
            } else if (cmp === -1) {
                versionComparison = 'local_ahead';
            } else {
                versionComparison = 'up_to_date';
            }
        }

        // Memory info
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        return {
            current_version: localVersion,
            available_version: available,
            update_available: updateAvailable,
            version_comparison: versionComparison,
            update_state: this._state.update_state || 'idle',
            pending_verification: this._state.pending_verification || false,
            consecutive_failures: this._state.consecutive_failures || 0,
            updates_disabled: this._state.updates_disabled || false,
            updates_enabled: this.config.enabled,
            backup_version: this._state.backup_version,
            can_rollback: this._state.backup_version !== null,
            last_check: this._state.last_check,
            last_update: this._state.last_update,
            source: this.config.source,
            platform: platformDetect.PLATFORM,
            memory: {
                total_mb: Math.round(totalMem / 1024 / 1024),
                used_mb: Math.round(usedMem / 1024 / 1024),
                free_mb: Math.round(freeMem / 1024 / 1024),
            },
        };
    }

    /**
     * Check GitHub for a newer version.
     * @returns {Promise<object>} Check results
     */
    async checkForUpdates() {
        if (!this.config.enabled) {
            return { success: false, error: 'Updates are disabled in config' };
        }

        if (this._state.updates_disabled) {
            return { success: false, error: 'Updates disabled due to repeated failures' };
        }

        const source = this.config.source || {};
        const repo = source.repo;
        if (!repo) {
            return { success: false, error: 'No repository configured' };
        }

        this._state.update_state = 'checking';
        this._saveState();

        try {
            let remoteVersion;
            let releaseInfo = null;

            const useReleases = source.useReleases !== false;

            if (useReleases) {
                const result = await this._checkReleases(repo);
                remoteVersion = result.version;
                releaseInfo = result.releaseInfo;
                this._state.release_info = releaseInfo;
            } else {
                remoteVersion = await this._checkRawVersion(repo, source.branch || 'main');
                this._state.release_info = null;
            }

            const localVersion = getLocalVersion();
            const cmp = compareVersions(localVersion, remoteVersion);

            // Update state
            this._state.available_version = remoteVersion;
            this._state.last_check = new Date().toISOString();
            this._state.update_state = 'idle';
            this._saveState();

            // Determine result
            if (cmp === 1) {
                return {
                    success: true,
                    update_available: true,
                    current_version: localVersion,
                    available_version: remoteVersion,
                    message: `Update available: ${localVersion} → ${remoteVersion}`,
                };
            } else if (cmp === -1) {
                return {
                    success: true,
                    update_available: false,
                    current_version: localVersion,
                    available_version: remoteVersion,
                    message: `Local version (${localVersion}) is ahead of remote (${remoteVersion})`,
                };
            } else {
                return {
                    success: true,
                    update_available: false,
                    current_version: localVersion,
                    available_version: remoteVersion,
                    message: `Already up to date (${localVersion})`,
                };
            }
        } catch (e) {
            this._state.update_state = 'idle';
            this._saveState();
            return { success: false, error: e.message };
        }
    }

    /**
     * Check GitHub Releases for latest version.
     * @param {string} repo - GitHub repo
     * @returns {Promise<object>} Object with version and releaseInfo
     * @private
     */
    async _checkReleases(repo) {
        const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;

        const data = await fetchJson(apiUrl, {
            headers: {
                'User-Agent': 'AIDE-Frame-Updater',
                'Accept': 'application/vnd.github.v3+json',
            },
        });

        if (!data) {
            throw new Error('Failed to fetch releases from GitHub');
        }

        // Extract version from tag (remove 'v' prefix if present)
        const tag = data.tag_name || '0.0.0';
        const version = tag.replace(/^v/, '');

        // Find tarball asset
        let tarballUrl = null;
        const repoName = repo.split('/').pop();

        for (const asset of (data.assets || [])) {
            const name = asset.name || '';
            if (name.endsWith('.tar.gz') && name.includes(repoName)) {
                tarballUrl = asset.browser_download_url;
                break;
            }
        }

        // Fallback to source tarball
        if (!tarballUrl) {
            tarballUrl = data.tarball_url;
        }

        const releaseInfo = {
            tag,
            name: data.name,
            tarball_url: tarballUrl,
            published_at: data.published_at,
            html_url: data.html_url,
        };

        return { version, releaseInfo };
    }

    /**
     * Check raw VERSION file (legacy method).
     * @param {string} repo - GitHub repo
     * @param {string} branch - Branch name
     * @returns {Promise<string>} Version string
     * @private
     */
    async _checkRawVersion(repo, branch) {
        const url = `https://raw.githubusercontent.com/${repo}/${branch}/app/VERSION`;
        const version = await fetchText(url);
        if (!version) {
            throw new Error('Failed to fetch VERSION file from GitHub');
        }
        return version.trim();
    }

    /**
     * Download update from GitHub and stage it.
     * @returns {Promise<object>} Download results
     */
    async downloadUpdate() {
        // Not yet implemented in Node.js version
        return {
            success: false,
            error: 'Download not yet implemented in Node.js version',
        };
    }

    /**
     * Apply staged update.
     * @returns {Promise<object>} Apply results
     */
    async applyUpdate() {
        // Not yet implemented in Node.js version
        return {
            success: false,
            error: 'Apply not yet implemented in Node.js version',
        };
    }

    /**
     * Rollback to previous version.
     * @returns {Promise<object>} Rollback results
     */
    async rollback() {
        // Not yet implemented in Node.js version
        return {
            success: false,
            error: 'Rollback not yet implemented in Node.js version',
        };
    }

    /**
     * Re-enable updates after they were disabled due to failures.
     * @returns {object} Result
     */
    enableUpdates() {
        this._state.updates_disabled = false;
        this._state.consecutive_failures = 0;
        this._saveState();
        return { success: true, message: 'Updates re-enabled' };
    }
}

// =============================================================================
// LEGACY FUNCTIONAL API (for backward compatibility)
// =============================================================================

let _defaultManager = null;
let _legacyConfig = null;

/**
 * Start auto-check with a simple config object (legacy API).
 * @param {object} config - Config with githubRepo and optional settings
 */
function startAutoCheck(config) {
    if (!config || !config.githubRepo) return;

    _legacyConfig = config;

    const manager = new UpdateManager({
        source: {
            repo: config.githubRepo,
            branch: config.branch || 'main',
            useReleases: config.useReleases !== false,
        },
        serviceName: config.serviceName,
        autoCheck: config.autoCheck !== false,
        autoCheckHours: config.autoCheckHours || 24,
        enabled: config.enabled !== false,
    });

    _defaultManager = manager;
    manager.startAutoCheck();
}

/**
 * Stop auto-check (legacy API).
 */
function stopAutoCheck() {
    if (_defaultManager) {
        _defaultManager.stopAutoCheck();
    }
}

/**
 * Get status using default manager (legacy API).
 * @returns {object} Status object
 */
function getStatus() {
    if (_defaultManager) {
        return _defaultManager.getStatus();
    }

    // Return minimal status without manager
    const localVersion = getLocalVersion();
    const platform = platformDetect.PLATFORM;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return {
        update_state: UpdateState.IDLE,
        current_version: localVersion,
        available_version: null,
        update_available: false,
        last_check: null,
        platform: platform,
        memory: {
            total_mb: Math.round(totalMem / 1024 / 1024),
            used_mb: Math.round((totalMem - freeMem) / 1024 / 1024),
            free_mb: Math.round(freeMem / 1024 / 1024),
        },
    };
}

/**
 * Check for updates using default manager (legacy API).
 * @param {object} config - Config with githubRepo
 * @returns {Promise<object>} Check results
 */
async function checkForUpdate(config) {
    if (!_defaultManager && config) {
        startAutoCheck(config);
    }

    if (_defaultManager) {
        return _defaultManager.checkForUpdates();
    }

    return { success: false, error: 'No update manager configured' };
}

/**
 * Get remote version from GitHub (legacy API).
 * @param {object} config - Update configuration
 * @returns {Promise<string|null>} Remote version or null
 */
async function getRemoteVersion(config) {
    const { githubRepo, branch = 'main' } = config;

    // Try GitHub Releases API first
    const releasesUrl = `https://api.github.com/repos/${githubRepo}/releases/latest`;
    const release = await fetchJson(releasesUrl);
    if (release && release.tag_name) {
        return release.tag_name.replace(/^v/, '');
    }

    // Fallback: fetch VERSION file from branch
    const versionUrl = `https://raw.githubusercontent.com/${githubRepo}/${branch}/app/VERSION`;
    const version = await fetchText(versionUrl);
    if (version) {
        return version.trim();
    }

    return null;
}

module.exports = {
    // Class-based API (recommended)
    UpdateManager,
    UpdateState,

    // Utility functions
    getLocalVersion,
    compareVersions,

    // Legacy functional API (for backward compatibility)
    startAutoCheck,
    stopAutoCheck,
    getStatus,
    checkForUpdate,
    getRemoteVersion,
};
