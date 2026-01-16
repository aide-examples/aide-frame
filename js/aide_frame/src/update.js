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
const paths = require('./paths');
const { fetchJson, fetchText } = require('./web-request');
const { logger } = require('./log');

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

    if (!localVersion) {
        return {
            available: false,
            error: 'Local version not found',
            localVersion: null,
            remoteVersion,
        };
    }

    if (!remoteVersion) {
        return {
            available: false,
            error: 'Could not fetch remote version',
            localVersion,
            remoteVersion: null,
        };
    }

    const comparison = compareVersions(localVersion, remoteVersion);
    const available = comparison < 0;

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
 * Get current update status.
 * @param {object} config - Update configuration
 * @returns {Promise<object>} Status object
 */
async function getStatus(config) {
    const localVersion = getLocalVersion();
    const remoteVersion = await getRemoteVersion(config);

    return {
        state: UpdateState.IDLE,
        localVersion,
        remoteVersion,
        updateAvailable: remoteVersion && localVersion
            ? compareVersions(localVersion, remoteVersion) < 0
            : false,
    };
}

module.exports = {
    UpdateState,
    getLocalVersion,
    getRemoteVersion,
    compareVersions,
    checkForUpdate,
    getStatus,
};
