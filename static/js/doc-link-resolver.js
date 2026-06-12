// @ts-check
/**
 * Doc Link Resolver — canonical parser for Markdown link hrefs in the
 * aide-frame docs viewer.
 *
 * One function call replaces three drift-prone copies of path-resolution
 * logic that lived independently in viewer.html, slideshow.js and the
 * presentation print path. Same syntax, same normalisation, same anchor
 * extraction, same decode-once contract everywhere.
 *
 * Link syntax:
 *
 *   [text](file.md)             — relative to current document's directory
 *   [text](sub/file.md)         — relative, sub-directory
 *   [text](../file.md)          — relative, parent
 *   [text](/file.md)            — absolute within the current document root
 *   [text](rap:product/x.md)    — cross-root: switch to root 'rap'
 *   [text](rap:/x.md)           — cross-root + absolute within target root
 *   [text](file.md#section)     — any of the above with a fragment
 *   [text](#section)            — in-page anchor only, no navigation
 *
 * External protocols (http(s)://, mailto:, tel:, ftp:, data:, //) pass
 * through unchanged with `isExternal: true`.
 *
 * Usage:
 *
 *   const r = DocLinkResolver.resolve(link.getAttribute('href'), {
 *       currentRoot: 'docs',
 *       currentDocPath: 'product/Was ist RAP [SLIDES].md',
 *       accessibleRoots: ['docs', 'help', 'rap']
 *   });
 *   if (r.isExternal)       return;                       // let browser handle
 *   if (!r.isAccessible)    showAccessDeniedHint(r.root); // friendlier than raw 403
 *   if (r.isAnchorOnly)     scrollToAnchor(r.anchor);
 *   if (r.isCrossRoot)      window.location.href = `${routeFor(r.root)}?doc=${encodeURIComponent(r.path)}${r.anchor}`;
 *   else                    loadDoc(r.path, r.anchor);
 *
 * The resolver does NOT touch the URL, does NOT fetch, does NOT touch
 * the DOM. It is a pure function. Callers do the navigation.
 */

const DocLinkResolver = (() => {
    'use strict';

    const EXTERNAL_PROTOCOLS = /^(https?:|mailto:|tel:|ftp:|data:|javascript:)/i;
    // <rootName>: prefix — lowercase identifier, NOT followed by '//' (that
    // would be a protocol like 'foo://'). Captured group is the root name.
    const ROOT_PREFIX = /^([a-z][a-z0-9_-]*):(?!\/\/)/;

    /**
     * @typedef {Object} ResolveContext
     * @property {string} currentRoot       Root the current document lives in
     * @property {string} currentDocPath    Current document path within its root
     * @property {string[]} [accessibleRoots] Roots the user may access (default: any allowed)
     */

    /**
     * @typedef {Object} ResolveResult
     * @property {boolean} isExternal       true for http(s):// / mailto: / etc.
     * @property {boolean} isAnchorOnly     true for href starting with '#'
     * @property {string} root              Resolved target root (currentRoot if no prefix)
     * @property {string} path              Normalized path within target root
     * @property {string} anchor            '#fragment' (with leading '#') or ''
     * @property {boolean} isAccessible     false iff `accessibleRoots` was given and root is not in it
     * @property {boolean} isCrossRoot      true iff root !== ctx.currentRoot
     */

    /**
     * Parse a Markdown link href into its canonical components.
     *
     * @param {string} href
     * @param {ResolveContext} ctx
     * @returns {ResolveResult}
     */
    function resolve(href, ctx) {
        /** @type {ResolveResult} */
        const result = {
            isExternal: false,
            isAnchorOnly: false,
            root: ctx.currentRoot,
            path: '',
            anchor: '',
            isAccessible: true,
            isCrossRoot: false,
        };

        if (!href || typeof href !== 'string') return result;

        // External protocols and protocol-less '//host' — leave alone.
        if (EXTERNAL_PROTOCOLS.test(href) || href.startsWith('//')) {
            result.isExternal = true;
            result.path = href;
            return result;
        }

        // Anchor-only — stay in current document, hand off to in-page scroll.
        if (href.startsWith('#')) {
            result.isAnchorOnly = true;
            result.anchor = href;
            result.path = ctx.currentDocPath || '';
            return result;
        }

        // Decode-once: the href on the DOM is already percent-encoded by
        // marked.js (e.g. 'Was%20ist%20AFM%20%5BSLIDES%5D.md'). We want
        // the canonical decoded form internally; the caller re-encodes
        // exactly once when constructing the API URL or window.location.
        let work = href;
        try { work = decodeURIComponent(href); } catch (_) { work = href; }

        // Split off trailing '#anchor' (first '#' wins).
        const hashIdx = work.indexOf('#');
        if (hashIdx >= 0) {
            result.anchor = work.substring(hashIdx);
            work = work.substring(0, hashIdx);
        }

        // Optional <rootName>: prefix.
        const rootMatch = work.match(ROOT_PREFIX);
        if (rootMatch) {
            result.root = rootMatch[1];
            work = work.substring(rootMatch[0].length);
        }
        result.isCrossRoot = result.root !== ctx.currentRoot;

        // Resolve the path.
        let targetPath;
        if (work.startsWith('/')) {
            // Absolute within the target root.
            targetPath = work.substring(1);
        } else if (result.isCrossRoot) {
            // Cross-root without a leading '/': interpret as relative to
            // the *target root's* root, not the source document's directory.
            // That is the only sensible reading — the source doc's dirname
            // would not exist in the target root.
            targetPath = work;
        } else {
            // Same-root relative — resolve against current doc's directory.
            const dir = ctx.currentDocPath && ctx.currentDocPath.includes('/')
                ? ctx.currentDocPath.substring(0, ctx.currentDocPath.lastIndexOf('/'))
                : '';
            targetPath = dir && work ? dir + '/' + work : (work || ctx.currentDocPath || '');
        }

        // Normalise '..' and '.' segments. Over-pop of '..' is silently
        // swallowed here; the server-side path guard rejects any escape
        // that survives anyway.
        const parts = targetPath.split('/');
        /** @type {string[]} */
        const stack = [];
        for (const part of parts) {
            if (part === '' || part === '.') continue;
            if (part === '..') { if (stack.length > 0) stack.pop(); continue; }
            stack.push(part);
        }
        result.path = stack.join('/');

        // Permission check (advisory — server still enforces).
        if (Array.isArray(ctx.accessibleRoots)) {
            result.isAccessible = ctx.accessibleRoots.includes(result.root);
        }

        return result;
    }

    /**
     * @typedef {Object} AssetResolveResult
     * @property {boolean} isExternal       true for http(s):// / data: / etc.
     * @property {boolean} isAbsolute       true for src starting with '/'
     * @property {string} src               Resolved path; caller prepends assetPrefix / basePath
     */

    /**
     * Resolve an asset (image) src. V1 stays in the current root — caller
     * prepends `<currentRoot>-assets/` to the returned `src`. Absolute
     * paths (`/foo.png`) come back with `isAbsolute: true` so the caller
     * can also prepend the transport-level `basePath` for nginx subpath
     * deployments — this is the basePath-rewrite that today's slideshow
     * code is missing.
     *
     * @param {string} src
     * @param {{ currentDocPath: string }} ctx
     * @returns {AssetResolveResult}
     */
    function resolveAsset(src, ctx) {
        if (!src || typeof src !== 'string') {
            return { isExternal: false, isAbsolute: false, src: src || '' };
        }
        if (EXTERNAL_PROTOCOLS.test(src) || src.startsWith('//') || src.startsWith('data:')) {
            return { isExternal: true, isAbsolute: false, src };
        }
        if (src.startsWith('/')) {
            return { isExternal: false, isAbsolute: true, src };
        }
        const dir = ctx.currentDocPath && ctx.currentDocPath.includes('/')
            ? ctx.currentDocPath.substring(0, ctx.currentDocPath.lastIndexOf('/'))
            : '';
        return { isExternal: false, isAbsolute: false, src: dir ? dir + '/' + src : src };
    }

    return { resolve, resolveAsset };
})();

if (typeof window !== 'undefined') {
    /** @type {any} */ (window).DocLinkResolver = DocLinkResolver;
}
