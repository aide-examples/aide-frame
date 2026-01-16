/**
 * HTTP route handlers for documentation and help viewing.
 *
 * Provides reusable route handlers that apps can integrate into their
 * Express servers.
 *
 * Usage:
 *   const { httpRoutes } = require('aide-frame');
 *
 *   // Create configuration
 *   const config = {
 *       appName: "My App",
 *       backLink: "/",
 *       backText: "Home",
 *   };
 *
 *   // Register routes
 *   httpRoutes.register(app, config);
 */

const path = require('path');
const fs = require('fs');
const paths = require('./paths');
const docsViewer = require('./docs-viewer');
const { logger } = require('./log');

/**
 * Configuration for a custom Markdown viewing root.
 *
 * Apps can define additional roots beyond docs/ and help/ for viewing
 * Markdown files from custom directories (e.g., contracts, reports).
 *
 * @typedef {object} CustomRoot
 * @property {string} dirKey - Key in paths registry
 * @property {string} title - Display title (e.g., "Contracts", "Reports")
 * @property {string} route - URL route (e.g., "/contracts")
 * @property {string} [subdir] - Auto-register from APP_DIR/subdir if set
 * @property {boolean} [useSections=false] - True for multi-section docs, False for flat
 * @property {Array} [sectionDefs] - List of [sectionPath, sectionName] tuples
 */

/**
 * Configuration for docs/help route handlers.
 *
 * Standard paths (docs/, help/) are auto-registered if they exist in APP_DIR.
 *
 * @typedef {object} DocsConfig
 * @property {string} [appName="AIDE App"] - Application name
 * @property {string} [backLink="/"] - Back button link
 * @property {string} [backText="Back"] - Back button text
 * @property {string} [docsDirKey="DOCS_DIR"] - Key for docs directory in paths
 * @property {string} [helpDirKey="HELP_DIR"] - Key for help directory in paths
 * @property {string} [frameworkDirKey="AIDE_FRAME_DOCS_DIR"] - Key for framework docs
 * @property {Array} [sectionDefs] - Section definitions for docs
 * @property {Object.<string, CustomRoot>} [customRoots] - Custom roots
 * @property {boolean} [enableMermaid=true] - Enable Mermaid diagrams
 * @property {boolean} [enableDocs=true] - Enable /about route
 * @property {boolean} [enableHelp=true] - Enable /help route
 */

/**
 * Auto-register a path if it exists.
 * @param {string} key - Path key
 * @param {string} subdir - Subdirectory name
 * @private
 */
function _autoRegisterPath(key, subdir) {
    if (paths.get(key) !== null) {
        return; // Already registered
    }

    const appDir = paths.APP_DIR;
    if (!appDir) return;

    const candidate = path.join(appDir, subdir);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        paths.register(key, candidate);
        logger.debug(`Auto-registered ${key}: ${candidate}`);
    }
}

/**
 * Initialize and validate configuration.
 * @param {DocsConfig} config - Configuration object
 * @returns {DocsConfig} Processed configuration with defaults
 */
function initConfig(config) {
    const cfg = {
        appName: config.appName || 'AIDE App',
        backLink: config.backLink || '/',
        backText: config.backText || 'Back',
        docsDirKey: config.docsDirKey || 'DOCS_DIR',
        helpDirKey: config.helpDirKey || 'HELP_DIR',
        frameworkDirKey: config.frameworkDirKey || 'AIDE_FRAME_DOCS_DIR',
        sectionDefs: config.sectionDefs || null,
        customRoots: config.customRoots || {},
        enableMermaid: config.enableMermaid !== false,
        enableDocs: config.enableDocs !== false,
        enableHelp: config.enableHelp !== false,
    };

    paths.ensureInitialized();

    // Auto-register standard paths
    _autoRegisterPath(cfg.docsDirKey, 'docs');
    _autoRegisterPath(cfg.helpDirKey, 'help');

    // Auto-register custom roots with subdir specified
    for (const [name, root] of Object.entries(cfg.customRoots)) {
        if (root.subdir) {
            _autoRegisterPath(root.dirKey, root.subdir);
        }
    }

    // Validate that enabled features have their directories
    if (cfg.enableDocs) {
        const docsDir = paths.get(cfg.docsDirKey);
        if (!docsDir || !fs.existsSync(docsDir)) {
            logger.warning(
                `Docs enabled but ${cfg.docsDirKey} not found. ` +
                `Create docs/ directory or set enableDocs: false`
            );
        }
    }

    if (cfg.enableHelp) {
        const helpDir = paths.get(cfg.helpDirKey);
        if (!helpDir || !fs.existsSync(helpDir)) {
            logger.warning(
                `Help enabled but ${cfg.helpDirKey} not found. ` +
                `Create help/ directory or set enableHelp: false`
            );
        }
    }

    return cfg;
}

/**
 * Get viewer configuration for a specific root.
 * @param {DocsConfig} config - Configuration
 * @param {string} root - Root name (docs, help, or custom)
 * @returns {object|null} Viewer configuration
 * @private
 */
function _getViewerConfig(config, root) {
    if (root === 'docs') {
        return {
            dirKey: config.docsDirKey,
            frameworkDirKey: config.frameworkDirKey,
            sectionDefs: config.sectionDefs,
            titleSuffix: 'Documentation',
            useSections: true,
        };
    } else if (root === 'help') {
        return {
            dirKey: config.helpDirKey,
            frameworkDirKey: null,
            sectionDefs: null,
            titleSuffix: 'Help',
            useSections: false,
        };
    } else if (config.customRoots && root in config.customRoots) {
        const custom = config.customRoots[root];
        return {
            dirKey: custom.dirKey,
            frameworkDirKey: null,
            sectionDefs: custom.sectionDefs || null,
            titleSuffix: custom.title,
            useSections: custom.useSections || false,
        };
    }
    return null;
}

/**
 * Register docs/help routes on an Express app.
 * @param {express.Application} app - Express app
 * @param {DocsConfig} config - Configuration
 */
function register(app, config) {
    const cfg = initConfig(config);

    // App config API
    app.get('/api/app/config', (req, res) => {
        const response = {
            app_name: cfg.appName,
            back_link: cfg.backLink,
            back_text: cfg.backText,
            features: {
                mermaid: cfg.enableMermaid,
                docs: cfg.enableDocs,
                help: cfg.enableHelp,
            }
        };
        // Include custom roots info
        if (cfg.customRoots && Object.keys(cfg.customRoots).length > 0) {
            response.custom_roots = {};
            for (const [name, root] of Object.entries(cfg.customRoots)) {
                response.custom_roots[name] = {
                    title: root.title,
                    route: root.route,
                };
            }
        }
        res.json(response);
    });

    // Viewer structure API
    app.get('/api/viewer/structure', (req, res) => {
        const root = req.query.root || 'docs';
        const viewerCfg = _getViewerConfig(cfg, root);

        if (!viewerCfg) {
            return res.status(404).json({ error: `Unknown root: ${root}` });
        }

        const docsDir = paths.get(viewerCfg.dirKey);
        if (!docsDir) {
            return res.status(404).json({ error: 'Directory not configured' });
        }

        let structure;
        if (viewerCfg.useSections) {
            // Multi-section structure
            structure = docsViewer.getDocsStructure({
                docsDirKey: viewerCfg.dirKey,
                frameworkDirKey: viewerCfg.frameworkDirKey,
                sectionDefs: viewerCfg.sectionDefs,
            });
        } else {
            // Flat structure - wrap in single section for consistent API format
            const flat = docsViewer.getStructure(viewerCfg.dirKey, { includeDescription: true });
            structure = {
                sections: [{
                    name: viewerCfg.titleSuffix,
                    docs: flat.files || [],
                }]
            };
        }

        res.json(structure);
    });

    // Viewer content API
    app.get('/api/viewer/content', (req, res) => {
        const root = req.query.root || 'docs';
        const docPath = req.query.path || 'index.md';

        const viewerCfg = _getViewerConfig(cfg, root);
        if (!viewerCfg) {
            return res.status(404).json({ error: `Unknown root: ${root}` });
        }

        // Security: block path traversal
        if (docPath.includes('..') || docPath.startsWith('/')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // Check for framework docs
        let framework = false;
        let actualPath = docPath;
        if (docPath.startsWith('framework/')) {
            framework = true;
            actualPath = docPath.substring(10); // Remove 'framework/' prefix
        }

        const dirKey = framework ? viewerCfg.frameworkDirKey : viewerCfg.dirKey;
        const docsDir = paths.get(dirKey);
        if (!docsDir) {
            return res.status(404).json({ error: 'Directory not configured' });
        }

        const fullPath = path.join(docsDir, actualPath);
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: `File not found: ${docPath}` });
        }

        try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const { title } = docsViewer.extractTitleAndDescription(fullPath);
            res.json({
                path: actualPath,
                content: content,
                title: title || docPath,
                framework: framework,
            });
        } catch (e) {
            res.status(500).json({ error: `Error reading file: ${e.message}` });
        }
    });

    // Docs viewer page (/about)
    if (cfg.enableDocs) {
        app.get('/about', (req, res) => {
            _serveViewer(res, 'docs');
        });
    }

    // Help viewer page (/help)
    if (cfg.enableHelp) {
        app.get('/help', (req, res) => {
            _serveViewer(res, 'help');
        });
    }

    // Custom root pages
    for (const [name, root] of Object.entries(cfg.customRoots)) {
        const route = root.route || `/${name}`;
        app.get(route, (req, res) => {
            _serveViewer(res, name);
        });
    }

    // Docs assets (images, etc.)
    app.get('/docs-assets/*', (req, res) => {
        const assetPath = req.params[0];
        _serveDocsAsset(res, assetPath, cfg.docsDirKey);
    });

    app.get('/help-assets/*', (req, res) => {
        const assetPath = req.params[0];
        _serveDocsAsset(res, assetPath, cfg.helpDirKey);
    });

    // Custom root assets
    for (const [name, root] of Object.entries(cfg.customRoots)) {
        app.get(`/${name}-assets/*`, (req, res) => {
            const assetPath = req.params[0];
            _serveDocsAsset(res, assetPath, root.dirKey);
        });
    }

    // Legacy API compatibility
    if (cfg.enableDocs) {
        app.get('/api/docs/structure', (req, res) => {
            const structure = docsViewer.getDocsStructure({
                docsDirKey: cfg.docsDirKey,
                frameworkDirKey: cfg.frameworkDirKey,
                sectionDefs: cfg.sectionDefs,
            });
            res.json(structure);
        });
    }

    if (cfg.enableHelp) {
        app.get('/api/help/structure', (req, res) => {
            const structure = docsViewer.getStructure(cfg.helpDirKey, { includeDescription: true });
            res.json(structure);
        });
    }
}

/**
 * Serve the viewer HTML template.
 * @param {express.Response} res - Express response
 * @param {string} root - Root name
 * @private
 */
function _serveViewer(res, root) {
    paths.ensureInitialized();
    const staticDir = paths.get('AIDE_FRAME_STATIC_DIR');
    if (!staticDir) {
        return res.status(500).send('Static directory not configured');
    }

    const templatePath = path.join(staticDir, 'templates', 'viewer.html');
    if (!fs.existsSync(templatePath)) {
        return res.status(404).send('Viewer template not found');
    }

    res.type('html').sendFile(templatePath);
}

/**
 * Serve a docs asset file (images, etc.).
 * @param {express.Response} res - Express response
 * @param {string} assetPath - Relative asset path
 * @param {string} dirKey - Path key for docs directory
 * @private
 */
function _serveDocsAsset(res, assetPath, dirKey) {
    // Security: block path traversal
    if (assetPath.includes('..') || assetPath.startsWith('/')) {
        return res.status(403).send('Forbidden');
    }

    paths.ensureInitialized();
    const docsDir = paths.get(dirKey);
    if (!docsDir) {
        return res.status(404).send('Directory not configured');
    }

    const fullPath = path.join(docsDir, assetPath);
    if (!fs.existsSync(fullPath)) {
        return res.status(404).send('Asset not found');
    }

    res.sendFile(fullPath);
}

module.exports = {
    register,
    initConfig,
    DocsConfig: null, // For documentation purposes
    CustomRoot: null, // For documentation purposes
};
