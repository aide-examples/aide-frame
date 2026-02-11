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
     * Initialize i18n - loads strings and creates Polyglot instance
     * @param {string|null} lang - Force language, or auto-detect if null
     */
    async init(lang = null) {
        this.lang = this.normalizeLanguage(lang || this.detectLanguage());

        // Load framework strings (from aide-frame)
        const frame = await this.loadJson(`static/frame/locales/${this.lang}.json`);

        // Load app strings (override framework strings)
        const app = await this.loadJson(`static/locales/${this.lang}.json`);

        // Initialize Polyglot with merged strings
        this.polyglot = new Polyglot({
            phrases: {...frame, ...app},
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
     * Apply translations to all elements with data-i18n attribute
     * Also adds 'notranslate' class to prevent Google Translate from re-translating
     * @param {Element} root - Root element to search (default: document)
     *
     * Example HTML:
     *   <span data-i18n="status">Status</span>
     *   <button data-i18n="pause">Pause</button>
     */
    applyToDOM(root = document) {
        root.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            const params = el.dataset.i18nParams ? JSON.parse(el.dataset.i18nParams) : {};
            el.textContent = this.t(key, params);
            // Mark as notranslate for Google Translate
            el.classList.add('notranslate');
        });
    }
}

// Global i18n instance
const i18n = new I18n();
