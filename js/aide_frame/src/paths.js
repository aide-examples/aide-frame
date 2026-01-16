/**
 * Central path configuration for applications.
 *
 * Provides base path management that applications can extend with their own paths.
 * Call init() once at application startup before importing other modules.
 *
 * Usage:
 *   const { paths } = require('aide-frame');
 *
 *   // Basic initialization with explicit directory
 *   paths.init("/path/to/app");
 *
 *   // Access paths
 *   console.log(paths.APP_DIR);      // app/ directory
 *   console.log(paths.PROJECT_DIR);  // Parent of app/
 *
 *   // Applications can register additional paths
 *   paths.register("DOCS_DIR", path.join(paths.APP_DIR, "docs"));
 */

const path = require('path');
const fs = require('fs');

// Base directories - set by init()
let APP_DIR = null;         // app/ directory (where the main code lives)
let PROJECT_DIR = null;     // Parent of app/ (repo root, contains config.json)
let STATIC_DIR = null;      // app/static/ (common for web apps)
let VERSION_FILE = null;    // app/VERSION
let UPDATE_STATE_DIR = null;  // .update/ directory (sibling to app/)

// Application-specific paths (registered via register())
const _appPaths = {};

let _initialized = false;

/**
 * Initialize all path constants.
 * @param {string|null} appDir - Path to app/ directory. If null, auto-detects.
 */
function init(appDir = null) {
    if (appDir === null) {
        // Auto-detect: this file is in js/aide_frame/src/, so aide-frame root is ../../../
        const aideFrameRoot = path.dirname(path.dirname(path.dirname(__dirname)));
        // For auto-detect, we just set the aide-frame paths
        _initialized = true;

        const aideFrameDocs = path.join(aideFrameRoot, 'docs');
        if (fs.existsSync(aideFrameDocs) && fs.statSync(aideFrameDocs).isDirectory()) {
            register('AIDE_FRAME_DOCS_DIR', aideFrameDocs);
        }

        const aideFrameStatic = path.join(aideFrameRoot, 'static');
        if (fs.existsSync(aideFrameStatic) && fs.statSync(aideFrameStatic).isDirectory()) {
            register('AIDE_FRAME_STATIC_DIR', aideFrameStatic);
        }
        return;
    }

    APP_DIR = appDir;
    PROJECT_DIR = path.dirname(appDir);
    STATIC_DIR = path.join(appDir, 'static');
    VERSION_FILE = path.join(appDir, 'VERSION');
    UPDATE_STATE_DIR = path.join(PROJECT_DIR, '.update');

    // Mark as initialized before registering paths to avoid recursion
    _initialized = true;

    // Register aide-frame's own paths
    // __dirname is js/aide_frame/src
    // aide-frame root is ../../../ from here
    const aideFrameSrc = __dirname;                           // js/aide_frame/src
    const aideFramePkg = path.dirname(aideFrameSrc);          // js/aide_frame
    const aideFrameJs = path.dirname(aideFramePkg);           // js
    const aideFrameRoot = path.dirname(aideFrameJs);          // aide-frame

    const aideFrameDocs = path.join(aideFrameRoot, 'docs');
    if (fs.existsSync(aideFrameDocs) && fs.statSync(aideFrameDocs).isDirectory()) {
        register('AIDE_FRAME_DOCS_DIR', aideFrameDocs);
    }

    const aideFrameStatic = path.join(aideFrameRoot, 'static');
    if (fs.existsSync(aideFrameStatic) && fs.statSync(aideFrameStatic).isDirectory()) {
        register('AIDE_FRAME_STATIC_DIR', aideFrameStatic);
    }
}

/**
 * Ensure paths are initialized, auto-init if not.
 */
function ensureInitialized() {
    if (!_initialized) {
        init();
    }
}

/**
 * Register an application-specific path.
 * @param {string} name - Path name
 * @param {string} pathValue - The path value
 */
function register(name, pathValue) {
    ensureInitialized();
    _appPaths[name] = pathValue;
}

/**
 * Get a registered path by name.
 * @param {string} name - Path name
 * @param {*} defaultValue - Default value if not registered
 * @returns {string|*} Path value or default
 */
function get(name, defaultValue = null) {
    if (name in _appPaths) {
        return _appPaths[name];
    }
    // Check module-level variables
    const moduleVars = { APP_DIR, PROJECT_DIR, STATIC_DIR, VERSION_FILE, UPDATE_STATE_DIR };
    if (name in moduleVars) {
        return moduleVars[name];
    }
    return defaultValue;
}

// =============================================================================
// PATH SECURITY
// =============================================================================

/**
 * Error raised when a path contains unsafe traversal sequences.
 */
class PathSecurityError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PathSecurityError';
    }
}

/**
 * Resolve a path safely, rejecting path traversal attempts.
 * @param {string} pathStr - Path from config (relative or absolute)
 * @param {string|null} baseDir - Base directory for relative paths (defaults to PROJECT_DIR)
 * @returns {string} Absolute path string
 * @throws {PathSecurityError} If path contains '..' traversal sequences
 */
function resolveSafePath(pathStr, baseDir = null) {
    ensureInitialized();
    if (baseDir === null) {
        baseDir = PROJECT_DIR;
    }

    // Block path traversal sequences
    if (pathStr.includes('..')) {
        throw new PathSecurityError(`Path traversal '..' not allowed in path: ${pathStr}`);
    }

    // Resolve relative paths against baseDir
    let resolved;
    if (path.isAbsolute(pathStr)) {
        resolved = path.normalize(pathStr);
    } else {
        resolved = path.normalize(path.join(baseDir, pathStr));
    }

    // Double-check the resolved path doesn't escape (belt and suspenders)
    if (resolved.includes('..')) {
        throw new PathSecurityError(`Resolved path contains traversal: ${resolved}`);
    }

    return resolved;
}

// =============================================================================
// MIME TYPES
// =============================================================================

/**
 * MIME types for static file serving (shared across modules)
 */
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml',
    '.pdf': 'application/pdf',
};

module.exports = {
    init,
    ensureInitialized,
    register,
    get,
    resolveSafePath,
    PathSecurityError,
    MIME_TYPES,

    // Getters for base directories
    get APP_DIR() { return APP_DIR; },
    get PROJECT_DIR() { return PROJECT_DIR; },
    get STATIC_DIR() { return STATIC_DIR; },
    get VERSION_FILE() { return VERSION_FILE; },
    get UPDATE_STATE_DIR() { return UPDATE_STATE_DIR; },
};
