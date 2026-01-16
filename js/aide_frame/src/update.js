/**
 * Remote update system for aide-frame applications.
 *
 * Provides functions for checking, downloading, and applying updates
 * from GitHub repositories.
 *
 * Usage:
 *   const { update } = require('aide-frame');
 *
 *   // Check for updates
 *   const available = await update.checkForUpdate(config);
 *
 *   // Get current version
 *   const version = update.getLocalVersion();
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
 * Default configuration for UpdateManager
 */
const DEFAULT_CONFIG = {
    enabled: true,
    autoCheck: true,
    autoCheckHours: 24,
};

/**
 * Cached state for update checks (module-level singleton)
 */
let cachedState = {
    availableVersion: null,
    lastCheck: null,
    updateAvailable: false,
};

let autoCheckTimer = null;
let currentConfig = null;

/**
 * Get the local version from VERSION file.
 * @returns {string|null} Version string or null if not found
 */
function getLocalVersion() {
    paths.ensureInitialized();
    const versionFile = paths.VERSION_FILE;

    if (!versionFile || !fs.existsSync(versionFile)) {
        return null;
    }

    try {
        return fs.readFileSync(versionFile, 'utf8').trim();
    } catch (e) {
        logger.error(`Error reading version file: ${e.message}`);
        return null;
    }
}

/**
 * Get remote version from GitHub.
 * @param {object} config - Update configuration
 * @param {string} config.githubRepo - GitHub repo (e.g., "user/repo")
 * @param {string} config.branch - Branch to check (default: "main")
 * @returns {Promise<string|null>} Remote version or null
 */
async function getRemoteVersion(config) {
    const { githubRepo, branch = 'main' } = config;

    // Try GitHub Releases API first
    const releasesUrl = `https://api.github.com/repos/${githubRepo}/releases/latest`;
    const release = await fetchJson(releasesUrl);
    if (release && release.tag_name) {
        // Remove 'v' prefix if present
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

/**
 * Compare versions (simple semver-like comparison).
 * @param {string} v1 - First version
 * @param {string} v2 - Second version
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(p => parseInt(p, 10) || 0);
    const parts2 = v2.split('.').map(p => parseInt(p, 10) || 0);

    const maxLen = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < maxLen; i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 < p2) return -1;
        if (p1 > p2) return 1;
    }
    return 0;
}

/**
 * Check if an update is available.
 * @param {object} config - Update configuration
 * @returns {Promise<object>} Update status object
 */
async function checkForUpdate(config) {
    const localVersion = getLocalVersion();
    const remoteVersion = await getRemoteVersion(config);

    // Update cached state
    cachedState.lastCheck = new Date().toISOString();

    if (!localVersion) {
        cachedState.updateAvailable = false;
        return {
            available: false,
            error: 'Local version not found',
            localVersion: null,
            remoteVersion,
        };
    }

    if (!remoteVersion) {
        cachedState.updateAvailable = false;
        return {
            available: false,
            error: 'Could not fetch remote version',
            localVersion,
            remoteVersion: null,
        };
    }

    const comparison = compareVersions(localVersion, remoteVersion);
    const available = comparison < 0;

    // Update cached state
    cachedState.availableVersion = remoteVersion;
    cachedState.updateAvailable = available;

    return {
        available,
        localVersion,
        remoteVersion,
        message: available
            ? `Update available: ${localVersion} → ${remoteVersion}`
            : 'Already up to date',
    };
}

/**
 * Get current update status (local info only, no network calls).
 * Returns cached update info from last check.
 * @returns {object} Status object with local version and platform info
 */
function getStatus() {
    const localVersion = getLocalVersion();
    const platform = platformDetect.PLATFORM;

    // Memory info
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
        state: UpdateState.IDLE,
        current_version: localVersion,
        available_version: cachedState.availableVersion,
        update_available: cachedState.updateAvailable,
        last_check: cachedState.lastCheck,
        platform: platform,
        memory: {
            total_mb: Math.round(totalMem / 1024 / 1024),
            used_mb: Math.round(usedMem / 1024 / 1024),
            free_mb: Math.round(freeMem / 1024 / 1024),
        },
    };
}

/**
 * Start automatic periodic update checks.
 * @param {object} config - Update configuration with githubRepo
 */
function startAutoCheck(config) {
    if (!config || !config.githubRepo) {
        return;
    }

    currentConfig = { ...DEFAULT_CONFIG, ...config };

    if (!currentConfig.enabled || !currentConfig.autoCheck) {
        return;
    }

    const intervalMs = (currentConfig.autoCheckHours || 24) * 3600 * 1000;

    async function doCheck() {
        try {
            const result = await checkForUpdate(currentConfig);
            if (result.available) {
                logger.info(`Update available: ${result.remoteVersion}`);
            } else {
                logger.debug(`Auto-check complete: ${result.message || 'up to date'}`);
            }
        } catch (e) {
            logger.warning(`Auto-check failed: ${e.message}`);
        }

        // Schedule next check
        scheduleNextCheck(intervalMs);
    }

    // Check if we need to run immediately
    let runNow = true;
    const lastCheck = cachedState.lastCheck;

    if (lastCheck) {
        try {
            const lastDt = new Date(lastCheck);
            const elapsed = Date.now() - lastDt.getTime();
            if (elapsed < intervalMs) {
                // Schedule for remaining time
                const remaining = intervalMs - elapsed;
                logger.debug(`Next update check in ${(remaining / 3600000).toFixed(1)} hours`);
                scheduleNextCheck(remaining);
                runNow = false;
            }
        } catch (e) {
            // Invalid date, run now
        }
    }

    if (runNow) {
        // Run first check after short delay (don't block startup)
        autoCheckTimer = setTimeout(doCheck, 5000);
        logger.debug('Update auto-check scheduled (first check in 5s)');
    }
}

/**
 * Schedule the next auto-check.
 * @param {number} ms - Milliseconds until next check
 */
function scheduleNextCheck(ms) {
    if (autoCheckTimer) {
        clearTimeout(autoCheckTimer);
    }

    autoCheckTimer = setTimeout(async () => {
        try {
            const result = await checkForUpdate(currentConfig);
            if (result.available) {
                logger.info(`Update available: ${result.remoteVersion}`);
            }
        } catch (e) {
            logger.warning(`Auto-check failed: ${e.message}`);
        }
        // Reschedule
        const hours = (currentConfig && currentConfig.autoCheckHours) || 24;
        scheduleNextCheck(hours * 3600 * 1000);
    }, ms);
}

/**
 * Stop automatic update checks.
 */
function stopAutoCheck() {
    if (autoCheckTimer) {
        clearTimeout(autoCheckTimer);
        autoCheckTimer = null;
    }
}

module.exports = {
    UpdateState,
    getLocalVersion,
    getRemoteVersion,
    compareVersions,
    checkForUpdate,
    getStatus,
    startAutoCheck,
    stopAutoCheck,
};
