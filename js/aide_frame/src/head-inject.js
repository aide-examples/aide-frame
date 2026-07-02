/**
 * Shared <head> injection for served HTML shells.
 *
 * Historically each serve site (app shell, doc viewer, search viewer, update
 * page) hand-rolled its own `html.replace('<head>', … <base href> …)`. This
 * module canonicalises that (§17) AND adds per-system BRANDING: a `<style>`
 * that overrides the design tokens (`--color-primary` …) the dark scheme
 * already swaps, plus an optional favicon.
 *
 * Server-side injection (not client JS) keeps it flash-free: the brand tokens
 * land in <head> before the CSS bundle, so the accent color is correct on the
 * first paint — no FOUC.
 */

// ---------------------------------------------------------------------------
// Colour maths — pure, dependency-free. Operate in HSL so lightness shifts are
// perceptual (a brand colour of any hue derives a sensible hover + dark-mode
// variant). The RAP defaults (#2563eb → hover #1d4ed8, dark #60a5fa) are the
// reference behaviour these mirror for an arbitrary brand colour.
// ---------------------------------------------------------------------------

/** Normalise `#rgb` / `#rrggbb` (any case) → `#rrggbb` lowercase, or null. */
function _normHex(hex) {
    if (typeof hex !== 'string') return null;
    let h = hex.trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(h)) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return /^#[0-9a-f]{6}$/.test(h) ? h : null;
}

/** True iff `hex` is a valid `#rgb`/`#rrggbb` colour. */
function isValidHex(hex) { return _normHex(hex) !== null; }

function _hexToRgb(hex) {
    const h = _normHex(hex);
    return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}

function _rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

function _hslToHex({ h, s, l }) {
    h = ((h % 360) + 360) % 360 / 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    const to2 = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/** Shift lightness by `deltaL` percentage points (clamped 0..100). */
function _adjustL(hex, deltaL) {
    const hsl = _rgbToHsl(_hexToRgb(hex));
    return _hslToHex({ h: hsl.h, s: hsl.s, l: hsl.l + deltaL });
}

/** A dark-mode-safe variant: lift lightness so the colour reads on a dark bg. */
function _forDark(hex) {
    const hsl = _rgbToHsl(_hexToRgb(hex));
    const l = Math.min(88, Math.max(hsl.l, 62));      // never darker than 62% on dark bg
    const s = Math.min(hsl.s, 92);                     // avoid neon over-saturation
    return _hslToHex({ h: hsl.h, s, l });
}

function _rgba(hex, a) {
    const { r, g, b } = _hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// ---------------------------------------------------------------------------
// Token derivation
// ---------------------------------------------------------------------------

/**
 * Derive the light + dark `--color-primary*` token blocks from a branding
 * config. One `primaryColor` is enough; `primaryHover` / `primaryDarkMode`
 * override the auto-derivation when supplied.
 *
 * @param {object} branding - system `config.branding`
 * @returns {{lightVars: object, darkVars: object}|null} null if no/invalid primaryColor
 */
function deriveBrandTokens(branding) {
    if (!branding) return null;
    const primary = _normHex(branding.primaryColor);
    if (!primary) return null;

    const hover = _normHex(branding.primaryHover) || _adjustL(primary, -8);
    const dark = _normHex(branding.primaryDarkMode) || _forDark(primary);
    const darkHover = _adjustL(dark, +8);

    const lightVars = {
        '--color-primary': primary,
        '--color-primary-hover': hover,
        '--color-primary-light': _rgba(primary, 0.1),
    };
    if (_normHex(branding.pageBackground)) {
        lightVars['--color-bg-subtle'] = _normHex(branding.pageBackground);
    }
    const darkVars = {
        '--color-primary': dark,
        '--color-primary-hover': darkHover,
        '--color-primary-light': _rgba(dark, 0.15),
    };
    return { lightVars, darkVars };
}

function _varsToCss(vars) {
    return Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join('');
}

/**
 * Build the `<style id="rap-brand">` content, or '' if no valid branding.
 *
 * Uses DOUBLED specificity — `:root:root` (light) and `:root[data-theme=dark]`
 * (dark) — so the brand tokens beat the CSS bundle's own `:root{…}` /
 * `[data-theme=dark]{…}` regardless of source order. The injected <style> sits
 * at the top of <head>, before the bundle's <link>; equal-specificity rules
 * would let the later bundle win. `data-theme` lives on documentElement (:root),
 * so `:root[data-theme=dark]` matches the dark toggle.
 */
function brandStyleCss(branding) {
    const tokens = deriveBrandTokens(branding);
    if (!tokens) return '';
    return `:root:root{${_varsToCss(tokens.lightVars)}}:root[data-theme=dark]{${_varsToCss(tokens.darkVars)}}`;
}

// ---------------------------------------------------------------------------
// Head injection
// ---------------------------------------------------------------------------

/**
 * Inject `<base href>`, branding `<style>`, and favicon `<link>` into an HTML
 * shell's <head>. Any subset may be absent. Returns the html unchanged if
 * there is nothing to inject.
 *
 * @param {string} html
 * @param {object} opts
 * @param {string} [opts.basePath]  reverse-proxy mount, e.g. '/bravo'
 * @param {object} [opts.branding]  system `config.branding`
 */
function injectHead(html, { basePath = '', branding = null } = {}) {
    const parts = [];
    if (basePath) parts.push(`<base href="${basePath}/">`);

    const favicon = branding && typeof branding.favicon === 'string' ? branding.favicon : null;
    if (favicon) {
        // root-absolute favicon paths must be made mount-aware (like manifest icons)
        const href = favicon.startsWith('/') ? basePath + favicon : favicon;
        parts.push(`<link rel="icon" href="${href}">`);
    }

    const brandCss = brandStyleCss(branding);
    if (brandCss) parts.push(`<style id="rap-brand">${brandCss}</style>`);

    if (!parts.length) return html;
    return html.replace('<head>', `<head>\n    ${parts.join('\n    ')}`);
}

module.exports = { injectHead, deriveBrandTokens, brandStyleCss, isValidHex };
