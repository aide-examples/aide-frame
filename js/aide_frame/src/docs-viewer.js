/**
 * Generic documentation/help viewer for markdown files.
 *
 * Provides functions to list, load, and structure markdown documentation
 * from configurable directories. Used by applications for both developer
 * documentation (docs/) and user help (help/).
 *
 * Usage:
 *   const { docsViewer } = require('aide-frame');
 *
 *   // Get structure of a docs directory
 *   const structure = docsViewer.getStructure('/path/to/docs', true);
 *
 *   // Extract title from markdown content
 *   const title = docsViewer.extractTitle(markdownContent);
 */

const fs = require('fs');
const path = require('path');
const paths = require('./paths');

/**
 * Standard section definitions for AIDE apps.
 */
const STANDARD_SECTION_DEFS = [
    [null, 'Overview'],
    ['requirements', 'Requirements'],
    ['platform', 'Platform'],
    ['implementation', 'Implementation'],
    ['deployment', 'Deployment'],
    ['development', 'Development'],
];

/**
 * List all markdown files in a directory.
 * @param {string} dirPath - Directory path
 * @returns {string[]} List of filenames like ["index.md", "api.md", ...]
 */
function listFiles(dirPath) {
    if (!dirPath || !fs.existsSync(dirPath)) {
        return [];
    }

    const files = [];
    for (const item of fs.readdirSync(dirPath)) {
        const itemPath = path.join(dirPath, item);
        if (fs.statSync(itemPath).isFile() && item.endsWith('.md')) {
            files.push(item);
        }
    }

    // Sort: index.md first, then alphabetically
    files.sort((a, b) => {
        if (a === 'index.md') return -1;
        if (b === 'index.md') return 1;
        return a.localeCompare(b);
    });

    return files;
}

/**
 * Extract title from markdown content.
 * Looks for first # heading or uses filename.
 * @param {string} content - Markdown content
 * @returns {string|null} Title or null
 */
function extractTitle(content) {
    if (!content) return null;

    // Look for first # heading
    const match = content.match(/^#\s+(.+)$/m);
    if (match) {
        return match[1].trim();
    }

    return null;
}

/**
 * Get file info including title.
 * @param {string} dirPath - Directory path
 * @param {string} filename - Filename
 * @returns {object} File info with path, name, title
 */
function getFileInfo(dirPath, filename) {
    const filePath = path.join(dirPath, filename);
    let title = filename.replace('.md', '').replace(/-/g, ' ').replace(/_/g, ' ');

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const extracted = extractTitle(content);
        if (extracted) {
            title = extracted;
        }
    } catch (e) {
        // Use default title
    }

    return {
        path: filename,
        name: filename,
        title: title,
    };
}

/**
 * Get structure of a documentation directory.
 * @param {string} dirPath - Directory path
 * @param {boolean} useSections - Whether to scan for section subdirectories
 * @returns {object} Structure object with sections and/or files
 */
function getStructure(dirPath, useSections = false) {
    if (!dirPath || !fs.existsSync(dirPath)) {
        return { files: [], sections: [] };
    }

    if (!useSections) {
        // Simple flat structure
        const files = listFiles(dirPath).map(f => getFileInfo(dirPath, f));
        return { files };
    }

    // Multi-section structure
    const sections = [];

    // Root files (Overview section)
    const rootFiles = listFiles(dirPath);
    if (rootFiles.length > 0) {
        sections.push({
            name: 'Overview',
            path: null,
            files: rootFiles.map(f => getFileInfo(dirPath, f)),
        });
    }

    // Scan subdirectories
    for (const item of fs.readdirSync(dirPath)) {
        if (item.startsWith('.')) continue;

        const itemPath = path.join(dirPath, item);
        if (!fs.statSync(itemPath).isDirectory()) continue;

        const subFiles = listFiles(itemPath);
        if (subFiles.length > 0) {
            const sectionName = item.replace(/-/g, ' ').replace(/_/g, ' ');
            const capitalizedName = sectionName.charAt(0).toUpperCase() + sectionName.slice(1);

            sections.push({
                name: capitalizedName,
                path: item,
                files: subFiles.map(f => ({
                    ...getFileInfo(itemPath, f),
                    path: `${item}/${f}`,
                })),
            });
        }
    }

    return { sections };
}

/**
 * Load markdown file content.
 * @param {string} dirPath - Directory path
 * @param {string} filePath - Relative file path
 * @returns {object} Object with path, content, title
 */
function loadFile(dirPath, filePath) {
    // Security: block path traversal
    if (filePath.includes('..') || filePath.startsWith('/')) {
        return { error: 'Forbidden path' };
    }

    const fullPath = path.join(dirPath, filePath);
    if (!fs.existsSync(fullPath)) {
        return { error: `File not found: ${filePath}` };
    }

    try {
        const content = fs.readFileSync(fullPath, 'utf8');
        return {
            path: filePath,
            content: content,
            title: extractTitle(content) || filePath,
        };
    } catch (e) {
        return { error: `Error reading file: ${e.message}` };
    }
}

module.exports = {
    STANDARD_SECTION_DEFS,
    listFiles,
    extractTitle,
    getFileInfo,
    getStructure,
    loadFile,
};
