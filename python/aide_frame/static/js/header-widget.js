/**
 * Header Widget for aide-frame applications.
 * Standard header: App name (left) | About | ? (right)
 */

const HeaderWidget = {
    container: null,
    options: {
        appName: 'AIDE App',
        showAbout: true,
        showHelp: true,
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
        const links = [];
        if (this.options.showAbout) {
            links.push(`<a href="${this.options.aboutLink}" class="header-link">${this.options.aboutText}</a>`);
        }
        if (this.options.showHelp) {
            links.push(`<a href="${this.options.helpLink}" class="header-link" title="Help" style="font-weight: bold;">?</a>`);
        }

        this.container.innerHTML = `
            <div class="header">
                <h1>${this.options.appName}</h1>
                <div style="display: flex; gap: 12px;">${links.join('')}</div>
            </div>
        `;
    }
};
