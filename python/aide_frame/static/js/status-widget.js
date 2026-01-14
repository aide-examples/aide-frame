/**
 * Status Widget for aide-frame applications.
 * Displays version, platform, memory, update status in a compact card.
 *
 * Usage:
 *   <div id="status-widget"></div>
 *   <script src="/static/frame/js/status-widget.js"></script>
 *   <script>StatusWidget.init('#status-widget')</script>
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
                <div class="status-row" id="sw-update-row" style="display: none;">
                    <span class="status-label">Update</span>
                    <a href="/update" style="color: #2563eb;">Available</a>
                </div>
                <div class="status-row">
                    <a href="/update" style="flex: 1; color: #666; font-size: 0.9em;">System Update</a>
                    ${this.options.showRestart ? `
                    <button onclick="StatusWidget.restart()" class="secondary" style="padding: 6px 10px; font-size: 0.8em;">Restart</button>
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
            if (this.status.current_version) parts.push(`v${this.status.current_version}`);
            if (this.status.platform) parts.push(this.status.platform);
            if (this.status.memory_mb) parts.push(`${this.status.memory_mb} MB`);
            infoEl.textContent = parts.join(' · ') || '--';
        }

        const updateRow = document.getElementById('sw-update-row');
        if (updateRow) {
            updateRow.style.display = this.status.update_available ? 'flex' : 'none';
        }
    },

    async restart() {
        if (!confirm('Restart the server?')) return;
        try {
            await fetch('/api/restart', { method: 'POST' });
        } catch (e) {}
        alert('Server is restarting...');
        setTimeout(() => location.reload(), 3000);
    }
};
