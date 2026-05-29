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
        this.supported = ['en', 'de', 'es'];
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
        this.lang = this.normalizeLanguage(opts.lang || this.detectLanguage());
        const basePath = opts.basePath || '';

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
        const frame = await this.loadJson(`${basePath}static/frame/locales/${this.lang}.json`);
        const app   = await this.loadJson(`${basePath}static/locales/${this.lang}.json`);
        const sys   = await this.loadJson(`${basePath}static/sys-locales/${this.lang}.json`);

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
        return this.supported.includes(code) ? code : 'en';
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
     *   <span data-i18n="status">Status</span>
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
