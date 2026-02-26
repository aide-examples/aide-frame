/**
 * Full-text search for documentation viewer.
 *
 * Uses SQLite FTS5 to index markdown documents from all configured roots
 * (docs, help, custom roots). The host application passes a better-sqlite3
 * Database instance — this module does not own the DB dependency.
 *
 * Usage:
 *   const search = new DocsSearch({ db, roots });
 *   search.initSchema();
 *   search.rebuildAll();
 *   const results = search.search('engine type', ['docs', 'help'], 30);
 */

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const { logger } = require('./log');

class DocsSearch {
    /**
     * @param {object} options
     * @param {Database} options.db - better-sqlite3 Database instance
     * @param {object} options.roots - { rootName: { dirKey, frameworkDirKey?, exclude? } }
     */
    constructor({ db, roots }) {
        this.db = db;
        this.roots = roots;
    }

    /**
     * Create FTS5 virtual table if not exists.
     */
    initSchema() {
        this.db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS _docs_fts USING fts5(
                root,
                path,
                title,
                content,
                tokenize='porter unicode61'
            )
        `);
    }

    /**
     * Rebuild the entire index for all configured roots.
     * @returns {number} Number of indexed files
     */
    rebuildAll() {
        const start = Date.now();
        let count = 0;

        const insertStmt = this.db.prepare(
            'INSERT INTO _docs_fts (root, path, title, content) VALUES (?, ?, ?, ?)'
        );

        const rebuild = this.db.transaction(() => {
            this.db.exec('DELETE FROM _docs_fts');

            for (const [rootName, rootCfg] of Object.entries(this.roots)) {
                const dir = paths.get(rootCfg.dirKey);
                if (!dir || !fs.existsSync(dir)) continue;

                const exclude = new Set(rootCfg.exclude || []);
                const files = this._scanMarkdownFiles(dir, '', exclude);

                for (const relPath of files) {
                    const fullPath = path.join(dir, relPath);
                    try {
                        const raw = fs.readFileSync(fullPath, 'utf8');
                        if (DocsSearch.hasNoIndex(raw)) continue;
                        const title = DocsSearch.extractTitle(raw) || path.basename(relPath, '.md');
                        const content = DocsSearch.stripMarkdown(raw);
                        insertStmt.run(rootName, relPath, title, content);
                        count++;
                    } catch (e) {
                        logger.warning(`Search index: failed to read ${rootName}/${relPath}: ${e.message}`);
                    }
                }

                // Framework docs (included under this root with framework/ prefix)
                if (rootCfg.frameworkDirKey) {
                    const fwDir = paths.get(rootCfg.frameworkDirKey);
                    if (fwDir && fs.existsSync(fwDir)) {
                        const fwFiles = this._scanMarkdownFiles(fwDir, '', new Set());
                        for (const relPath of fwFiles) {
                            const fullPath = path.join(fwDir, relPath);
                            try {
                                const raw = fs.readFileSync(fullPath, 'utf8');
                                if (DocsSearch.hasNoIndex(raw)) continue;
                                const title = DocsSearch.extractTitle(raw) || path.basename(relPath, '.md');
                                const content = DocsSearch.stripMarkdown(raw);
                                insertStmt.run(rootName, 'framework/' + relPath, title, content);
                                count++;
                            } catch (e) { /* skip */ }
                        }
                    }
                }
            }
        });

        rebuild();
        logger.info(`Search index rebuilt: ${count} files in ${Date.now() - start}ms`);
        return count;
    }

    /**
     * Re-index a single file (after edit via UI).
     */
    reindexFile(root, filePath) {
        const rootCfg = this.roots[root];
        if (!rootCfg) return;

        // Determine base directory
        let dir;
        if (filePath.startsWith('framework/') && rootCfg.frameworkDirKey) {
            dir = paths.get(rootCfg.frameworkDirKey);
            filePath = filePath.substring('framework/'.length);
        } else {
            dir = paths.get(rootCfg.dirKey);
        }
        if (!dir) return;

        const fullPath = path.join(dir, filePath);
        const indexPath = filePath.startsWith('framework/') ? filePath : filePath;

        // Delete old entry
        this.db.prepare('DELETE FROM _docs_fts WHERE root = ? AND path = ?')
            .run(root, indexPath);

        // Insert updated content (skip if marked <!-- noindex -->)
        if (fs.existsSync(fullPath)) {
            try {
                const raw = fs.readFileSync(fullPath, 'utf8');
                if (DocsSearch.hasNoIndex(raw)) return;
                const title = DocsSearch.extractTitle(raw) || path.basename(filePath, '.md');
                const content = DocsSearch.stripMarkdown(raw);
                this.db.prepare('INSERT INTO _docs_fts (root, path, title, content) VALUES (?, ?, ?, ?)')
                    .run(root, indexPath, title, content);
            } catch (e) {
                logger.warning(`Search reindex failed for ${root}/${filePath}: ${e.message}`);
            }
        }
    }

    /**
     * Search across specified roots.
     * @param {string} query - User search query
     * @param {string[]} roots - Root names to search in
     * @param {number} limit - Max results
     * @returns {Array} Search results with snippets
     */
    search(query, roots, limit = 30) {
        if (!query || query.trim().length < 2) return [];

        // Build FTS5 query with prefix matching
        const ftsQuery = DocsSearch.buildFtsQuery(query);
        if (!ftsQuery) return [];

        // Build placeholders for root IN clause
        const placeholders = roots.map(() => '?').join(', ');

        try {
            const stmt = this.db.prepare(`
                SELECT root, path, title,
                       snippet(_docs_fts, 3, '<mark>', '</mark>', '…', 40) AS snippet,
                       rank
                FROM _docs_fts
                WHERE _docs_fts MATCH ?
                  AND root IN (${placeholders})
                ORDER BY rank
                LIMIT ?
            `);

            return stmt.all(ftsQuery, ...roots, limit);
        } catch (e) {
            logger.warning(`Search query failed: ${e.message}`);
            return [];
        }
    }

    // =========================================================================
    // Static helpers
    // =========================================================================

    /**
     * Build FTS5 query with prefix matching.
     * Each word gets a * suffix for prefix matching.
     * @param {string} query - Raw user input
     * @returns {string} FTS5 query string
     */
    static buildFtsQuery(query) {
        // Split into words, filter empties, escape quotes
        const words = query.trim().split(/\s+/).filter(w => w.length > 0);
        if (words.length === 0) return '';

        // Each word gets prefix matching: word → "word"*
        // Quoting prevents FTS5 syntax errors from special characters
        return words.map(w => '"' + w.replace(/"/g, '') + '"*').join(' ');
    }

    /**
     * Check if markdown contains <!-- noindex --> directive.
     */
    static hasNoIndex(markdown) {
        return /<!--\s*noindex\s*-->/.test(markdown);
    }

    /**
     * Extract first heading from markdown.
     */
    static extractTitle(markdown) {
        const match = markdown.match(/^#{1,3}\s+(.+)$/m);
        return match ? match[1].trim() : null;
    }

    /**
     * Strip markdown syntax for plain-text indexing.
     */
    static stripMarkdown(text) {
        return text
            // Remove code fences (``` blocks)
            .replace(/```[\s\S]*?```/g, ' ')
            // Remove inline code
            .replace(/`[^`]+`/g, ' ')
            // Remove HTML tags
            .replace(/<[^>]+>/g, ' ')
            // Remove images ![alt](url)
            .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
            // Convert links [text](url) to text
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            // Remove heading markers but keep text
            .replace(/^#{1,6}\s+/gm, '')
            // Remove bold/italic markers
            .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
            // Remove table separators
            .replace(/^\|?[-:|]+\|?$/gm, ' ')
            // Remove table pipes
            .replace(/\|/g, ' ')
            // Remove blockquote markers
            .replace(/^>\s*/gm, '')
            // Remove horizontal rules
            .replace(/^---+$/gm, ' ')
            // Remove HTML comments
            .replace(/<!--[\s\S]*?-->/g, ' ')
            // Collapse whitespace
            .replace(/\s+/g, ' ')
            .trim();
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Recursively scan directory for .md files.
     * @returns {string[]} Array of relative paths
     */
    _scanMarkdownFiles(baseDir, relDir, exclude) {
        const results = [];
        const absDir = relDir ? path.join(baseDir, relDir) : baseDir;

        let entries;
        try {
            entries = fs.readdirSync(absDir);
        } catch (e) {
            return results;
        }

        for (const entry of entries) {
            if (entry.startsWith('.')) continue;
            if (exclude.has(entry) && !relDir) continue;  // exclude only at top level

            const absPath = path.join(absDir, entry);
            const relPath = relDir ? path.join(relDir, entry) : entry;

            try {
                const stat = fs.statSync(absPath);
                if (stat.isFile() && entry.endsWith('.md')) {
                    results.push(relPath);
                } else if (stat.isDirectory()) {
                    results.push(...this._scanMarkdownFiles(baseDir, relPath, exclude));
                }
            } catch (e) { /* skip */ }
        }

        return results;
    }
}

module.exports = { DocsSearch };
