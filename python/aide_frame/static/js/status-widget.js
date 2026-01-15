/**
 * Status Widget for aide-frame applications.
 * Compact single-line footer: version · platform · memory | Update | Restart
 */

const StatusWidget = {
    container: null,
    options: { showRestart: true, showUpdate: true, refreshInterval: 30000 },
    status: {},

    init(selector, options = {}) {
        this.container = document.querySelector(selector);
        if (!this.container) return;
        this.options = { ...this.options, ...options };
        this.render();
        this.loadStatus();
        if (this.options.refreshInterval > 0) {
            setInterval(() => this.loadStatus(), this.options.refreshInterval);
        }
    },

    render() {
        this.container.innerHTML = `
            <div class="status-footer">
                <span class="status-footer-info">
                    <span id="sw-version">--</span>
                    <span class="status-footer-sep">·</span>
                    <span id="sw-platform">--</span>
                    <span class="status-footer-sep">·</span>
                    <span id="sw-memory">--</span>
                </span>
                <span class="status-footer-actions">
                    ${this.options.showUpdate ? `
                    <a href="/update" id="sw-update-link" class="status-footer-btn">Update</a>
                    ` : ''}
                    ${this.options.showRestart ? `
                    <button onclick="StatusWidget.restart()" class="status-footer-btn">Restart</button>
                    ` : ''}
                </span>
            </div>
        `;
    },

    async loadStatus() {
        try {
            const res = await fetch('/api/update/status');
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

        const updateLink = document.getElementById('sw-update-link');
        if (updateLink && this.status.update_available) {
            updateLink.classList.add('highlight');
            updateLink.textContent = 'Update ✦';
        }
    },

    async restart() {
        if (!confirm('Restart the server?')) return;
        try { await fetch('/api/restart', { method: 'POST' }); } catch (e) {}
        alert('Server is restarting...');
        setTimeout(() => location.reload(), 3000);
    }
};
