/**
 * Status Widget for aide-frame applications.
 *
 * Displays version, memory usage, update status, and restart button.
 *
 * Usage:
 *   <div id="status-widget"></div>
 *   <script src="/static/frame/js/status-widget.js"></script>
 *   <script>StatusWidget.init('#status-widget')</script>
 *
 * Or with options:
 *   StatusWidget.init('#status-widget', {
 *     showMemory: true,
 *     showRestart: true,
 *     refreshInterval: 30000
 *   })
 */

const StatusWidget = {
    container: null,
    options: {
        showMemory: true,
        showRestart: true,
        refreshInterval: 30000
    },
    status: {},

    init(selector, options = {}) {
        this.container = document.querySelector(selector);
        if (!this.container) {
            console.error('StatusWidget: Container not found:', selector);
            return;
        }

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
                    <span class="status-label">Version</span>
                    <span class="status-value" id="sw-version">--</span>
                </div>
                ${this.options.showMemory ? `
                <div class="status-row" id="sw-memory-row">
                    <span class="status-label">Memory</span>
                    <span class="status-value" id="sw-memory" style="font-size: 0.85em; color: #888;">--</span>
                </div>
                ` : ''}
                <div class="status-row" id="sw-update-row" style="display: none;">
                    <span class="status-label">Update</span>
                    <a href="/update" class="status-value" style="color: #2563eb; text-decoration: none;">Available</a>
                </div>
                <div class="status-row">
                    <a href="/update" style="flex: 1; color: #2563eb; text-decoration: none; font-size: 0.9em;">System Update</a>
                    ${this.options.showRestart ? `
                    <button onclick="StatusWidget.restart()" class="secondary" style="padding: 8px 12px; font-size: 0.85em;">Restart</button>
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
            console.error('StatusWidget: Failed to load status:', e);
        }
    },

    updateUI() {
        const versionEl = document.getElementById('sw-version');
        if (versionEl) {
            versionEl.textContent = this.status.current_version || '--';
        }

        const memoryEl = document.getElementById('sw-memory');
        if (memoryEl && this.status.memory) {
            memoryEl.textContent = `${this.status.memory.rss_mb} MB`;
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
            alert('Server is restarting...');
            setTimeout(() => location.reload(), 3000);
        } catch (e) {
            // Server may have already stopped
            alert('Server is restarting...');
            setTimeout(() => location.reload(), 3000);
        }
    }
};
