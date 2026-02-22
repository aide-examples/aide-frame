/**
 * Configuration loading utilities.
 *
 * Provides JSON configuration loading with deep merge support.
 * Applications provide their own DEFAULT_CONFIG.
 *
 * Usage:
 *   const { loadConfig } = require('aide-frame').config;
 *
 *   // Simple load (no defaults)
 *   const config = loadConfig("config.json");
 *
 *   // With application defaults
 *   const MY_DEFAULTS = { port: 8080, debug: false };
 *   const config = loadConfig("config.json", MY_DEFAULTS);
 *
 *   // With search paths
 *   const config = loadConfig("config.json", null, [
 *       "/etc/myapp/config.json",
 *       "~/.myapp/config.json",
 *       "./config.json"
 *   ]);
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Recursively merge override into base.
 * @param {object} base - Base object (modified in place)
 * @param {object} override - Object with override values
 * @returns {object} The merged base object
 */
function deepMerge(base, override) {
    for (const key of Object.keys(override)) {
        const value = override[key];
        if (key in base &&
            typeof base[key] === 'object' && base[key] !== null && !Array.isArray(base[key]) &&
            typeof value === 'object' && value !== null && !Array.isArray(value)) {
            deepMerge(base[key], value);
        } else {
            base[key] = value;
        }
    }
    return base;
}

/**
 * Expand user home directory (~) in path.
 * @param {string} pathStr - Path string
 * @returns {string} Expanded path
 */
function expandUser(pathStr) {
    if (pathStr.startsWith('~')) {
        return path.join(os.homedir(), pathStr.slice(1));
    }
    return pathStr;
}

/**
 * Strip comments and trailing commas from JSON content (JSONC support).
 * Supports // line comments and /* block comments *​/.
 * Ignores comments inside quoted strings.
 * @param {string} content - Raw JSONC content
 * @returns {string} Clean JSON ready for JSON.parse()
 */
function stripJsonComments(content) {
    let result = '';
    let i = 0;
    while (i < content.length) {
        // String literal — copy verbatim
        if (content[i] === '"') {
            result += '"';
            i++;
            while (i < content.length && content[i] !== '"') {
                if (content[i] === '\\') { result += content[i++]; }  // skip escaped char
                if (i < content.length) { result += content[i++]; }
            }
            if (i < content.length) { result += content[i++]; }  // closing quote
        }
        // Line comment
        else if (content[i] === '/' && content[i + 1] === '/') {
            while (i < content.length && content[i] !== '\n') i++;
        }
        // Block comment
        else if (content[i] === '/' && content[i + 1] === '*') {
            i += 2;
            while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
            i += 2;  // skip */
        }
        // Normal character
        else {
            result += content[i++];
        }
    }
    // Remove trailing commas before } or ]
    return result.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Load configuration from JSON file, merging with defaults.
 * Supports JSONC (JSON with comments): // line comments, /* block comments *​/, trailing commas.
 * @param {string|null} configPath - Direct path to config file (takes precedence)
 * @param {object|null} defaults - Default configuration object
 * @param {string[]|null} searchPaths - List of paths to search for config file
 * @returns {object} Configuration object
 */
function loadConfig(configPath = null, defaults = null, searchPaths = null) {
    // Start with defaults (deep copy to avoid modifying original)
    let config = {};
    if (defaults) {
        config = JSON.parse(JSON.stringify(defaults));
    }

    // Determine which config file to load
    const pathsToTry = [];
    if (configPath) {
        pathsToTry.push(configPath);
    }
    if (searchPaths) {
        pathsToTry.push(...searchPaths);
    }

    // Expand user paths (~)
    const expandedPaths = pathsToTry.map(expandUser);

    // Try each path
    let loadedPath = null;
    for (const p of expandedPaths) {
        if (fs.existsSync(p)) {
            try {
                const content = fs.readFileSync(p, 'utf8');
                const userConfig = JSON.parse(stripJsonComments(content));
                deepMerge(config, userConfig);
                loadedPath = p;
                break;
            } catch (e) {
                if (e instanceof SyntaxError) {
                    console.log(`Config parse error in ${p}: ${e.message}`);
                } else {
                    console.log(`Config read error in ${p}: ${e.message}`);
                }
            }
        }
    }

    if (!loadedPath && pathsToTry.length > 0) {
        console.log('No config file found, using defaults');
    }

    return config;
}

/**
 * Save configuration to JSON file.
 * @param {object} config - Configuration object
 * @param {string} configPath - Path to save to
 * @param {number} indent - JSON indentation (default 2)
 * @returns {boolean} True on success, false on error
 */
function saveConfig(config, configPath, indent = 2) {
    try {
        const content = JSON.stringify(config, null, indent);
        fs.writeFileSync(configPath, content, 'utf8');
        return true;
    } catch (e) {
        console.log(`Config save error: ${e.message}`);
        return false;
    }
}

module.exports = {
    deepMerge,
    stripJsonComments,
    loadConfig,
    saveConfig,
};
