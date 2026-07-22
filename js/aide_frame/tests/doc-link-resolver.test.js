'use strict';
/**
 * DocLinkResolver — cross-root & relative link resolution (aide-rap#105).
 *
 * The MD-browser's cross-doc-root link resolution flaked for months: a link
 * between two FRAMEWORK docs (app/docs/, root `rap`) 404'd when the browser was
 * opened from a SYSTEM context, because a relative link resolved against the
 * system root instead of the framework root. The canonical `DocLinkResolver`
 * (static/js/doc-link-resolver.js) fixed this — the resolver decides the target
 * root from the link's own `<root>:` prefix and the CURRENT document's root, not
 * the surrounding UI context. This test codifies that contract so the class
 * cannot silently regress (the CR noted a new variant surfacing every 2-3 weeks).
 *
 * Canonical scenario: the product [SLIDES] hand-off links
 *   product/What is AFM [SLIDES].md  →  What is RAP [SLIDES].md   (same dir)
 *   product/What is AFM [SLIDES].md  →  de/Was ist AFM [SLIDES].md (sub-dir)
 *   product/de/Was ist AFM [SLIDES].md → ../What is AFM [SLIDES].md (parent)
 * all stay inside root `rap` when the current doc lives in `rap`.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The resolver is a browser module (assigns window.DocLinkResolver). Load it in
// a vm sandbox with a window shim — same mechanism the bundle uses in-browser.
function loadResolver() {
    const file = path.join(__dirname, '..', '..', '..', 'static', 'js', 'doc-link-resolver.js');
    const code = fs.readFileSync(file, 'utf8');
    const sandbox = { window: {}, module: { exports: {} }, console };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    const R = sandbox.window.DocLinkResolver || sandbox.module.exports;
    assert.ok(R && typeof R.resolve === 'function', 'DocLinkResolver.resolve must be exported');
    return R;
}

const R = loadResolver();
const inRap = p => ({ currentRoot: 'rap', currentDocPath: p });

test('same-root relative link stays in the current (framework) root', () => {
    const r = R.resolve('What is RAP [SLIDES].md', inRap('product/What is AFM [SLIDES].md'));
    assert.strictEqual(r.root, 'rap');
    assert.strictEqual(r.path, 'product/What is RAP [SLIDES].md');
    assert.strictEqual(r.isCrossRoot, false);
});

test('sub-directory relative link resolves under the current dir', () => {
    const r = R.resolve('de/Was ist AFM [SLIDES].md', inRap('product/What is AFM [SLIDES].md'));
    assert.strictEqual(r.root, 'rap');
    assert.strictEqual(r.path, 'product/de/Was ist AFM [SLIDES].md');
    assert.strictEqual(r.isCrossRoot, false);
});

test('parent (..) relative link pops one directory', () => {
    const r = R.resolve('../What is AFM [SLIDES].md', inRap('product/de/Was ist AFM [SLIDES].md'));
    assert.strictEqual(r.root, 'rap');
    assert.strictEqual(r.path, 'product/What is AFM [SLIDES].md');
    assert.strictEqual(r.isCrossRoot, false);
});

test('rap: prefix switches root from a system context (the CR fix)', () => {
    // Browser opened in system `books`; a doc links across to a framework slide.
    const r = R.resolve('rap:product/What is RAP [SLIDES].md',
        { currentRoot: 'books', currentDocPath: 'welcome.md' });
    assert.strictEqual(r.root, 'rap');
    assert.strictEqual(r.path, 'product/What is RAP [SLIDES].md');
    assert.strictEqual(r.isCrossRoot, true);
});

test('a prefix equal to the current root is NOT flagged cross-root', () => {
    const r = R.resolve('rap:product/x.md', inRap('index.md'));
    assert.strictEqual(r.root, 'rap');
    assert.strictEqual(r.isCrossRoot, false);
});

test('root-absolute (/x.md) stays absolute within the current root', () => {
    const r = R.resolve('/product/x.md', inRap('product/deep/y.md'));
    assert.strictEqual(r.root, 'rap');
    assert.strictEqual(r.path, 'product/x.md');
    assert.strictEqual(r.isCrossRoot, false);
});

test('in-page anchor keeps the current document + path', () => {
    const r = R.resolve('#section-two', inRap('product/What is RAP [SLIDES].md'));
    assert.strictEqual(r.root, 'rap');
    assert.strictEqual(r.path, 'product/What is RAP [SLIDES].md');
    assert.ok((r.anchor || '').includes('section-two'));
});

test('external http(s) links are passed through, not root-resolved', () => {
    const r = R.resolve('https://gero-scholz.de/afm/', inRap('product/What is AFM [SLIDES].md'));
    // Must NOT be turned into a doc path inside a root.
    assert.notStrictEqual(r.path, 'product/https://gero-scholz.de/afm/');
});
