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

const { Command } = require('commander');
const { setLevel } = require('./log');
const { loadConfig } = require('./config');

/**
 * Add common aide-frame arguments to a commander program.
 *
 * @param {Command} program - The Commander program to add arguments to
 * @param {object} options - Options
 * @param {boolean} options.includeLog - Add --log-level argument (default: true)
 * @param {boolean} options.includeConfig - Add --config argument (default: true)
 * @param {string} options.configDefault - Default config file name (default: 'config.json')
 */
function addCommonArgs(program, options = {}) {
    const {
        includeLog = true,
        includeConfig = true,
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
}

/**
 * Apply common aide-frame arguments.
 *
 * @param {object} opts - Parsed options from commander
 * @param {object} options - Additional options
 * @param {string[]} options.configSearchPaths - Additional paths to search for config file
 * @param {object} options.configDefaults - Default config values
 * @returns {object|null} Loaded config object if --config was used
 */
function applyCommonArgs(opts, options = {}) {
    const {
        configSearchPaths = [],
        configDefaults = {},
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
