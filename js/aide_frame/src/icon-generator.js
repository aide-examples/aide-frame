/**
 * PWA icon generator for aide-frame applications.
 *
 * Generates SVG icons based on configuration, with automatic caching
 * based on config hash to avoid unnecessary regeneration.
 *
 * Usage:
 *   const { iconGenerator } = require('aide-frame');
 *
 *   // In your app startup, after loading config:
 *   const pwaConfig = config.pwa || {};
 *   iconGenerator.ensureIcons(appDir, pwaConfig);
 *
 *   // Or with force regeneration:
 *   iconGenerator.ensureIcons(appDir, pwaConfig, true);
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logger } = require('./log');

/**
 * Compute a hash of the icon configuration for cache validation.
 *
 * @param {object} iconConfig - The pwa.icon configuration object
 * @param {string} themeColor - The theme_color from PWA config (used as default background)
 * @returns {string} Short hash string (12 chars)
 */
function computeIconHash(iconConfig, themeColor) {
    const configForHash = {
        background: iconConfig.background || themeColor || '#2563eb',
        line1_text: iconConfig.line1_text || 'aide',
        line1_color: iconConfig.line1_color || '#94a3b8',
        line1_size: iconConfig.line1_size || 0.25,
        line2_text: iconConfig.line2_text || '',
        line2_color: iconConfig.line2_color || '#ffffff',
        line2_size: iconConfig.line2_size || 0.45,
    };
    const configStr = JSON.stringify(configForHash, Object.keys(configForHash).sort());
    return crypto.createHash('md5').update(configStr).digest('hex').substring(0, 12);
}

/**
 * Extract the config hash from an existing SVG file.
 *
 * @param {string} svgPath - Path to the SVG file
 * @returns {string|null} Hash string if found, null otherwise
 */
function extractHashFromSvg(svgPath) {
    if (!fs.existsSync(svgPath)) {
        return null;
    }

    try {
        const content = fs.readFileSync(svgPath, 'utf-8');
        const match = content.match(/<!-- aide-icon-hash: ([a-f0-9]+) -->/);
        if (match) {
            return match[1];
        }
    } catch (err) {
        // File read error, treat as no hash
    }

    return null;
}

/**
 * Escape special XML characters.
 *
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeXml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Generate SVG content for an icon.
 *
 * The icon has two lines of text:
 * - Line 1: Small italic text near top (e.g., "aide")
 * - Line 2: Larger bold text below, vertically centered (e.g., "Py")
 *
 * @param {number} size - Icon size in pixels (192 or 512)
 * @param {object} iconConfig - The pwa.icon configuration object
 * @param {string} themeColor - Fallback background color from PWA config
 * @param {string} configHash - Hash to embed in the SVG
 * @returns {string} SVG content
 */
function generateSvg(size, iconConfig, themeColor, configHash) {
    // Extract config with defaults
    const background = iconConfig.background || themeColor || '#2563eb';
    const line1Text = iconConfig.line1_text || 'aide';
    const line1Color = iconConfig.line1_color || '#94a3b8';
    const line1Size = iconConfig.line1_size || 0.25;
    const line2Text = iconConfig.line2_text || '';
    const line2Color = iconConfig.line2_color || '#ffffff';
    const line2Size = iconConfig.line2_size || 0.45;

    // Calculate font sizes based on icon size
    const fontSize1 = Math.floor(size * line1Size);
    const fontSize2 = Math.floor(size * line2Size);

    // Calculate Y positions for visual balance
    // Line 1: small text near top, positioned at ~35% from top
    // Line 2: larger text centered, positioned at ~70% from top
    const y1 = Math.floor(size * 0.35);
    const y2 = Math.floor(size * 0.70);

    // Center X position
    const cx = Math.floor(size / 2);

    // Build SVG
    const lines = [
        `<!-- aide-icon-hash: ${configHash} -->`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
        `  <rect width="${size}" height="${size}" fill="${background}"/>`,
    ];

    // Line 1: small italic text
    if (line1Text) {
        lines.push(
            `  <text x="${cx}" y="${y1}" ` +
            `font-family="Arial, Helvetica, sans-serif" ` +
            `font-size="${fontSize1}" ` +
            `font-style="italic" ` +
            `fill="${line1Color}" ` +
            `text-anchor="middle">${escapeXml(line1Text)}</text>`
        );
    }

    // Line 2: large bold text
    if (line2Text) {
        lines.push(
            `  <text x="${cx}" y="${y2}" ` +
            `font-family="Arial, Helvetica, sans-serif" ` +
            `font-size="${fontSize2}" ` +
            `font-weight="bold" ` +
            `fill="${line2Color}" ` +
            `text-anchor="middle">${escapeXml(line2Text)}</text>`
        );
    }

    lines.push('</svg>');
    lines.push('');  // Final newline

    return lines.join('\n');
}

/**
 * Generate PWA icons if needed.
 *
 * Icons are generated to appDir/static/icons/ as icon-192.svg and icon-512.svg.
 * A hash of the icon configuration is embedded in each SVG file as an XML comment.
 * Icons are only regenerated if:
 * - The icon files don't exist
 * - The embedded hash doesn't match the current config
 * - force=true is passed
 *
 * @param {string} appDir - Path to the app directory (e.g., /path/to/project/app)
 * @param {object} pwaConfig - The full PWA configuration object (from config.pwa || {})
 * @param {boolean} force - Force regeneration even if hash matches (default: false)
 * @returns {boolean} True if icons were generated, false if existing icons were kept
 *
 * @example
 *   const { iconGenerator } = require('aide-frame');
 *
 *   const pwaConfig = config.pwa || {};
 *
 *   // Only generates if needed
 *   if (iconGenerator.ensureIcons(appDir, pwaConfig)) {
 *       console.log('Icons regenerated');
 *   } else {
 *       console.log('Icons up to date');
 *   }
 */
function ensureIcons(appDir, pwaConfig, force = false) {
    // Check if icon generation is configured
    const iconConfig = pwaConfig.icon || {};

    // line2_text is required - if not set, skip icon generation
    if (!iconConfig.line2_text) {
        logger.debug('PWA icon generation skipped: no pwa.icon.line2_text configured');
        return false;
    }

    // Set up paths
    const iconsDir = path.join(appDir, 'static', 'icons');
    const icon192Path = path.join(iconsDir, 'icon-192.svg');
    const icon512Path = path.join(iconsDir, 'icon-512.svg');

    // Compute expected hash
    const themeColor = pwaConfig.theme_color || '#2563eb';
    const expectedHash = computeIconHash(iconConfig, themeColor);

    // Check if regeneration is needed
    if (!force) {
        const existingHash192 = extractHashFromSvg(icon192Path);
        const existingHash512 = extractHashFromSvg(icon512Path);

        if (existingHash192 === expectedHash && existingHash512 === expectedHash) {
            logger.debug(`PWA icons up to date (hash: ${expectedHash})`);
            return false;
        }

        if (existingHash192 === null || existingHash512 === null) {
            logger.info('Generating PWA icons (new or missing)');
        } else {
            logger.info('Regenerating PWA icons (config changed)');
        }
    } else {
        logger.info('Force-regenerating PWA icons');
    }

    // Create icons directory if needed
    fs.mkdirSync(iconsDir, { recursive: true });

    // Generate both icons
    const svg192 = generateSvg(192, iconConfig, themeColor, expectedHash);
    const svg512 = generateSvg(512, iconConfig, themeColor, expectedHash);

    // Write files
    try {
        fs.writeFileSync(icon192Path, svg192, 'utf-8');
        fs.writeFileSync(icon512Path, svg512, 'utf-8');
        logger.info(`Generated PWA icons: ${iconsDir}/icon-{192,512}.svg`);
        return true;
    } catch (err) {
        logger.error(`Failed to write PWA icons: ${err.message}`);
        return false;
    }
}

module.exports = {
    ensureIcons,
    // Exported for testing
    computeIconHash,
    extractHashFromSvg,
    generateSvg,
};
