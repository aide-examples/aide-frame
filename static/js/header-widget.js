/**
 * Header Widget for aide-frame applications.
 * Standard header: App name (left) | Language | About | ? (right)
 */

const HeaderWidget = {
    container: null,
    options: {
        appName: 'AIDE App',
        titleHtml: null,
        showAbout: true,
        showHelp: true,
        showLanguage: true,
        showGoogleTranslate: false,
        aboutLink: '/about',
        helpLink: '/help',
        aboutText: 'About'
    },

    init(selector, options = {}) {
        this.container = document.querySelector(selector);
        if (!this.container) return;
        this.options = { ...this.options, ...options };
        this.render();
    },

    render() {
        const items = [];

        // Language dropdown
        if (this.options.showLanguage && typeof i18n !== 'undefined') {
            const currentLang = i18n.lang || 'en';
            const langOptions = i18n.supported.map(lang => {
                const selected = lang === currentLang ? 'selected' : '';
                const label = lang.toUpperCase();
                return `<option value="${lang}" ${selected}>${label}</option>`;
            }).join('');
            items.push(`<select id="header-lang-select" class="header-lang-select" title="Language">${langOptions}</select>`);
        }

        // Google Translate placeholder (initialized after render)
        if (this.options.showGoogleTranslate) {
            items.push(`<span id="header-gt-container"></span>`);
        }

        if (this.options.showAbout) {
            items.push(`<a href="${this.options.aboutLink}" class="header-link notranslate">${this.options.aboutText}</a>`);
        }
        if (this.options.showHelp) {
            items.push(`<a href="${this.options.helpLink}" class="header-link notranslate" title="Help" style="font-weight: bold;">?</a>`);
        }

        const homeLink = this.options.showAbout ? this.options.aboutLink : '#';
        this.container.innerHTML = `
            <div class="header">
                <a href="${homeLink}" class="header-brand notranslate">${this.options.titleHtml || this.options.appName}</a>
                <div style="display: flex; align-items: center; gap: 12px;">${items.join('')}</div>
            </div>
        `;

        // Toggle behavior: click brand → about, click again → back
        if (this.options.showAbout) {
            const brand = this.container.querySelector('.header-brand');
            brand.addEventListener('click', (e) => {
                const aboutPath = new URL(this.options.aboutLink, location.origin).pathname;
                if (location.pathname === aboutPath) {
                    e.preventDefault();
                    history.back();
                }
            });
        }

        // Attach event listener for language change
        const langSelect = document.getElementById('header-lang-select');
        if (langSelect) {
            langSelect.addEventListener('change', (e) => {
                i18n.setLanguage(e.target.value);
            });
        }

        // Initialize Google Translate if enabled
        if (this.options.showGoogleTranslate && typeof GoogleTranslate !== 'undefined') {
            GoogleTranslate.init('#header-gt-container');
        }
    }
};
