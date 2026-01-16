/**
 * QR code generation utilities for aide-frame applications.
 *
 * Provides functions for generating QR codes as:
 * - Base64 data URLs (for web embedding)
 * - Files on disk
 *
 * Uses the 'qrcode' npm package for generation.
 *
 * Usage:
 *   const { qrcodeUtils } = require('aide-frame');
 *
 *   // For web display
 *   const dataUrl = await qrcodeUtils.generateBase64("https://example.com");
 *
 *   // Check availability
 *   if (qrcodeUtils.isAvailable()) {
 *       // QR code generation is available
 *   }
 */

const { logger } = require('./log');

let qrcode = null;

/**
 * Check if qrcode library is available.
 * @returns {boolean} True if qrcode library is installed
 */
function isAvailable() {
    try {
        if (!qrcode) {
            qrcode = require('qrcode');
        }
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Generate a QR code as a base64 data URL.
 *
 * @param {string} data - Text or URL to encode
 * @param {object} options - Options
 * @param {number} options.width - Width in pixels (default: 200)
 * @param {number} options.margin - Margin in modules (default: 2)
 * @param {string} options.color - QR code color (default: "#000000")
 * @param {string} options.background - Background color (default: "#ffffff")
 * @returns {Promise<string|null>} Data URL string or null if unavailable
 */
async function generateBase64(data, options = {}) {
    if (!isAvailable()) {
        logger.warning('qrcode library not installed. Run: npm install qrcode');
        return null;
    }

    const {
        width = 200,
        margin = 2,
        color = '#000000',
        background = '#ffffff',
    } = options;

    try {
        const dataUrl = await qrcode.toDataURL(data, {
            width,
            margin,
            color: {
                dark: color,
                light: background,
            },
        });
        return dataUrl;
    } catch (e) {
        logger.error(`Error generating QR code: ${e.message}`);
        return null;
    }
}

/**
 * Generate a QR code and save to file.
 *
 * @param {string} data - Text or URL to encode
 * @param {string} filePath - Path to save PNG file
 * @param {object} options - Options (same as generateBase64)
 * @returns {Promise<boolean>} True on success, false on failure
 */
async function generateFile(data, filePath, options = {}) {
    if (!isAvailable()) {
        logger.warning('qrcode library not installed. Run: npm install qrcode');
        return false;
    }

    const {
        width = 200,
        margin = 2,
        color = '#000000',
        background = '#ffffff',
    } = options;

    try {
        await qrcode.toFile(filePath, data, {
            width,
            margin,
            color: {
                dark: color,
                light: background,
            },
        });
        return true;
    } catch (e) {
        logger.error(`Error saving QR code to file: ${e.message}`);
        return false;
    }
}

/**
 * Generate QR code as terminal string (for CLI display).
 *
 * @param {string} data - Text or URL to encode
 * @param {object} options - Options
 * @param {boolean} options.small - Use small mode (default: true)
 * @returns {Promise<string|null>} Terminal string or null if unavailable
 */
async function generateTerminal(data, options = {}) {
    if (!isAvailable()) {
        logger.warning('qrcode library not installed. Run: npm install qrcode');
        return null;
    }

    const { small = true } = options;

    try {
        const result = await qrcode.toString(data, {
            type: 'terminal',
            small,
        });
        return result;
    } catch (e) {
        logger.error(`Error generating terminal QR code: ${e.message}`);
        return null;
    }
}

module.exports = {
    isAvailable,
    generateBase64,
    generateFile,
    generateTerminal,
};
