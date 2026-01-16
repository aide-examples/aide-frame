/**
 * Remote update manager for applications.
 *
 * Provides GitHub-based updates with:
 * - Version checking against GitHub repository
 * - Download and staging from GitHub Releases (tarball)
 * - Backup, apply, and rollback of updates
 * - Automatic periodic update checks
 * - State persistence
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
 *       updateableDirs: ["static", "demos"],  // Directories to sync (delete removed files)
 *       requiredFiles: ["VERSION"],           // Files that must be in update
 *   });
 *
 *   // Check for updates
 *   const result = await manager.checkForUpdates();
 *
 *   // Download and stage
 *   const download = await manager.downloadUpdate();
 *
 *   // Apply staged update
 *   const apply = await manager.applyUpdate();
 *
 *   // Confirm after successful startup
 *   manager.confirmUpdate();
 *
 *   // Get current status
 *   const status = manager.getStatus();
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const { spawn } = require('child_process');
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
        updateableDirs: [],      // Directories where files may be deleted
        requiredFiles: ['VERSION'],  // Files that must exist in update
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
     * Collect all files recursively from a directory.
     * @param {string} directory - Directory to scan
     * @returns {string[]} Array of relative file paths
     * @private
     */
    _collectFilesRecursive(directory) {
        const files = [];
        if (!fs.existsSync(directory)) return files;

        const scan = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scan(fullPath);
                } else if (entry.isFile()) {
                    const relPath = path.relative(directory, fullPath);
                    files.push(relPath);
                }
            }
        };

        scan(directory);
        return files;
    }

    /**
     * Remove a directory recursively.
     * @param {string} dirPath - Directory to remove
     * @private
     */
    _rmdir(dirPath) {
        if (!fs.existsSync(dirPath)) return;

        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                this._rmdir(fullPath);
            } else {
                fs.unlinkSync(fullPath);
            }
        }
        fs.rmdirSync(dirPath);
    }

    /**
     * Copy a file, creating parent directories as needed.
     * @param {string} src - Source path
     * @param {string} dst - Destination path
     * @private
     */
    _copyFile(src, dst) {
        const dstDir = path.dirname(dst);
        if (!fs.existsSync(dstDir)) {
            fs.mkdirSync(dstDir, { recursive: true });
        }
        fs.copyFileSync(src, dst);
        // Preserve modification time
        const stat = fs.statSync(src);
        fs.utimesSync(dst, stat.atime, stat.mtime);
    }

    /**
     * Download a file from URL to destination.
     * @param {string} url - URL to download
     * @param {string} destPath - Destination file path
     * @param {object} headers - HTTP headers
     * @returns {Promise<void>}
     * @private
     */
    _downloadFile(url, destPath, headers = {}) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            const options = {
                headers: {
                    'User-Agent': 'AIDE-Frame-Updater',
                    ...headers,
                },
            };

            const request = protocol.get(url, options, (response) => {
                // Handle redirects
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    this._downloadFile(response.headers.location, destPath, headers)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                    return;
                }

                const file = fs.createWriteStream(destPath);
                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });

                file.on('error', (err) => {
                    fs.unlinkSync(destPath);
                    reject(err);
                });
            });

            request.on('error', reject);
            request.setTimeout(120000, () => {
                request.destroy();
                reject(new Error('Download timeout'));
            });
        });
    }

    /**
     * Extract a gzipped tarball.
     * @param {string} tarballPath - Path to .tar.gz file
     * @param {string} destDir - Destination directory
     * @returns {Promise<string[]>} List of extracted file paths
     * @private
     */
    _extractTarball(tarballPath, destDir) {
        return new Promise((resolve, reject) => {
            const extractedFiles = [];
            const fileContent = fs.readFileSync(tarballPath);

            // Decompress gzip
            zlib.gunzip(fileContent, (err, tarData) => {
                if (err) {
                    return reject(new Error(`Gzip decompression failed: ${err.message}`));
                }

                try {
                    // Parse tar format (POSIX ustar)
                    let offset = 0;
                    let appPrefix = null;
                    let firstPass = true;

                    // First pass: find app/ prefix
                    while (offset < tarData.length) {
                        // Read header (512 bytes)
                        if (offset + 512 > tarData.length) break;

                        const header = tarData.slice(offset, offset + 512);

                        // Check for empty block (end of archive)
                        if (header.every(b => b === 0)) break;

                        // Extract filename (first 100 bytes, null-terminated)
                        let filename = '';
                        for (let i = 0; i < 100 && header[i] !== 0; i++) {
                            filename += String.fromCharCode(header[i]);
                        }

                        // Check for extended header (prefix field at 345-500)
                        let prefix = '';
                        for (let i = 345; i < 500 && header[i] !== 0; i++) {
                            prefix += String.fromCharCode(header[i]);
                        }
                        if (prefix) {
                            filename = prefix + '/' + filename;
                        }

                        // Extract size (octal, 12 bytes starting at 124)
                        let sizeStr = '';
                        for (let i = 124; i < 136 && header[i] !== 0 && header[i] !== 32; i++) {
                            sizeStr += String.fromCharCode(header[i]);
                        }
                        const size = parseInt(sizeStr, 8) || 0;

                        // Extract type flag (byte at 156)
                        const typeFlag = String.fromCharCode(header[156]);

                        // Look for app/ directory in first pass
                        if (firstPass) {
                            const parts = filename.split('/');
                            const appIdx = parts.indexOf('app');
                            if (appIdx >= 0) {
                                appPrefix = parts.slice(0, appIdx + 1).join('/');
                                firstPass = false;
                            }
                        }

                        // Move to next header (512-byte aligned)
                        offset += 512;
                        const blocks = Math.ceil(size / 512);
                        offset += blocks * 512;
                    }

                    if (!appPrefix) {
                        // No app/ folder, assume flat structure
                        appPrefix = '';
                    }

                    // Second pass: extract files
                    offset = 0;
                    while (offset < tarData.length) {
                        if (offset + 512 > tarData.length) break;

                        const header = tarData.slice(offset, offset + 512);
                        if (header.every(b => b === 0)) break;

                        let filename = '';
                        for (let i = 0; i < 100 && header[i] !== 0; i++) {
                            filename += String.fromCharCode(header[i]);
                        }

                        let prefix = '';
                        for (let i = 345; i < 500 && header[i] !== 0; i++) {
                            prefix += String.fromCharCode(header[i]);
                        }
                        if (prefix) {
                            filename = prefix + '/' + filename;
                        }

                        let sizeStr = '';
                        for (let i = 124; i < 136 && header[i] !== 0 && header[i] !== 32; i++) {
                            sizeStr += String.fromCharCode(header[i]);
                        }
                        const size = parseInt(sizeStr, 8) || 0;

                        const typeFlag = String.fromCharCode(header[156]);

                        offset += 512;

                        // Extract regular files only
                        if ((typeFlag === '0' || typeFlag === '\0') && size > 0) {
                            let relPath;

                            if (appPrefix && filename.startsWith(appPrefix + '/')) {
                                relPath = filename.substring(appPrefix.length + 1);
                            } else if (!appPrefix) {
                                // Check if first component is a version dir (e.g., repo-1.2.3/)
                                const parts = filename.split('/');
                                if (parts.length > 1 && parts[0].includes('-')) {
                                    relPath = parts.slice(1).join('/');
                                } else {
                                    relPath = filename;
                                }
                            } else {
                                relPath = null;
                            }

                            if (relPath && !relPath.startsWith('.') && relPath.length > 0) {
                                const content = tarData.slice(offset, offset + size);
                                const targetPath = path.join(destDir, relPath);

                                fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                                fs.writeFileSync(targetPath, content);
                                extractedFiles.push(relPath);
                            }
                        }

                        const blocks = Math.ceil(size / 512);
                        offset += blocks * 512;
                    }

                    resolve(extractedFiles);

                } catch (parseError) {
                    reject(new Error(`Tar parsing failed: ${parseError.message}`));
                }
            });
        });
    }

    /**
     * Download update from GitHub and stage it.
     * @returns {Promise<object>} Download results
     */
    async downloadUpdate() {
        if (!this.config.enabled) {
            return { success: false, error: 'Updates are disabled in config' };
        }

        if (this._state.updates_disabled) {
            return { success: false, error: 'Updates disabled due to repeated failures' };
        }

        // Check if update is available
        const available = this._state.available_version;
        const local = getLocalVersion();
        if (!available || compareVersions(local, available) !== 1) {
            return { success: false, error: 'No update available to download' };
        }

        const source = this.config.source || {};
        const repo = source.repo;
        if (!repo) {
            return { success: false, error: 'No repository configured' };
        }

        const useReleases = source.useReleases !== false;
        const releaseInfo = this._state.release_info;

        if (useReleases && releaseInfo && releaseInfo.tarball_url) {
            return this._downloadReleaseTarball(available, releaseInfo);
        } else {
            return this._downloadRawFiles(available, repo, source.branch || 'main');
        }
    }

    /**
     * Download and extract release tarball.
     * @param {string} version - Target version
     * @param {object} releaseInfo - Release info with tarball_url
     * @returns {Promise<object>} Download results
     * @private
     */
    async _downloadReleaseTarball(version, releaseInfo) {
        const tarballUrl = releaseInfo.tarball_url;
        if (!tarballUrl) {
            return { success: false, error: 'No tarball URL in release info' };
        }

        // Prepare staging directory
        const stagingDir = path.join(this.stateDir, 'staging');
        try {
            if (fs.existsSync(stagingDir)) {
                this._rmdir(stagingDir);
            }
            fs.mkdirSync(stagingDir, { recursive: true });
        } catch (e) {
            return { success: false, error: `Cannot create staging directory: ${e.message}` };
        }

        this._state.update_state = 'downloading';
        this._saveState();

        // Create temp file for tarball
        const tmpPath = path.join(this.stateDir, 'download.tar.gz');

        try {
            // Determine headers based on URL type
            const headers = {};
            if (tarballUrl.includes('api.github.com')) {
                headers['Accept'] = 'application/vnd.github.v3.raw';
            } else {
                headers['Accept'] = 'application/octet-stream';
            }

            logger.info(`Downloading update from ${tarballUrl}`);
            await this._downloadFile(tarballUrl, tmpPath, headers);

            // Extract tarball
            logger.info('Extracting update...');
            const extractedFiles = await this._extractTarball(tmpPath, stagingDir);

            // Clean up temp file
            if (fs.existsSync(tmpPath)) {
                fs.unlinkSync(tmpPath);
            }

            // Verify required files exist
            const requiredFiles = this.config.requiredFiles || ['VERSION'];
            const missingRequired = requiredFiles.filter(f => !extractedFiles.includes(f));

            if (missingRequired.length > 0) {
                this._state.update_state = 'idle';
                this._saveState();
                return {
                    success: false,
                    error: `Required files missing in release: ${missingRequired.join(', ')}`,
                    extracted: extractedFiles,
                };
            }

            // Update state
            this._state.update_state = 'staged';
            this._state.staged_version = version;
            this._saveState();

            logger.info(`Update ${version} staged successfully`);
            return {
                success: true,
                message: `Update ${version} staged successfully (from release)`,
                staged_version: version,
                downloaded: extractedFiles,
                source: 'release',
            };

        } catch (e) {
            // Clean up on error
            if (fs.existsSync(tmpPath)) {
                try { fs.unlinkSync(tmpPath); } catch (_) {}
            }
            this._state.update_state = 'idle';
            this._saveState();
            return { success: false, error: e.message };
        }
    }

    /**
     * Download individual files from GitHub raw (legacy method).
     * @param {string} version - Target version
     * @param {string} repo - GitHub repo
     * @param {string} branch - Branch name
     * @returns {Promise<object>} Download results
     * @private
     */
    async _downloadRawFiles(version, repo, branch) {
        const baseUrl = `https://raw.githubusercontent.com/${repo}/${branch}/app`;

        // Get file list from GitHub API
        const filesUrl = `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`;
        let filesToUpdate = [];

        try {
            const treeData = await fetchJson(filesUrl, {
                headers: {
                    'User-Agent': 'AIDE-Frame-Updater',
                    'Accept': 'application/vnd.github.v3+json',
                },
            });

            if (treeData && treeData.tree) {
                for (const item of treeData.tree) {
                    if (item.type === 'blob' && item.path.startsWith('app/')) {
                        filesToUpdate.push(item.path.substring(4)); // Remove 'app/' prefix
                    }
                }
            }
        } catch (e) {
            logger.warning(`Failed to get file list from API: ${e.message}`);
        }

        if (filesToUpdate.length === 0) {
            return { success: false, error: 'Could not retrieve file list from GitHub' };
        }

        // Prepare staging directory
        const stagingDir = path.join(this.stateDir, 'staging');
        try {
            if (fs.existsSync(stagingDir)) {
                this._rmdir(stagingDir);
            }
            fs.mkdirSync(stagingDir, { recursive: true });
        } catch (e) {
            return { success: false, error: `Cannot create staging directory: ${e.message}` };
        }

        this._state.update_state = 'downloading';
        this._saveState();

        const downloaded = [];
        const errors = [];

        // Download each file
        for (const filepath of filesToUpdate) {
            const url = `${baseUrl}/${filepath}`;
            const stagingPath = path.join(stagingDir, filepath);

            try {
                await this._downloadFile(url, stagingPath);
                downloaded.push(filepath);
            } catch (e) {
                if (!e.message.includes('404')) {
                    errors.push(`${filepath}: ${e.message}`);
                }
            }
        }

        // Check required files
        const requiredFiles = this.config.requiredFiles || ['VERSION'];
        const missingRequired = requiredFiles.filter(f => !downloaded.includes(f));

        if (missingRequired.length > 0) {
            this._state.update_state = 'idle';
            this._saveState();
            return {
                success: false,
                error: `Failed to download required files: ${missingRequired.join(', ')}`,
                downloaded,
                errors: errors.length > 0 ? errors : undefined,
            };
        }

        // Update state
        this._state.update_state = 'staged';
        this._state.staged_version = version;
        this._saveState();

        return {
            success: true,
            message: `Update ${version} staged successfully (from raw files)`,
            staged_version: version,
            downloaded,
            errors: errors.length > 0 ? errors : undefined,
            source: 'raw',
        };
    }

    /**
     * Apply staged update.
     *
     * 1. Backs up current app/ files to .update/backup/
     * 2. Removes files that don't exist in staging (in updateableDirs)
     * 3. Copies staged files to app/
     * 4. Sets pending_verification flag
     * 5. Triggers service restart
     *
     * @returns {Promise<object>} Apply results
     */
    async applyUpdate() {
        if (this._state.update_state !== 'staged') {
            return { success: false, error: 'No staged update to apply' };
        }

        const stagedVersion = this._state.staged_version;
        if (!stagedVersion) {
            return { success: false, error: 'Staged version unknown' };
        }

        const stagingDir = path.join(this.stateDir, 'staging');
        const backupDir = path.join(this.stateDir, 'backup');

        if (!fs.existsSync(stagingDir)) {
            return { success: false, error: 'Staging directory not found' };
        }

        // Get list of staged files
        const stagedFiles = new Set(this._collectFilesRecursive(stagingDir));

        // Create backup of current files
        try {
            if (fs.existsSync(backupDir)) {
                this._rmdir(backupDir);
            }
            fs.mkdirSync(backupDir, { recursive: true });

            const currentVersion = getLocalVersion();

            // Backup all files that are either in staging or currently exist
            for (const relPath of stagedFiles) {
                const src = path.join(paths.APP_DIR, relPath);
                const dst = path.join(backupDir, relPath);
                if (fs.existsSync(src)) {
                    this._copyFile(src, dst);
                }
            }

            // Also backup files that will be deleted (exist locally but not in staging)
            const updateableDirs = this.config.updateableDirs || [];
            for (const updDir of updateableDirs) {
                const dirPath = path.join(paths.APP_DIR, updDir);
                if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
                    const dirFiles = this._collectFilesRecursive(dirPath);
                    for (const f of dirFiles) {
                        const relPath = path.join(updDir, f);
                        if (!stagedFiles.has(relPath)) {
                            const src = path.join(paths.APP_DIR, relPath);
                            const dst = path.join(backupDir, relPath);
                            this._copyFile(src, dst);
                        }
                    }
                }
            }

            this._state.backup_version = currentVersion;

        } catch (e) {
            return { success: false, error: `Backup failed: ${e.message}` };
        }

        // Apply staged files
        this._state.update_state = 'applying';
        this._saveState();

        try {
            // First, remove files that were deleted in the update (only in updateable dirs)
            const updateableDirs = this.config.updateableDirs || [];
            for (const updDir of updateableDirs) {
                const dirPath = path.join(paths.APP_DIR, updDir);
                if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
                    const dirFiles = this._collectFilesRecursive(dirPath);
                    for (const f of dirFiles) {
                        const relPath = path.join(updDir, f);
                        if (!stagedFiles.has(relPath)) {
                            const fullPath = path.join(paths.APP_DIR, relPath);
                            fs.unlinkSync(fullPath);
                            logger.debug(`Removed deleted file: ${relPath}`);
                        }
                    }

                    // Remove empty directories
                    this._removeEmptyDirs(dirPath);
                }
            }

            // Copy all staged files to app/
            for (const relPath of stagedFiles) {
                const src = path.join(stagingDir, relPath);
                const dst = path.join(paths.APP_DIR, relPath);
                this._copyFile(src, dst);
            }

        } catch (e) {
            this._state.update_state = 'idle';
            this._saveState();
            return { success: false, error: `Apply failed: ${e.message}` };
        }

        // Update state for verification
        this._state.update_state = 'verifying';
        this._state.pending_verification = true;
        this._state.current_version = stagedVersion;
        this._saveState();

        // Trigger restart (non-blocking)
        const restartResult = this._triggerRestart();

        logger.info(`Update ${stagedVersion} applied, restarting service`);
        return {
            success: true,
            message: `Update ${stagedVersion} applied, restarting service`,
            applied_version: stagedVersion,
            backup_version: this._state.backup_version,
            restart: restartResult,
        };
    }

    /**
     * Remove empty directories recursively.
     * @param {string} dirPath - Directory to clean
     * @private
     */
    _removeEmptyDirs(dirPath) {
        if (!fs.existsSync(dirPath)) return;

        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const subDir = path.join(dirPath, entry.name);
                this._removeEmptyDirs(subDir);
            }
        }

        // Check if now empty
        const remaining = fs.readdirSync(dirPath);
        if (remaining.length === 0) {
            fs.rmdirSync(dirPath);
        }
    }

    /**
     * Trigger service restart via systemctl.
     * @returns {object} Restart result
     * @private
     */
    _triggerRestart() {
        const serviceName = this.config.serviceName;
        if (!serviceName) {
            return { triggered: false, error: 'No service name configured' };
        }

        try {
            spawn('sudo', ['systemctl', 'restart', serviceName], {
                stdio: 'ignore',
                detached: true,
            }).unref();
            return { triggered: true };
        } catch (e) {
            return { triggered: false, error: e.message };
        }
    }

    /**
     * Rollback to previous version.
     * @returns {Promise<object>} Rollback results
     */
    async rollback() {
        const backupDir = path.join(this.stateDir, 'backup');
        const backupVersion = this._state.backup_version;

        if (!backupVersion) {
            return { success: false, error: 'No backup version available' };
        }

        if (!fs.existsSync(backupDir)) {
            return { success: false, error: 'Backup directory not found' };
        }

        // Restore backup files recursively
        try {
            const backupFiles = this._collectFilesRecursive(backupDir);

            for (const relPath of backupFiles) {
                const src = path.join(backupDir, relPath);
                const dst = path.join(paths.APP_DIR, relPath);
                this._copyFile(src, dst);
            }

        } catch (e) {
            return { success: false, error: `Rollback failed: ${e.message}` };
        }

        // Update state
        this._state.current_version = backupVersion;
        this._state.update_state = 'idle';
        this._state.pending_verification = false;
        this._state.consecutive_failures = (this._state.consecutive_failures || 0) + 1;

        // Disable updates after too many failures
        if (this._state.consecutive_failures >= 2) {
            this._state.updates_disabled = true;
            logger.warning('Updates disabled after 2 consecutive failures');
        }

        this._saveState();

        // Trigger restart
        const restartResult = this._triggerRestart();

        logger.info(`Rolled back to version ${backupVersion}`);
        return {
            success: true,
            message: `Rolled back to version ${backupVersion}`,
            restored_version: backupVersion,
            consecutive_failures: this._state.consecutive_failures,
            updates_disabled: this._state.updates_disabled || false,
            restart: restartResult,
        };
    }

    /**
     * Confirm that the update is working (called after successful startup).
     *
     * Clears the pending_verification flag and resets failure counter.
     * Should be called ~60 seconds after service restart.
     *
     * @returns {object} Confirmation result
     */
    confirmUpdate() {
        if (!this._state.pending_verification) {
            return { success: false, error: 'No pending verification' };
        }

        this._state.pending_verification = false;
        this._state.consecutive_failures = 0;
        this._state.update_state = 'idle';
        this._state.last_update = new Date().toISOString();
        this._saveState();

        // Clean up staging directory
        const stagingDir = path.join(this.stateDir, 'staging');
        if (fs.existsSync(stagingDir)) {
            try {
                this._rmdir(stagingDir);
            } catch (_) {
                // Ignore cleanup errors
            }
        }

        logger.info('Update verified and confirmed');
        return {
            success: true,
            message: 'Update verified and confirmed',
            version: this._state.current_version,
        };
    }

    /**
     * Schedule automatic verification after startup.
     *
     * Call this in your app startup to automatically confirm the update
     * after running successfully for verifyDelaySeconds.
     *
     * @param {number} delaySeconds - Delay before confirming (default: 60)
     */
    scheduleVerification(delaySeconds = 60) {
        if (!this._state.pending_verification) {
            return; // No verification needed
        }

        logger.info(`Update verification scheduled in ${delaySeconds} seconds`);

        setTimeout(() => {
            if (this._state.pending_verification) {
                this.confirmUpdate();
            }
        }, delaySeconds * 1000);
    }

    /**
     * Re-enable updates after they were disabled due to failures.
     * @returns {object} Result
     */
    enableUpdates() {
        this._state.updates_disabled = false;
        this._state.consecutive_failures = 0;
        this._saveState();
        logger.info('Updates re-enabled');
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
