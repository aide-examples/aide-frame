/**
 * Common command-line argument handling for aide-frame applications.
 *
 * Provides reusable argument definitions using the commander library.
 *
 * Usage:
 *   const { Command } = require('commander');
 *   const { args } = require('aide-frame');
 *
 *   const program = new Command();
 *   args.addCommonArgs(program);
 *   program.parse();
 *   const config = args.applyCommonArgs(program.opts());
 */

const path = require('path');
const { Command } = require('commander');
const { setLevel } = require('./log');
const { loadConfig } = require('./config');
const { ensureIcons } = require('./icon-generator');

/**
 * Add common aide-frame arguments to a commander program.
 *
 * @param {Command} program - The Commander program to add arguments to
 * @param {object} options - Options
 * @param {boolean} options.includeLog - Add --log-level argument (default: true)
 * @param {boolean} options.includeConfig - Add --config argument (default: true)
 * @param {boolean} options.includeIcons - Add --regenerate-icons argument (default: true)
 * @param {boolean} options.includePort - Add --port argument (default: true)
 * @param {string} options.configDefault - Default config file name (default: 'config.json')
 */
function addCommonArgs(program, options = {}) {
    const {
        includeLog = true,
        includeConfig = true,
        includeIcons = true,
        includePort = true,
        configDefault = 'config.json',
    } = options;

    if (includeLog) {
        program.option(
            '-l, --log-level <level>',
            'Log level (DEBUG, INFO, WARNING, ERROR)',
            'INFO'
        );
    }

    if (includeConfig) {
        program.option(
            '-c, --config <path>',
            'Config file path',
            configDefault
        );
    }

    if (includeIcons) {
        program.option(
            '--regenerate-icons',
            'Force regeneration of PWA icons'
        );
    }

    if (includePort) {
        program.option(
            '-p, --port <number>',
            'Override server port from config',
            parseInt
        );
    }
}

/**
 * Apply common aide-frame arguments.
 *
 * @param {object} opts - Parsed options from commander
 * @param {object} options - Additional options
 * @param {string[]} options.configSearchPaths - Additional paths to search for config file
 * @param {object} options.configDefaults - Default config values
 * @param {string} options.appDir - App directory for icon generation (optional)
 * @returns {object|null} Loaded config object if --config was used
 */
function applyCommonArgs(opts, options = {}) {
    const {
        configSearchPaths = [],
        configDefaults = {},
        appDir = null,
        systemDir = null,
    } = options;

    // Apply log level
    if (opts.logLevel) {
        setLevel(opts.logLevel);
    }

    // Load config if argument exists
    let config = null;
    if (opts.config) {
        config = loadConfig(opts.config, configDefaults, configSearchPaths);
    }

    // Generate icons if configured and appDir provided
    if (appDir && config && config.pwa) {
        let outputDir = null;
        const iconConfig = config.pwa.icon || {};

        if (systemDir && iconConfig.outputDir === 'system') {
            outputDir = path.join(systemDir, 'icons');
        }

        ensureIcons(appDir, config.pwa, opts.regenerateIcons || false, outputDir);
    }

    // Override port from CLI if specified
    if (opts.port && config) {
        config.port = opts.port;
    }

    return config;
}

/**
 * Parse arguments and apply common settings.
 * Convenience function that combines addCommonArgs and applyCommonArgs.
 *
 * @param {object} options - Options
 * @param {string} options.description - Program description
 * @param {string} options.version - Program version
 * @param {object} options.configDefaults - Default config values
 * @param {string[]} options.configSearchPaths - Config search paths
 * @returns {object} Object with { program, opts, config }
 */
function parseArgs(options = {}) {
    const {
        description = 'AIDE application',
        version = '0.1.0',
        configDefaults = {},
        configSearchPaths = [],
    } = options;

    const program = new Command();
    program
        .description(description)
        .version(version);

    addCommonArgs(program);
    program.parse();

    const opts = program.opts();
    const config = applyCommonArgs(opts, { configSearchPaths, configDefaults });

    return { program, opts, config };
}

module.exports = {
    addCommonArgs,
    applyCommonArgs,
    parseArgs,
};
