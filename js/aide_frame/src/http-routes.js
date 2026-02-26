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
 * @property {boolean} [editable=false] - Enable editing of this root via right-click
 * @property {boolean} [masterPassword=false] - Require master password before editing
 */

/**
 * Configuration for Progressive Web App (PWA) support.
 *
 * @typedef {object} PWAConfig
 * @property {boolean} [enabled=false] - Enable PWA support
 * @property {string} [name="AIDE App"] - Application name
 * @property {string} [shortName="AIDE"] - Short name for app icon
 * @property {string} [description=""] - Application description
 * @property {string} [themeColor="#2563eb"] - Theme color
 * @property {string} [backgroundColor="#ffffff"] - Background color
 * @property {string} [display="standalone"] - Display mode
 * @property {string} [startUrl="/"] - Start URL
 * @property {string} [icon192="/static/frame/icons/icon-192.svg"] - 192x192 icon path
 * @property {string} [icon512="/static/frame/icons/icon-512.svg"] - 512x512 icon path
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
 * @property {string[]} [docsExclude] - Directories to exclude from docs auto-discovery
 * @property {string[]} [docsShallow] - Directories to show as sections but not recurse into (e.g., ["views"])
 * @property {Object.<string, CustomRoot>} [customRoots] - Custom roots
 * @property {PWAConfig} [pwa] - PWA configuration
 * @property {boolean} [enableMermaid=true] - Enable Mermaid diagrams
 * @property {boolean} [enableDocs=true] - Enable /about route
 * @property {boolean} [enableHelp=true] - Enable /help route
 * @property {boolean} [docsEditable=false] - Enable editing of docs via right-click
 * @property {boolean} [helpEditable=false] - Enable editing of help via right-click
 * @property {boolean} [editRequiresAdmin=false] - Restrict editing to admin-role users
 * @property {string} [masterPasswordHash=null] - SHA256 hash of master password for protected roots
 * @property {string} [viewerHooks=null] - URL to a JS file loaded by the viewer for content post-processing
 * @property {Function|Function[]} [viewerAuth=null] - Middleware for viewer pages (/about, /help, custom roots)
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
        titleHtml: config.titleHtml || null,
        backLink: config.backLink || '/',
        backText: config.backText || 'Back',
        docsDirKey: config.docsDirKey || 'DOCS_DIR',
        helpDirKey: config.helpDirKey || 'HELP_DIR',
        frameworkDirKey: config.frameworkDirKey || 'AIDE_FRAME_DOCS_DIR',
        sectionDefs: config.sectionDefs || null,
        docsExclude: config.docsExclude || [],
        docsShallow: config.docsShallow || [],
        customRoots: config.customRoots || {},
        pwa: config.pwa || null,
        enableMermaid: config.enableMermaid !== false,
        enableDocs: config.enableDocs !== false,
        enableHelp: config.enableHelp !== false,
        docsEditable: config.docsEditable === true,
        helpEditable: config.helpEditable === true,
        editRequiresAdmin: config.editRequiresAdmin === true,
        masterPasswordHash: config.masterPasswordHash || null,
        sessionTimeout: config.sessionTimeout || 86400,
        viewerHooks: config.viewerHooks || null,
        viewerAuth: config.viewerAuth
            ? (Array.isArray(config.viewerAuth) ? config.viewerAuth : [config.viewerAuth])
            : [],
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
            exclude: config.docsExclude,
            shallow: config.docsShallow,
            titleSuffix: 'Documentation',
            useSections: true,
        };
    } else if (root === 'help') {
        return {
            dirKey: config.helpDirKey,
            frameworkDirKey: null,
            sectionDefs: null,
            exclude: [],
            titleSuffix: 'Help',
            useSections: false,
        };
    } else if (config.customRoots && root in config.customRoots) {
        const custom = config.customRoots[root];
        return {
            dirKey: custom.dirKey,
            frameworkDirKey: null,
            sectionDefs: custom.sectionDefs || null,
            exclude: custom.exclude || [],
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
    const basePath = config.basePath || '';

    // PWA manifest
    if (cfg.pwa && cfg.pwa.enabled) {
        app.get('/manifest.json', (req, res) => {
            _serveManifest(res, cfg.pwa, basePath);
        });
    }

    // App config API
    app.get('/api/app/config', (req, res) => {
        const response = {
            app_name: cfg.appName,
            title_html: cfg.titleHtml || null,
            app_description: cfg.pwa?.description || '',
            back_link: cfg.backLink,
            back_text: cfg.backText,
            base_path: basePath,
            features: {
                mermaid: cfg.enableMermaid,
                docs: cfg.enableDocs,
                help: cfg.enableHelp,
            },
            editable: {
                docs: cfg.docsEditable,
                help: cfg.helpEditable,
                requiresAdmin: cfg.editRequiresAdmin,
            },
            viewer_hooks: cfg.viewerHooks,
        };
        // Include custom roots info
        if (cfg.customRoots && Object.keys(cfg.customRoots).length > 0) {
            response.custom_roots = {};
            for (const [name, root] of Object.entries(cfg.customRoots)) {
                response.custom_roots[name] = {
                    title: root.title,
                    route: root.route,
                    editable: root.editable === true,
                    masterPassword: root.masterPassword === true,
                };
            }
        }
        res.json(response);
    });

    // Viewer structure API
    app.get('/api/viewer/structure', ...cfg.viewerAuth, (req, res) => {
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
                exclude: viewerCfg.exclude,
                shallow: viewerCfg.shallow,
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
    app.get('/api/viewer/content', ...cfg.viewerAuth, (req, res) => {
        const root = req.query.root || 'docs';
        const docPath = req.query.path || 'index.md';

        const viewerCfg = _getViewerConfig(cfg, root);
        if (!viewerCfg) {
            return res.status(404).json({ error: `Unknown root: ${root}` });
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

        // Security: resolve and verify path stays within docs directory
        const fullPath = path.resolve(docsDir, actualPath);
        if (!fullPath.startsWith(path.resolve(docsDir) + path.sep) && fullPath !== path.resolve(docsDir)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
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

    // Viewer content save API (POST)
    app.post('/api/viewer/content', ...cfg.viewerAuth, (req, res) => {
        const { root = 'docs', path: docPath, content } = req.body;

        // Check if editing is enabled for this root
        let isEditable = false;
        if (root === 'docs') {
            isEditable = cfg.docsEditable;
        } else if (root === 'help') {
            isEditable = cfg.helpEditable;
        } else if (cfg.customRoots && cfg.customRoots[root]) {
            isEditable = cfg.customRoots[root].editable === true;
        }

        if (!isEditable) {
            return res.status(403).json({ error: `Editing not enabled for root: ${root}` });
        }

        // Admin role required for editing (skip check when no auth middleware is configured)
        if (cfg.editRequiresAdmin && req.user && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin role required for editing' });
        }

        // Master password required for this root
        const customRoot = cfg.customRoots && cfg.customRoots[root];
        if (customRoot?.masterPassword && cfg.masterPasswordHash) {
            const masterCookie = req.signedCookies?.['rap-master-verified'];
            if (!masterCookie || masterCookie !== 'verified') {
                return res.status(403).json({ error: 'Master password verification required', code: 'MASTER_PW_REQUIRED' });
            }
        }

        const viewerCfg = _getViewerConfig(cfg, root);
        if (!viewerCfg) {
            return res.status(404).json({ error: `Unknown root: ${root}` });
        }

        if (!docPath) {
            return res.status(400).json({ error: 'Path required' });
        }

        // Framework docs are always read-only
        if (docPath.startsWith('framework/')) {
            return res.status(403).json({ error: 'Framework docs are read-only' });
        }

        // Validate content
        if (typeof content !== 'string') {
            return res.status(400).json({ error: 'Content must be a string' });
        }

        const docsDir = paths.get(viewerCfg.dirKey);
        if (!docsDir) {
            return res.status(404).json({ error: 'Directory not configured' });
        }

        // Security: resolve and verify path stays within docs directory
        const fullPath = path.resolve(docsDir, docPath);
        if (!fullPath.startsWith(path.resolve(docsDir) + path.sep) && fullPath !== path.resolve(docsDir)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // Validate JSON code blocks in markdown
        const jsonError = _validateJsonBlocks(content);
        if (jsonError) {
            return res.status(400).json({ error: jsonError });
        }

        // Ensure parent directory exists
        const parentDir = path.dirname(fullPath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        try {
            fs.writeFileSync(fullPath, content, 'utf8');
            logger.info(`Saved document: ${docPath}`);
            res.json({ success: true, path: docPath });
        } catch (e) {
            logger.error(`Error saving file ${docPath}: ${e.message}`);
            res.status(500).json({ error: `Error saving file: ${e.message}` });
        }
    });

    // Master password verification endpoint
    if (cfg.masterPasswordHash) {
        const crypto = require('crypto');
        app.post('/api/viewer/verify-master', ...cfg.viewerAuth, (req, res) => {
            const { password } = req.body;
            if (!password) {
                return res.status(400).json({ error: 'Password required' });
            }
            const hash = crypto.createHash('sha256').update(password).digest('hex');
            if (hash !== cfg.masterPasswordHash) {
                return res.status(403).json({ error: 'Invalid master password' });
            }
            // Set signed cookie with same lifetime as session
            res.cookie('rap-master-verified', 'verified', {
                httpOnly: true,
                signed: true,
                secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
                maxAge: cfg.sessionTimeout * 1000,
                sameSite: 'strict',
                path: config.basePath || '/',
            });
            res.json({ success: true });
        });
    }

    // Docs viewer page (/about)
    if (cfg.enableDocs) {
        app.get('/about', ...cfg.viewerAuth, (req, res) => {
            _serveViewer(res, 'docs', basePath);
        });
    }

    // Help viewer page (/help)
    if (cfg.enableHelp) {
        app.get('/help', ...cfg.viewerAuth, (req, res) => {
            _serveViewer(res, 'help', basePath);
        });
    }

    // Custom root pages
    for (const [name, root] of Object.entries(cfg.customRoots)) {
        const route = root.route || `/${name}`;
        app.get(route, ...cfg.viewerAuth, (req, res) => {
            _serveViewer(res, name, basePath);
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
        app.get('/api/docs/structure', ...cfg.viewerAuth, (req, res) => {
            const structure = docsViewer.getDocsStructure({
                docsDirKey: cfg.docsDirKey,
                frameworkDirKey: cfg.frameworkDirKey,
                sectionDefs: cfg.sectionDefs,
                exclude: cfg.docsExclude,
                shallow: cfg.docsShallow,
            });
            res.json(structure);
        });
    }

    if (cfg.enableHelp) {
        app.get('/api/help/structure', ...cfg.viewerAuth, (req, res) => {
            const structure = docsViewer.getStructure(cfg.helpDirKey, { includeDescription: true });
            res.json(structure);
        });
    }
}

/**
 * Validate all ```json code blocks in markdown content.
 * Returns null if all blocks are valid, or an error message string.
 * @param {string} content - Markdown content
 * @returns {string|null} Error message or null
 * @private
 */
function _validateJsonBlocks(content) {
    const regex = /```json\s*\n([\s\S]*?)```/g;
    let match;
    let blockIndex = 0;

    while ((match = regex.exec(content)) !== null) {
        blockIndex++;
        const jsonText = match[1].trim();
        if (!jsonText) continue;

        try {
            JSON.parse(jsonText);
        } catch (e) {
            // Calculate line number where the json block starts
            const lineNumber = content.substring(0, match.index).split('\n').length;
            // Find the nearest heading above this block for context
            const textBefore = content.substring(0, match.index);
            const headingMatch = textBefore.match(/^(#{1,6})\s+(.+)$/gm);
            const section = headingMatch ? headingMatch[headingMatch.length - 1].replace(/^#+\s+/, '') : '';
            const sectionHint = section ? ` in "${section}"` : '';
            return `Invalid JSON${sectionHint} (line ${lineNumber}): ${e.message}`;
        }
    }

    return null;
}

/**
 * Serve the viewer HTML template.
 * @param {express.Response} res - Express response
 * @param {string} root - Root name
 * @private
 */
function _serveViewer(res, root, basePath = '') {
    paths.ensureInitialized();
    const staticDir = paths.get('AIDE_FRAME_STATIC_DIR');
    if (!staticDir) {
        return res.status(500).send('Static directory not configured');
    }

    const templatePath = path.join(staticDir, 'templates', 'viewer.html');
    if (!fs.existsSync(templatePath)) {
        return res.status(404).send('Viewer template not found');
    }

    if (basePath) {
        let html = fs.readFileSync(templatePath, 'utf8');
        html = html.replace('<head>', `<head>\n    <base href="${basePath}/">`);
        res.type('html').send(html);
    } else {
        res.type('html').sendFile(templatePath);
    }
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

/**
 * Serve PWA manifest.json.
 * @param {express.Response} res - Express response
 * @param {PWAConfig} pwa - PWA configuration
 * @private
 */
function _serveManifest(res, pwa, basePath = '') {
    // Determine icon type from extension
    const icon192 = pwa.icon192 || '/static/frame/icons/icon-192.svg';
    const icon512 = pwa.icon512 || '/static/frame/icons/icon-512.svg';
    const iconExt = icon192.split('.').pop().toLowerCase();
    const iconType = iconExt === 'svg' ? 'image/svg+xml' : `image/${iconExt}`;

    const manifest = {
        name: pwa.name || 'AIDE App',
        short_name: pwa.shortName || pwa.short_name || 'AIDE',
        description: pwa.description || '',
        start_url: basePath + (pwa.startUrl || pwa.start_url || '/'),
        display: pwa.display || 'standalone',
        theme_color: pwa.themeColor || pwa.theme_color || '#2563eb',
        background_color: pwa.backgroundColor || pwa.background_color || '#ffffff',
        icons: [
            {
                src: basePath + icon192,
                sizes: '192x192',
                type: iconType,
                purpose: 'any maskable'
            },
            {
                src: basePath + icon512,
                sizes: '512x512',
                type: iconType,
                purpose: 'any maskable'
            }
        ]
    };

    res.json(manifest);
}

module.exports = {
    register,
    initConfig,
    DocsConfig: null, // For documentation purposes
    CustomRoot: null, // For documentation purposes
    PWAConfig: null, // For documentation purposes
};
