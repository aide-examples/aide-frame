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
 *   // For a single directory (simple case)
 *   const structure = docsViewer.getStructure("HELP_DIR");
 *   const content = docsViewer.loadFile("HELP_DIR", "index.md");
 *
 *   // For complex multi-directory docs with sections
 *   const structure = docsViewer.getDocsStructure({
 *       docsDirKey: "DOCS_DIR",
 *       frameworkDirKey: "AIDE_FRAME_DOCS_DIR",
 *   });
 */

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const { logger } = require('./log');

// =============================================================================
// STANDARD SECTION DEFINITIONS
// =============================================================================

/**
 * Standard section ordering for AIDE apps.
 * Apps can use this directly or extend it for app-specific sections.
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
 * Auto-discover section directories and create section_defs.
 *
 * Scans the docs directory for subdirectories containing .md files
 * and returns a section_defs list in a standard order.
 *
 * @param {string} dirKey - Key registered with paths.register(), e.g. "DOCS_DIR"
 * @param {object} options - Options
 * @param {boolean} options.includeRoot - Whether to include root-level files as "Overview"
 * @param {number} options.maxDepth - Maximum directory depth to scan
 * @returns {Array} List of [sectionPath, sectionName] tuples
 */
function autoDiscoverSections(dirKey, options = {}) {
    const { includeRoot = true, maxDepth = 2 } = options;

    paths.ensureInitialized();
    const baseDir = paths.get(dirKey);
    if (!baseDir || !fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
        return includeRoot ? [[null, 'Overview']] : [];
    }

    // Known sections with their display order
    const knownOrder = {
        'null': [0, 0],  // Root/Overview
        'requirements': [1, 0],
        'platform': [2, 0],
        'implementation': [3, 0],
        'deployment': [4, 0],
        'development': [5, 0],
    };

    const discovered = [];

    // Check root level
    if (includeRoot) {
        const hasRootFiles = fs.readdirSync(baseDir).some(f => {
            const filePath = path.join(baseDir, f);
            return f.endsWith('.md') && fs.statSync(filePath).isFile();
        });
        if (hasRootFiles) {
            discovered.push([null, 'Overview']);
        }
    }

    /**
     * Recursively scan directory for sections with .md files.
     */
    function scanDir(relPath, depth) {
        if (depth > maxDepth) return;

        const fullPath = relPath ? path.join(baseDir, relPath) : baseDir;
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) return;

        for (const item of fs.readdirSync(fullPath)) {
            if (item.startsWith('.')) continue;

            const itemRelPath = relPath ? path.join(relPath, item) : item;
            const itemFullPath = path.join(fullPath, item);

            if (!fs.statSync(itemFullPath).isDirectory()) continue;

            // Check if this directory has .md files directly
            const hasMd = fs.readdirSync(itemFullPath).some(f => {
                const filePath = path.join(itemFullPath, f);
                return f.endsWith('.md') && fs.statSync(filePath).isFile();
            });

            if (hasMd) {
                // Convert path to display name
                const displayPart = item
                    .replace(/-/g, ' ')
                    .replace(/_/g, ' ')
                    .split(' ')
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ');
                discovered.push([itemRelPath, displayPart]);
            }

            // Recurse into subdirectories
            scanDir(itemRelPath, depth + 1);
        }
    }

    scanDir('', 1);

    // Sort: known sections first in order, nested sections after their parent
    discovered.sort((a, b) => {
        const pathA = a[0];
        const pathB = b[0];

        function getSortKey(p) {
            const key = p === null ? 'null' : p;
            if (knownOrder[key]) return knownOrder[key];

            // For nested paths like "implementation/slideshow",
            // sort after parent "implementation"
            if (p && p.includes('/')) {
                const parent = p.split('/')[0];
                if (knownOrder[parent]) {
                    return [knownOrder[parent][0], knownOrder[parent][1] + 1];
                }
            }
            return [99, p || ''];
        }

        const keyA = getSortKey(pathA);
        const keyB = getSortKey(pathB);

        if (keyA[0] !== keyB[0]) return keyA[0] - keyB[0];
        if (typeof keyA[1] === 'number' && typeof keyB[1] === 'number') {
            return keyA[1] - keyB[1];
        }
        return String(keyA[1]).localeCompare(String(keyB[1]));
    });

    return discovered;
}

/**
 * List all markdown files in a directory.
 * @param {string} dirKey - Key registered with paths.register(), e.g. "HELP_DIR"
 * @returns {string[]} List of filenames like ["index.md", "api.md", ...]
 */
function listFiles(dirKey) {
    paths.ensureInitialized();
    const baseDir = paths.get(dirKey);
    if (!baseDir || !fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
        return [];
    }

    const files = [];
    for (const f of fs.readdirSync(baseDir)) {
        const filePath = path.join(baseDir, f);
        if (f.endsWith('.md') && fs.statSync(filePath).isFile()) {
            files.push(f);
        }
    }
    return files.sort();
}

/**
 * List all markdown files in a directory recursively.
 * @param {string} dirKey - Key registered with paths.register()
 * @returns {string[]} List of relative paths like ["index.md", "subdir/file.md", ...]
 */
function listFilesRecursive(dirKey) {
    paths.ensureInitialized();
    const baseDir = paths.get(dirKey);
    if (!baseDir || !fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
        return [];
    }

    const files = [];

    function walkDir(dir, relPath) {
        for (const item of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, item);
            const itemRelPath = relPath ? path.join(relPath, item) : item;

            if (fs.statSync(fullPath).isDirectory()) {
                walkDir(fullPath, itemRelPath);
            } else if (item.endsWith('.md')) {
                files.push(itemRelPath);
            }
        }
    }

    walkDir(baseDir, '');
    return files.sort();
}

/**
 * Load a markdown file from a registered directory.
 * @param {string} dirKey - Key registered with paths.register()
 * @param {string} filename - Relative path within the directory
 * @returns {string|null} File content as string, or null if not found or invalid path
 */
function loadFile(dirKey, filename) {
    paths.ensureInitialized();
    const baseDir = paths.get(dirKey);
    if (!baseDir) return null;

    // Security: block path traversal
    if (filename.includes('..')) {
        logger.warning(`Path traversal attempt blocked: ${filename}`);
        return null;
    }

    const filepath = path.join(baseDir, filename);

    // Verify the resolved path is still within baseDir
    const realPath = fs.realpathSync(filepath);
    const realBase = fs.realpathSync(baseDir);
    if (!realPath.startsWith(realBase + path.sep) && realPath !== realBase) {
        logger.warning(`Path escape attempt blocked: ${filename}`);
        return null;
    }

    try {
        return fs.readFileSync(filepath, 'utf8');
    } catch (e) {
        return null;
    }
}

/**
 * Extract the first H1 heading and first sentence from a markdown file.
 * @param {string} filepath - Full path to the markdown file
 * @returns {object} Object with title and description (description may be null)
 */
function extractTitleAndDescription(filepath) {
    let title = null;
    let description = null;

    try {
        const content = fs.readFileSync(filepath, 'utf8');
        const lines = content.split('\n');

        let foundTitle = false;
        let collectingDesc = false;
        const descLines = [];

        for (const line of lines) {
            // Find title (first H1)
            if (!foundTitle && line.startsWith('# ')) {
                title = line.substring(2).trim();
                foundTitle = true;
                collectingDesc = true;
                continue;
            }

            // Collect description after title
            if (collectingDesc) {
                const stripped = line.trim();

                // Skip empty lines right after title
                if (!stripped && descLines.length === 0) continue;

                // Stop at next heading, code block, or horizontal rule
                if (stripped.startsWith('#') || stripped.startsWith('```') || stripped.startsWith('---')) {
                    break;
                }

                // Skip certain markdown elements
                if (stripped.startsWith('|') || stripped.startsWith('-') || stripped.startsWith('*')) {
                    if (descLines.length === 0) continue;
                    break;
                }

                if (stripped) {
                    descLines.push(stripped);
                }

                // Check if we have a complete sentence
                const combined = descLines.join(' ');
                for (let i = 0; i < combined.length; i++) {
                    const char = combined[i];
                    if ('.!?'.includes(char) && i > 10) {
                        // Make sure it's not an abbreviation
                        if (i + 1 >= combined.length || ' \n'.includes(combined[i + 1])) {
                            description = combined.substring(0, i + 1);
                            break;
                        }
                    }
                }
                if (description) break;
            }
        }
    } catch (e) {
        // File not found or read error
    }

    // Fallback for title: filename without extension, formatted
    if (!title) {
        const basename = path.basename(filepath).replace('.md', '');
        title = basename
            .replace(/-/g, ' ')
            .replace(/_/g, ' ')
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }

    return { title, description };
}

/**
 * Extract the first H1 heading from a markdown file.
 * @param {string} filepath - Full path to the markdown file
 * @returns {string} Title string (from first H1 or fallback to filename)
 */
function extractTitle(filepath) {
    const { title } = extractTitleAndDescription(filepath);
    return title;
}

/**
 * Get simple file structure with titles.
 * For a flat directory of help/doc files.
 *
 * @param {string} dirKey - Key registered with paths.register()
 * @param {object} options - Options
 * @param {boolean} options.includeDescription - Whether to extract first sentence as description
 * @returns {object} Object with "files" array, each with path and title
 */
function getStructure(dirKey, options = {}) {
    const { includeDescription = false } = options;

    paths.ensureInitialized();
    const baseDir = paths.get(dirKey);
    if (!baseDir || !fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
        return { files: [] };
    }

    const files = [];
    for (const f of listFiles(dirKey)) {
        const filepath = path.join(baseDir, f);
        if (includeDescription) {
            const { title, description } = extractTitleAndDescription(filepath);
            const entry = { path: f, title };
            if (description) entry.description = description;
            files.push(entry);
        } else {
            const title = extractTitle(filepath);
            files.push({ path: f, title });
        }
    }

    // index.md first, then alphabetical
    files.sort((a, b) => {
        if (a.path === 'index.md') return -1;
        if (b.path === 'index.md') return 1;
        return a.path.localeCompare(b.path);
    });

    return { files };
}

/**
 * Build a section dict from a directory.
 * @param {string} baseDir - Base docs directory path
 * @param {string|null} sectionPath - Subdirectory path (null for root level)
 * @param {string} sectionName - Name for the section
 * @returns {object|null} Object with "name" and "docs" list, or null if empty
 */
function buildSectionFromDir(baseDir, sectionPath, sectionName) {
    const scanDir = sectionPath ? path.join(baseDir, sectionPath) : baseDir;

    if (!fs.existsSync(scanDir) || !fs.statSync(scanDir).isDirectory()) {
        return null;
    }

    const docs = [];
    for (const f of fs.readdirSync(scanDir)) {
        if (!f.endsWith('.md')) continue;
        const filepath = path.join(scanDir, f);
        if (!fs.statSync(filepath).isFile()) continue;

        const { title, description } = extractTitleAndDescription(filepath);
        const relPath = sectionPath ? `${sectionPath}/${f}` : f;
        const docEntry = { path: relPath, title };
        if (description) docEntry.description = description;
        docs.push(docEntry);
    }

    if (docs.length === 0) return null;

    // Sort: index.md first, then alphabetically
    docs.sort((a, b) => {
        const aIsIndex = a.path.endsWith('index.md') ? 0 : 1;
        const bIsIndex = b.path.endsWith('index.md') ? 0 : 1;
        if (aIsIndex !== bIsIndex) return aIsIndex - bIsIndex;
        return a.path.localeCompare(b.path);
    });

    return { name: sectionName, docs };
}

/**
 * Get complex documentation structure with sections.
 * For multi-directory documentation with custom section ordering.
 *
 * @param {object} options - Configuration options
 * @param {string} options.docsDirKey - Key for main docs directory (default: "DOCS_DIR")
 * @param {string} options.frameworkDirKey - Key for framework docs (appended as "AIDE Frame" section)
 * @param {Array} options.sectionDefs - List of [sectionPath, sectionName] tuples defining order
 * @param {boolean} options.autoDiscover - If true and sectionDefs is null, auto-discover sections
 * @returns {object} Object with "sections" array
 */
function getDocsStructure(options = {}) {
    const {
        docsDirKey = 'DOCS_DIR',
        frameworkDirKey = null,
        sectionDefs = null,
        autoDiscover = true,
    } = options;

    paths.ensureInitialized();
    const sections = [];
    const baseDir = paths.get(docsDirKey);

    // Determine section definitions
    let actualSectionDefs = sectionDefs;
    if (actualSectionDefs === null) {
        if (autoDiscover) {
            actualSectionDefs = autoDiscoverSections(docsDirKey);
        } else {
            actualSectionDefs = [[null, 'Overview']];
        }
    }

    /**
     * Build framework sections: "Getting Started" (expanded) and "AIDE Frame" (collapsed)
     * Returns { gettingStarted, aideFrame } where each may be null
     */
    function buildFrameworkSections() {
        if (!frameworkDirKey) return { gettingStarted: null, aideFrame: null };
        const frameDir = paths.get(frameworkDirKey);
        if (!frameDir || !fs.existsSync(frameDir) || !fs.statSync(frameDir).isDirectory()) {
            return { gettingStarted: null, aideFrame: null };
        }

        const gettingStartedDocs = [];
        const aideFrameDocs = [];

        // Files that belong in "Getting Started" section
        const gettingStartedFiles = new Set(['start-your-own-app.md']);

        // Scan root-level .md files
        for (const f of fs.readdirSync(frameDir)) {
            if (!f.endsWith('.md')) continue;
            const filepath = path.join(frameDir, f);
            if (!fs.statSync(filepath).isFile()) continue;

            const { title, description } = extractTitleAndDescription(filepath);
            const docEntry = { path: f, title, framework: true };
            if (description) docEntry.description = description;

            if (gettingStartedFiles.has(f)) {
                gettingStartedDocs.push(docEntry);
            } else {
                aideFrameDocs.push(docEntry);
            }
        }

        // Scan subdirectories (spec/, python/, js/)
        for (const subdir of fs.readdirSync(frameDir)) {
            const subdirPath = path.join(frameDir, subdir);
            if (!fs.statSync(subdirPath).isDirectory() || subdir.startsWith('.')) continue;

            for (const f of fs.readdirSync(subdirPath)) {
                if (!f.endsWith('.md')) continue;
                const filepath = path.join(subdirPath, f);
                if (!fs.statSync(filepath).isFile()) continue;

                const { title, description } = extractTitleAndDescription(filepath);
                const relPath = `${subdir}/${f}`;
                const docEntry = { path: relPath, title, framework: true };
                if (description) docEntry.description = description;
                aideFrameDocs.push(docEntry);
            }
        }

        // Sort AIDE Frame docs: root index.md first, then by directory, then by path
        aideFrameDocs.sort((a, b) => {
            const pathA = a.path;
            const pathB = b.path;
            const isIndexA = pathA.endsWith('index.md');
            const isIndexB = pathB.endsWith('index.md');
            const isRootA = !pathA.includes('/');
            const isRootB = !pathB.includes('/');

            // Root index.md comes first
            if (isRootA && isIndexA && !(isRootB && isIndexB)) return -1;
            if (isRootB && isIndexB && !(isRootA && isIndexA)) return 1;
            // Root files next
            if (isRootA && !isRootB) return -1;
            if (isRootB && !isRootA) return 1;
            // Subdirectory files: group by directory
            const subdirA = pathA.includes('/') ? pathA.split('/')[0] : '';
            const subdirB = pathB.includes('/') ? pathB.split('/')[0] : '';
            const subdirOrder = { spec: 0, python: 1, js: 2 };
            const orderA = subdirOrder[subdirA] !== undefined ? subdirOrder[subdirA] : 3;
            const orderB = subdirOrder[subdirB] !== undefined ? subdirOrder[subdirB] : 3;
            if (orderA !== orderB) return orderA - orderB;
            // Within same subdir: index first, then alphabetically
            if (isIndexA && !isIndexB) return -1;
            if (isIndexB && !isIndexA) return 1;
            return pathA.localeCompare(pathB);
        });

        return {
            gettingStarted: gettingStartedDocs.length > 0
                ? { name: 'Getting Started', docs: gettingStartedDocs, framework: true, expanded: true }
                : null,
            aideFrame: aideFrameDocs.length > 0
                ? { name: 'AIDE Frame', docs: aideFrameDocs, framework: true }
                : null,
        };
    }

    // No docs dir? Return just framework sections if available
    if (!baseDir || !fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
        const { gettingStarted, aideFrame } = buildFrameworkSections();
        if (gettingStarted) sections.push(gettingStarted);
        if (aideFrame) sections.push(aideFrame);
        return { sections };
    }

    // Build sections from definitions
    const { gettingStarted, aideFrame } = buildFrameworkSections();
    let aideFrameInserted = false;

    // Insert "Getting Started" first (before app sections)
    if (gettingStarted) {
        sections.push(gettingStarted);
    }

    // Sections that should come after AIDE Frame
    const lateSections = new Set(['deployment', 'development']);

    for (const [sectionPath, sectionName] of actualSectionDefs) {
        // Legacy support: skip AIDE_FRAME marker
        if (sectionPath === 'AIDE_FRAME') continue;

        // Insert AIDE Frame before late sections
        if (lateSections.has(sectionPath) && aideFrame && !aideFrameInserted) {
            sections.push(aideFrame);
            aideFrameInserted = true;
        }

        const section = buildSectionFromDir(baseDir, sectionPath, sectionName);
        if (section) sections.push(section);
    }

    // Add AIDE Frame docs at end if not inserted before late sections
    if (aideFrame && !aideFrameInserted) {
        sections.push(aideFrame);
    }

    return { sections };
}

module.exports = {
    STANDARD_SECTION_DEFS,
    autoDiscoverSections,
    listFiles,
    listFilesRecursive,
    loadFile,
    extractTitle,
    extractTitleAndDescription,
    getStructure,
    buildSectionFromDir,
    getDocsStructure,
};
