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
 * ── The three things this adds ───────────────────────────────────────────────────────────
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
 * 3. **An HTML page's own references get that `?v=`.** Serving a page, every local `href`/`src`
 *    it names is resolved on disk and rewritten with the first 8 hex digits of its sha256
 *    (aide-rap#565). So point 2 applies to what a system actually loads, and not only to the
 *    two bundles `build.js` stamps by hand: before this, 406 of 409 production references
 *    carried no version, including all 13 of the kiosk page a whole audience opens.
 *
 *    **Per-file hashes, not one version for everything.** A global stamp renames every asset on
 *    every deploy and discards every warmed cache, although a deploy usually changes a minority
 *    of files. A content hash renames exactly what changed — which is what a cache would do
 *    internally, except that here the browser sees it in the URL and therefore need not ask.
 *
 * ── What it deliberately does NOT do ─────────────────────────────────────────────────────
 * An **unversioned** URL keeps express.static's behaviour — a page's own URL above all, and any
 * reference built at runtime in JS. Freezing one for a year would be unfixable: nothing in the
 * URL could ever bust that cache.
 *
 * It also does not stamp on behalf of a mount that did not name its URL prefix. A reference is
 * rewritten only when the file is found, so a missing registration costs revalidation round
 * trips and never a wrong answer — and `test-asset-stamping.js` is what keeps that honest,
 * since the cost is otherwise invisible (§3).
 *
 * A **stale** sibling is ignored rather than served. A `.br` older than its source would make
 * the browser run yesterday's code under today's version — silent, and the worst failure this
 * file could produce (§3). Two `statSync` calls per asset request are the price; express.static
 * stats the file anyway.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
 * Extensions a `?v=` stamp is appended to. Deliberately NOT `.html`: a page is a navigation
 * target, and freezing one for a year would leave a browser unable to ever learn that the
 * application changed — the always-revalidated HTML is the only channel invalidation has.
 */
const STAMPABLE = new Set([
  '.js', '.css', '.mjs', '.json', '.wasm', '.map',
  '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.webm', '.ogg',
]);

/**
 * Every static mount, as `{prefix, dir}`, longest URL prefix first.
 *
 * Why a registry at all: an action page's assets climb out of their own mount. The two biggest
 * files `control-event.html` names are `../../static/frame/…`, which resolve under aide-frame's
 * directory and not under the system's — so a stamp computed inside one mount could not see
 * them. The prefixes are APP-RELATIVE (`/sys`, `/static/frame`), because the whole app is
 * mounted under `basePath` as a sub-app (`http-server.js`): the deployment prefix therefore
 * never enters this file, and a reference keeps the relative form its author wrote.
 */
const MOUNTS = [];

/**
 * Record a mount so references into it can be resolved and stamped.
 *
 * Several dirs may share one prefix (RAP mounts `/icons` twice, system before framework);
 * they are tried in registration order, which is the order express itself tries them.
 *
 * @param {string} prefix app-relative mount path, e.g. `/sys`
 * @param {string} dir directory served there
 */
function registerMount(prefix, dir) {
  const norm = '/' + String(prefix).replace(/^\/+|\/+$/g, '');
  if (MOUNTS.some((m) => m.prefix === norm && m.dir === dir)) return;
  MOUNTS.push({ prefix: norm, dir });
  // Stable sort by descending prefix length, so `/static/frame` wins over `/static`.
  MOUNTS.sort((a, b) => b.prefix.length - a.prefix.length);
}

/** `absolute path -> {key, v}`; the key is mtime+size, so an edit invalidates the entry. */
const versionCache = new Map();

/**
 * The stamp for one file: the first 8 hex digits of its sha256.
 *
 * Eight is enough because a stamp is only ever compared with the PREVIOUS stamp of the same
 * URL — never with another file's. So the birthday problem does not arise; the risk is 2^-32
 * per file per change.
 *
 * Read from the file ON DISK rather than computed at pack time: a hash baked in by the build
 * describes the file as it was packed, so a hotfix copied over it afterwards would keep the old
 * stamp and the browser would never fetch it — exactly the silent staleness a stamp exists to
 * prevent.
 *
 * @param {string} abs
 * @returns {string|null} null when the file cannot be read
 */
function assetVersion(abs) {
  let st;
  try { st = fs.statSync(abs); } catch { return null; }
  if (!st.isFile()) return null;
  const key = `${st.mtimeMs}:${st.size}`;
  const hit = versionCache.get(abs);
  if (hit && hit.key === key) return hit.v;
  let v;
  try {
    v = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 8);
  } catch { return null; }
  versionCache.set(abs, { key, v });
  return v;
}

/**
 * The file a registered mount serves at this app-relative URL path, or null.
 *
 * @param {string} urlPath e.g. `/static/frame/js/dist/frame.min.js`
 * @returns {string|null}
 */
function resolveAsset(urlPath) {
  for (const { prefix, dir } of MOUNTS) {
    if (urlPath !== prefix && !urlPath.startsWith(prefix + '/')) continue;
    const rel = urlPath.slice(prefix.length).replace(/^\/+/, '');
    if (!rel) continue;
    const abs = path.join(dir, rel);
    // A reference that climbs out of its mount is not ours to answer.
    if (!abs.startsWith(path.resolve(dir) + path.sep)) continue;
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

/**
 * Is this attribute value a local subresource reference we may stamp?
 *
 * @param {string} ref
 * @returns {boolean}
 */
function isStampable(ref) {
  if (!ref) return false;
  if (/^[a-zA-Z][a-zA-Z\d+.\-]*:/.test(ref)) return false;      // a scheme — someone else's host
  if (ref.startsWith('//') || ref.startsWith('/')) return false; // absolute: forbidden here anyway
  if (ref.startsWith('#')) return false;
  if (ref.includes('?') || ref.includes('{') || ref.includes('$')) return false; // already versioned, or built at runtime
  return STAMPABLE.has(path.posix.extname(ref.split('#')[0]).toLowerCase());
}

/**
 * Append `?v=<hash>` to every local subresource reference of one HTML document.
 *
 * **A regex over attributes, deliberately, and this is the one place to say why** (§56 asks the
 * parse-tree question first). The question here is not about code structure but about the value
 * of an `href`/`src` attribute, and the project's parser (`acorn`) is a devDependency a
 * deployment does not install — so there is no parse tree to ask at serve time. The filter is
 * what makes the textual route safe: a candidate is rewritten only when it resolves to a file
 * that actually EXISTS under a registered mount, so a match inside a comment or an inline
 * script cannot damage anything that is not already a local asset URL.
 *
 * @param {string} html
 * @param {string} htmlUrlPath app-relative path of the document itself, e.g. `/sys/x/x.html`
 * @returns {{body: string, stamped: number, unresolved: string[]}}
 */
function stampHtml(html, htmlUrlPath) {
  const baseDir = htmlUrlPath.replace(/[^/]*$/, '');
  const unresolved = [];
  let stamped = 0;
  const body = html.replace(
    /\b(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
    (whole, attr, dq, sq) => {
      const ref = dq !== undefined ? dq : sq;
      const quote = dq !== undefined ? '"' : "'";
      if (!isStampable(ref)) return whole;
      const abs = resolveAsset(path.posix.normalize(baseDir + ref));
      const v = abs ? assetVersion(abs) : null;
      if (!v) { unresolved.push(ref); return whole; }
      stamped++;
      return `${attr}=${quote}${ref}?v=${v}${quote}`;
    },
  );
  return { body, stamped, unresolved };
}

/**
 * A static mount that prefers a precompressed sibling and freezes versioned URLs.
 *
 * @param {string} dir directory to serve
 * @param {{immutableSeconds?: number, mount?: string} & Record<string, any>} [options] `mount`
 *   is the app-relative URL prefix this dir is served at — it is what lets a page's references
 *   be stamped, and without it this mount serves HTML unstamped. Every other key is forwarded
 *   to express.static verbatim
 * @returns {import('express').Router}
 */
function staticAssets(dir, options = {}) {
  const { immutableSeconds = 31536000, mount: rawMount, ...staticOptions } = options;
  const mount = rawMount ? '/' + rawMount.replace(/^\/+|\/+$/g, '') : null;
  const router = express.Router();

  if (mount) registerMount(mount, dir);

  // An HTML page is rewritten rather than streamed, so its references can carry their files'
  // hashes. It stays `max-age=0`: the page is the only channel through which a browser can ever
  // learn that anything changed, so it must never be frozen.
  router.use((req, res, next) => {
    if (!mount) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const [pathname] = req.url.split('?');
    if (!/\.html?$/i.test(pathname)) return next();
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return next(); }
    const abs = path.join(dir, decoded);
    if (!abs.startsWith(path.resolve(dir) + path.sep)) return next();
    let html;
    try { html = fs.readFileSync(abs, 'utf8'); } catch { return next(); }  // 404 is express.static's job
    const { body } = stampHtml(html, mount + decoded);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0');
    // `res.send` derives the ETag from the body it is given — i.e. from the STAMPED document,
    // which is what the browser compares against. A conditional request still answers 304.
    return res.send(body);
  });

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

  // Everything the caller passed beyond our own two keys belongs to express.static. Forwarding
  // it is not tidiness: `/feeds` passes `index: false` with a comment explaining that what lies
  // there is a set of named files and not a browsable archive, and from 31.80 until this line
  // existed that option was dropped in silence — `/feeds/` answered 200 with a directory index.
  // (`dotfiles: 'deny'` was dropped too, but express's default `ignore` 404s them anyway, so
  // the half-written `.part` files were never actually exposed.)
  router.use(express.static(dir, {
    ...staticOptions,
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

module.exports = {
  staticAssets, accepts, pickSibling, COMPRESSIBLE,
  registerMount, assetVersion, resolveAsset, isStampable, stampHtml, STAMPABLE, MOUNTS,
};
