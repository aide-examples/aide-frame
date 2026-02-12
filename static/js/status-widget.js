/**
 * Status Widget for aide-frame applications.
 * Compact single-line footer: version · platform · memory | Layout | Update | Restart
 */

const StatusWidget = {
    container: null,
    options: { showUpdate: true, showInstall: true, showReload: true, showLayoutToggle: false, compactInfo: false, layoutDefault: 'flow', refreshInterval: 30000, extraInfo: null, extraActions: null },
    status: {},

    init(selector, options = {}) {
        this.container = document.querySelector(selector);
        if (!this.container) return;
        this.options = { ...this.options, ...options };
        this.render();
        this.loadStatus();
        this.initLayout();
        if (this.options.refreshInterval > 0) {
            setInterval(() => this.loadStatus(), this.options.refreshInterval);
        }
    },

    render() {
        const infoDetails = this.options.compactInfo ? '' : `
                    <span class="status-footer-sep">·</span>
                    <span id="sw-platform">--</span>
                    <span class="status-footer-sep">·</span>
                    <span id="sw-memory">--</span>`;
        this.container.innerHTML = `
            <div class="status-footer notranslate">
                <span class="status-footer-info">
                    <span id="sw-version" ${this.options.compactInfo ? 'class="sw-version-tooltip" style="cursor:default"' : ''}>--</span>${infoDetails}
                    ${this.options.extraInfo || ''}
                </span>
                <span class="status-footer-actions">
                    ${this.options.showLayoutToggle ? `
                    <button onclick="StatusWidget.toggleLayout()" class="status-footer-btn" id="sw-layout-btn" title="Toggle layout mode">⊞</button>
                    ` : ''}
                    ${this.options.showInstall ? `
                    <a href="#" id="sw-install-link" class="status-footer-btn" style="display:none" onclick="StatusWidget.install(); return false;">Install App</a>
                    ` : ''}
                    ${this.options.showReload ? `
                    <button onclick="location.reload()" class="status-footer-btn" title="Reload page">&#x21bb;</button>
                    ` : ''}
                    ${this.options.showUpdate ? `
                    <a href="update" id="sw-update-link" class="status-footer-btn">Update</a>
                    ` : ''}
                    <button onclick="StatusWidget.restart()" class="status-footer-btn sw-restart-btn" style="display:none">Restart</button>
                    ${this.options.extraActions || ''}
                </span>
            </div>
        `;
    },

    initLayout() {
        // Determine initial layout: localStorage overrides config default
        const stored = localStorage.getItem('aide-layout');
        const mode = stored || this.options.layoutDefault || 'flow';
        this.applyLayout(mode);
    },

    applyLayout(mode) {
        const container = document.querySelector('.app-container');
        const header = document.querySelector('.header');
        const footer = document.querySelector('.status-footer');

        if (mode === 'page-fill') {
            container?.classList.add('page-fill');
            header?.classList.add('compact');
            footer?.classList.add('compact');
        } else {
            container?.classList.remove('page-fill');
            header?.classList.remove('compact');
            footer?.classList.remove('compact');
        }

        // Update button state
        const btn = document.getElementById('sw-layout-btn');
        if (btn) {
            btn.classList.toggle('highlight', mode === 'page-fill');
        }
    },

    toggleLayout() {
        const container = document.querySelector('.app-container');
        const isPageFill = container?.classList.contains('page-fill');
        const newMode = isPageFill ? 'flow' : 'page-fill';
        localStorage.setItem('aide-layout', newMode);
        this.applyLayout(newMode);
    },

    async loadStatus() {
        try {
            const res = await fetch('api/update/status');
            this.status = await res.json();
            this.updateUI();
        } catch (e) {
            console.error('StatusWidget:', e);
        }
    },

    updateUI() {
        const versionEl = document.getElementById('sw-version');
        if (versionEl && this.status.current_version) {
            versionEl.textContent = `v${this.status.current_version}`;
        }

        if (this.options.compactInfo) {
            // Compact mode: platform + memory as tooltip on version
            if (versionEl) {
                const parts = [];
                if (this.status.platform) parts.push(this.status.platform);
                if (this.status.memory) {
                    const m = this.status.memory;
                    if (m.used_mb && m.total_mb) parts.push(`${m.used_mb}/${m.total_mb} MB`);
                    else if (m.used_mb) parts.push(`${m.used_mb} MB`);
                }
                if (parts.length) versionEl.title = parts.join(' · ');
            }
        } else {
            const platformEl = document.getElementById('sw-platform');
            if (platformEl && this.status.platform) {
                platformEl.textContent = this.status.platform;
            }

            const memoryEl = document.getElementById('sw-memory');
            if (memoryEl && this.status.memory) {
                const m = this.status.memory;
                if (m.used_mb && m.total_mb) {
                    memoryEl.textContent = `${m.used_mb}/${m.total_mb} MB`;
                } else if (m.used_mb) {
                    memoryEl.textContent = `${m.used_mb} MB`;
                }
            }
        }

        const updateLink = document.getElementById('sw-update-link');
        if (updateLink && this.status.update_available) {
            updateLink.classList.add('highlight');
            updateLink.textContent = 'Update ✦';
        }

        // Show/hide restart button based on server capability
        const restartBtn = this.container.querySelector('.sw-restart-btn');
        if (restartBtn) {
            restartBtn.style.display = this.status.can_restart ? '' : 'none';
        }
    },

    async restart() {
        if (!confirm('Restart the server?')) return;
        try { await fetch('api/restart', { method: 'POST' }); } catch (e) {}
        alert('Server is restarting...');
        setTimeout(() => location.reload(), 3000);
    },

    async install() {
        if (typeof PWA !== 'undefined' && PWA.canInstall()) {
            await PWA.install();
        }
    }
};
