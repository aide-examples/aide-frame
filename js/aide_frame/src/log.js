/**
 * Central logging configuration for aide-frame applications.
 *
 * Provides a simple logging interface with levels:
 * - DEBUG: Detailed information for debugging
 * - INFO: General operational messages
 * - WARNING: Something unexpected but not critical
 * - ERROR: Something failed
 *
 * Usage:
 *   const { logger } = require('./log');
 *   logger.info("Server started on port 8080");
 *   logger.warning("Config file not found, using defaults");
 *   logger.error("Failed to connect to TV");
 */

const LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARNING: 2,
    ERROR: 3,
};

let currentLevel = LEVELS.DEBUG;

/**
 * Format and print a log message.
 * @param {string} levelName - Level name (DEBUG, INFO, etc.)
 * @param {number} levelValue - Numeric level value
 * @param {string} message - Message to log
 */
function log(levelName, levelValue, message) {
    if (levelValue >= currentLevel) {
        console.log(`${levelName}: ${message}`);
    }
}

/**
 * Logger object with level-specific methods.
 */
const logger = {
    debug: (msg) => log('DEBUG', LEVELS.DEBUG, msg),
    info: (msg) => log('INFO', LEVELS.INFO, msg),
    warning: (msg) => log('WARNING', LEVELS.WARNING, msg),
    error: (msg) => log('ERROR', LEVELS.ERROR, msg),
};

/**
 * Set the logging level.
 * @param {string} level - One of 'DEBUG', 'INFO', 'WARNING', 'ERROR'
 */
function setLevel(level) {
    const upperLevel = level.toUpperCase();
    if (upperLevel in LEVELS) {
        currentLevel = LEVELS[upperLevel];
    } else {
        currentLevel = LEVELS.INFO;
    }
}

/**
 * Only show warnings and errors.
 */
function setQuiet() {
    setLevel('WARNING');
}

/**
 * Show all messages including debug.
 */
function setVerbose() {
    setLevel('DEBUG');
}

// Convenience aliases
const debug = logger.debug;
const info = logger.info;
const warning = logger.warning;
const error = logger.error;

module.exports = {
    logger,
    setLevel,
    setQuiet,
    setVerbose,
    debug,
    info,
    warning,
    error,
    LEVELS,
};
