// @ts-check
'use strict';
/**
 * Static assets: serve the precompressed sibling, and freeze what carries its version.
 *
 * ── Why this is here and not in nginx ────────────────────────────────────────────────────
 * `brotli_static` and `gzip_static` need nginx to read the file from disk. In this fleet it
 * does not: every deploy target proxies `location /<sys>/` straight to Node, so nginx only ever
 * sees a response, which it then compresses **per request** — the same bytes, for every
 * visitor, forever (aide-rap#555). The file is on Node's disk, so Node is the only party that
 * can hand over something compressed once, at build time, at a quality a proxy would never
 * spend per response (brotli 11 against nginx's 5).
 *
 * ── The two things this adds ─────────────────────────────────────────────────────────────
 * 1. **A precompressed sibling wins.** `app.min.js.br` beside `app.min.js` is served to a
 *    client that accepts `br`, with the ORIGINAL file's content type and
 *    `Vary: Accept-Encoding`. Without that `Vary`, a shared cache would hand a brotli body to
 *    the next client that cannot read it.
 * 2. **A URL carrying `?v=` is frozen for a year.** It cannot go stale: the version IS in the
 *    URL, so a new build is a new URL. express.static's default is `max-age=0`, i.e. a
 *    revalidation round trip per asset per visit — on a satellite link that is the expensive
 *    half, because it costs latency rather than bytes.
 *
 * ── What it deliberately does NOT do ─────────────────────────────────────────────────────
 * An **unversioned** URL keeps express.static's behaviour. Freezing one for a year would be
 * unfixable: nothing in the URL could ever bust that cache, and the action pages' assets
 * (`/static/rap/lib/*.js`) are exactly those.
 *
 * A **stale** sibling is ignored rather than served. A `.br` older than its source would make
 * the browser run yesterday's code under today's version — silent, and the worst failure this
 * file could produce (§3). Two `statSync` calls per asset request are the price; express.static
 * stats the file anyway.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');

/** Extensions worth compressing — everything else is already compressed or too small to matter. */
const COMPRESSIBLE = new Set(['.js', '.css', '.json', '.svg', '.map', '.txt', '.xml', '.wasm']);

/** Encodings in the order we prefer them: brotli is smaller, gzip is universal. */
const ENCODINGS = [{ enc: 'br', ext: '.br' }, { enc: 'gzip', ext: '.gz' }];

/**
 * Does the client accept this encoding? Reads the quality value, so `br;q=0` counts as a no.
 *
 * @param {string} header the raw `Accept-Encoding`
 * @param {string} enc
 * @returns {boolean}
 */
function accepts(header, enc) {
  for (const part of header.split(',')) {
    const [name, ...params] = part.trim().split(';');
    if (name !== enc && name !== '*') continue;
    const q = params.map((p) => /^q=([\d.]+)$/.exec(p.trim())).find(Boolean);
    return q ? Number(q[1]) > 0 : true;
  }
  return false;
}

/**
 * The precompressed file to serve instead, or null.
 *
 * @param {string} dir the mount's root on disk
 * @param {string} pathname the request path, already stripped of the mount prefix
 * @param {string} acceptEncoding
 * @returns {{ext: string, enc: string}|null}
 */
function pickSibling(dir, pathname, acceptEncoding) {
  if (!COMPRESSIBLE.has(path.extname(pathname).toLowerCase())) return null;
  // A path that climbs out of the mount is not ours to answer — express.static refuses it
  // anyway, and we must not stat it.
  const abs = path.join(dir, pathname);
  if (!abs.startsWith(path.resolve(dir) + path.sep)) return null;
  let src;
  try { src = fs.statSync(abs); } catch { return null; }
  for (const { enc, ext } of ENCODINGS) {
    if (!accepts(acceptEncoding, enc)) continue;
    try {
      const sib = fs.statSync(abs + ext);
      // Older than its source → ignore it. Serving it would be silently wrong.
      if (sib.mtimeMs >= src.mtimeMs) return { ext, enc };
    } catch { /* no sibling for this encoding */ }
  }
  return null;
}

/**
 * A static mount that prefers a precompressed sibling and freezes versioned URLs.
 *
 * @param {string} dir directory to serve
 * @param {{immutableSeconds?: number}} [options]
 * @returns {import('express').Router}
 */
function staticAssets(dir, options = {}) {
  const immutableSeconds = options.immutableSeconds ?? 31536000;   // one year
  const router = express.Router();

  router.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const [pathname] = req.url.split('?');
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return next(); }
    const pick = pickSibling(dir, decoded, req.headers['accept-encoding'] || '');
    if (!pick) return next();
    // Remember what the browser asked for: `setHeaders` below sees only the file on disk, and
    // the content type must come from the ORIGINAL name, not from `.br`.
    res.locals._precompressed = { enc: pick.enc, type: express.static.mime.lookup(decoded) };
    req.url = pathname + pick.ext + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    next();
  });

  router.use(express.static(dir, {
    // Runs on send's `headers` event — i.e. AFTER send has set its own content type, which is
    // why setting it here wins.
    setHeaders: (res, filePath) => {
      const pre = res.locals._precompressed;
      if (pre) {
        res.setHeader('Content-Encoding', pre.enc);
        if (pre.type) res.setHeader('Content-Type', pre.type);
      }
      // Always, not only when a sibling was served: the same URL may answer compressed to one
      // client and plain to the next, and a shared cache must not mix the two up.
      if (COMPRESSIBLE.has(path.extname(filePath.replace(/\.(br|gz)$/, '')).toLowerCase())) {
        res.setHeader('Vary', 'Accept-Encoding');
      }
      // A version in the URL makes the answer unchangeable, so it need never be revalidated.
      const q = res.req && res.req.query;
      if (q && (q.v !== undefined || q.version !== undefined)) {
        res.setHeader('Cache-Control', `public, max-age=${immutableSeconds}, immutable`);
      }
    },
  }));

  return router;
}

module.exports = { staticAssets, accepts, pickSibling, COMPRESSIBLE };
