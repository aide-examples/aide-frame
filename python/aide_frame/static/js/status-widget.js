/**
 * Status Widget for aide-frame applications.
 * Compact display: platform · memory | version + buttons
 */

const StatusWidget = {
    container: null,
    options: { showRestart: true, refreshInterval: 30000 },
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
            <div class="card">
                <div class="status-row">
                    <span class="status-label">System</span>
                    <span class="status-value" id="sw-info" style="font-size: 0.85em;">--</span>
                </div>
                <div class="status-row">
                    <span id="sw-version" style="color: #666; font-size: 0.9em;">--</span>
                    <span id="sw-update-hint" style="display: none; margin-left: 8px; color: #2563eb; font-size: 0.85em;">new!</span>
                    <span style="flex: 1;"></span>
                    <button onclick="location.href='/update'" class="secondary" style="padding: 5px 10px; font-size: 0.8em; margin-right: 6px;">Update</button>
                    ${this.options.showRestart ? `
                    <button onclick="StatusWidget.restart()" class="secondary" style="padding: 5px 10px; font-size: 0.8em;">Restart</button>
                    ` : ''}
                </div>
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
        const infoEl = document.getElementById('sw-info');
        if (infoEl) {
            const parts = [];
            if (this.status.platform) parts.push(this.status.platform);
            if (this.status.memory) {
                const m = this.status.memory;
                if (m.used_mb && m.total_mb) {
                    parts.push(`${m.used_mb} of ${m.total_mb} MB`);
                } else if (m.used_mb) {
                    parts.push(`${m.used_mb} MB`);
                }
            }
            infoEl.textContent = parts.join(' · ') || '--';
        }

        const versionEl = document.getElementById('sw-version');
        if (versionEl && this.status.current_version) {
            versionEl.textContent = `v${this.status.current_version}`;
        }

        const hintEl = document.getElementById('sw-update-hint');
        if (hintEl) {
            hintEl.style.display = this.status.update_available ? 'inline' : 'none';
        }
    },

    async restart() {
        if (!confirm('Restart the server?')) return;
        try { await fetch('/api/restart', { method: 'POST' }); } catch (e) {}
        alert('Server is restarting...');
        setTimeout(() => location.reload(), 3000);
    }
};
