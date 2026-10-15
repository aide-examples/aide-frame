/**
 * i18n Manager - Wrapper around Polyglot.js
 *
 * Loads framework strings and app strings, merges them,
 * and uses Polyglot.js for translations with pluralization support.
 *
 * Usage:
 *   <script src="/static/frame/vendor/polyglot/polyglot.min.js"></script>
 *   <script src="/static/frame/js/i18n.js"></script>
 *   <script>
 *       await i18n.init();
 *       document.querySelector('h1').textContent = i18n.t('title');
 *   </script>
 */
class I18n {
    constructor() {
        this.polyglot = null;
        this.lang = 'en';
        // THE LANGUAGES THIS INSTALLATION SPEAKS — a default, not a law.
        //
        // These three were hardcoded here from the first day, and that was a birth
        // defect (aide-rap#589): the set of languages an application speaks is a
        // property of THE APPLICATION — it is exactly the set of locale files it
        // ships — and keeping it in framework code meant every further language was
        // a framework edit plus a bundle rebuild. Worse, `normalizeLanguage` turned
        // anything outside the list into `en` and said nothing, so a system that
        // shipped `ar.json` and asked for `ar` got English with the files sitting
        // right there.
        //
        // The list is now DECLARED (`i18n.languages` in the system's config.json)
        // and read at `init`. These three remain the fallback, so every existing
        // caller and every system that declares nothing behaves exactly as before.
        this.supported = ['en', 'de', 'es'];
        /** True once the declared list has replaced the default — see `init`. */
        this.languagesDeclared = false;
        /** Codes a caller asked for and did not get; reported once each. */
        this._dropped = new Set();
    }

    /**
     * Initialize i18n - loads strings and creates Polyglot instance.
     *
     * Accepts either a language string (legacy) or an options object:
     *   i18n.init()                     auto-detect, load from root
     *   i18n.init('de')                 force German, load from root
     *   i18n.init({lang: 'de'})         same as above, object form
     *   i18n.init({basePath: '../../'}) auto-detect, load from <basePath>
     *
     * basePath is prepended to the JSON fetch URLs and is needed when
     * i18n runs from a page that is mounted deeper than RAP root —
     * e.g. action handlers like `/sys/td/td.html` need '../../' so the
     * fetch for `static/frame/locales/<lang>.json` resolves correctly.
     * Defaults to '' (page is at RAP root).
     *
     * @param {string|null|{lang?: string|null, basePath?: string}} [opts]
     */
    async init(opts = null) {
        if (typeof opts === 'string' || opts === null) opts = { lang: opts };
        const basePath = opts.basePath || '';

        // WHICH LANGUAGES, before deciding WHICH ONE — in that order, because the
        // normalisation below answers against the list and would otherwise answer
        // against a default the installation has already replaced (#589).
        //
        // Three sources, most specific first, and each has an owner:
        //   1. `opts.languages` — the caller knows (a kiosk that ships its own set)
        //   2. `GET <basePath>api/config/languages` — the server, from config.json
        //   3. the built-in default above — nothing declared, nothing changes
        // A failed or absent endpoint is NOT an error: an app that never declared
        // anything is the normal case, and it keeps the behaviour it always had.
        if (Array.isArray(opts.languages) && opts.languages.length) {
            this.supported = opts.languages.map((c) => String(c).toLowerCase());
            this.languagesDeclared = true;
        } else if (!this.languagesDeclared) {
            try {
                const r = await fetch(`${basePath}api/config/languages`,
                    { signal: AbortSignal.timeout(3000) });
                if (r.ok) {
                    const j = await r.json();
                    if (Array.isArray(j.languages) && j.languages.length) {
                        this.supported = j.languages.map((c) => String(c).toLowerCase());
                        this.languagesDeclared = true;
                    }
                }
            } catch { /* no endpoint, no network, no change — the default stands */ }
        }

        this.lang = this.normalizeLanguage(opts.lang || this.detectLanguage());

        // Three-tier merge — lowest first, last wins on collisions:
        //   1. Framework strings shipped by aide-frame (docs viewer, header
        //      widget, PWA chrome): mounted at /static/frame/locales/
        //   2. App strings shipped by the consuming app (e.g. RAP CRUD UI
        //      menus + platform-wide labels): mounted at /static/locales/
        //   3. System strings shipped by the active RAP system / sub-app
        //      (e.g. per-system action handler vocabulary like bridge's
        //      td_*, tmon_*, dealer_*): mounted at /static/sys-locales/.
        // Tier 3 is always attempted and silently empty when not mounted,
        // so non-multi-tenant apps don't pay any config cost. See also
        // app/docs/features/login-actions.md ("i18n in action pages").
        // IN PARALLEL, because the three do not depend on each other — they are only merged,
        // below, after all three are in. Serially they were three round trips in a row on the
        // critical path BEFORE the first paint, and `Promise.all` keeps the result order, so the
        // merge precedence below is untouched. This is the one thing that helps the attendee a
        // warmed cache cannot help: the cold one (aide-rap#566, closed in favour of this).
        const [frame, app, sys] = await Promise.all([
            this.loadJson(`${basePath}static/frame/locales/${this.lang}.json`),
            this.loadJson(`${basePath}static/locales/${this.lang}.json`),
            this.loadJson(`${basePath}static/sys-locales/${this.lang}.json`),
        ]);

        // Initialize Polyglot with merged strings
        this.polyglot = new Polyglot({
            phrases: {...frame, ...app, ...sys},
            locale: this.lang,
            allowMissing: true,
            onMissingKey: (key) => key  // Fallback: return key itself
        });
    }

    /**
     * Load JSON file, return empty object on failure
     */
    async loadJson(url) {
        try {
            const res = await fetch(url);
            return res.ok ? await res.json() : {};
        } catch {
            return {};
        }
    }

    /**
     * Detect language from URL param, localStorage, or browser
     */
    detectLanguage() {
        // Priority: URL param > localStorage > browser language > default
        const url = new URLSearchParams(location.search).get('lang');
        const stored = localStorage.getItem('lang');
        const browser = navigator.language?.slice(0, 2);
        return url || stored || browser || 'en';
    }

    /**
     * Normalize language code to supported language
     */
    normalizeLanguage(lang) {
        const code = (lang || 'en').toLowerCase().slice(0, 2);
        if (this.supported.includes(code)) return code;
        // SAID, not swallowed. A silent downgrade to English is the failure mode that
        // cost the investigation in #589: the locale file was there, the request was
        // right, and the answer was quietly another language. Once per code, because
        // `normalizeLanguage` is called on every init and a loop of warnings teaches
        // nobody anything.
        if (code && code !== 'en' && !this._dropped.has(code)) {
            this._dropped.add(code);
            console.warn(`i18n: "${code}" is not among this installation's languages `
                + `(${this.supported.join(', ')}) — falling back to "en". `
                + `Declare it as i18n.languages in config.json and ship static/locales/${code}.json.`);
        }
        return 'en';
    }

    /**
     * Translate a key with optional parameters
     * @param {string} key - Translation key
     * @param {object} params - Parameters for interpolation
     * @returns {string} Translated string
     *
     * Example:
     *   i18n.t('greeting', {name: 'Max'}) -> "Hello Max"
     *   i18n.t('items', {smart_count: 5}) -> "5 items" (with pluralization)
     */
    t(key, params = {}) {
        return this.polyglot ? this.polyglot.t(key, params) : key;
    }

    /**
     * Change language and reload page
     */
    setLanguage(lang) {
        localStorage.setItem('lang', this.normalizeLanguage(lang));
        location.reload();
    }

    /**
     * Apply translations to all elements with i18n data-* attributes.
     *
     * Two flavours:
     *   - `data-i18n="key"`              → sets textContent (notranslate-marked)
     *   - `data-i18n-<attr>="key"`       → sets HTML attribute <attr>
     *
     * Supported attribute variants: title, placeholder, aria-label, alt,
     * value. Without this, hardcoded German/English in title/aria-label/
     * placeholder slips past i18n entirely — see aide-bridge BridgeHeader
     * `aria-label="Turnier wählen"` for the live example that prompted
     * this extension.
     *
     * @param {Element|Document} root - Root element to search (default: document)
     *
     * Example HTML:
     *   <span data-i18n="frame_status">Status</span>
     *   <button data-i18n="pause">Pause</button>
     *   <input data-i18n-placeholder="search_placeholder">
     *   <button data-i18n-title="close" data-i18n-aria-label="close">×</button>
     */
    applyToDOM(root = document) {
        root.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            const params = el.dataset.i18nParams ? JSON.parse(el.dataset.i18nParams) : {};
            el.textContent = this.t(key, params);
            el.classList.add('notranslate');   // suppress Google Translate
        });
        // Attribute targets. Each entry: [html-attr, css-attr-selector, dataset-key]
        const ATTR_TARGETS = [
            ['title',       'data-i18n-title',       'i18nTitle'],
            ['placeholder', 'data-i18n-placeholder', 'i18nPlaceholder'],
            ['aria-label',  'data-i18n-aria-label',  'i18nAriaLabel'],
            ['alt',         'data-i18n-alt',         'i18nAlt'],
            ['value',       'data-i18n-value',       'i18nValue'],
        ];
        for (const [htmlAttr, cssAttr, datasetKey] of ATTR_TARGETS) {
            root.querySelectorAll('[' + cssAttr + ']').forEach(el => {
                const key = el.dataset[datasetKey];
                const params = el.dataset.i18nParams ? JSON.parse(el.dataset.i18nParams) : {};
                el.setAttribute(htmlAttr, this.t(key, params));
            });
        }
    }
}

// Global i18n instance
const i18n = new I18n();
