/**
 * Status Widget for aide-frame applications.
 * Compact single-line footer: version · platform · memory | Layout | Update | Restart
 */

const StatusWidget = {
    container: null,
    options: { showUpdate: true, showInstall: true, showReload: true, showLayoutToggle: false, compactInfo: false, layoutDefault: 'flow', refreshInterval: 30000, extraInfo: null, extraActions: null, versionLinkUrl: null },
    status: {},

    /**
     * Sekunden als kurze Laufzeit — `8m`, `3h 12m`, `4d 2h`. Bewusst grob: die Frage ist
     * „lief der Prozess schon vor dem Deploy?", nicht die Sekunde.
     * @param {number} sec
     */
    humanUptime(sec) {
        const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
        if (d) return `${d}d ${h}h`;
        if (h) return `${h}h ${m}m`;
        return `${m}m`;
    },

    /**
     * The launch mode as a glyph and one sentence, or null when the server did not say.
     *
     * Three answers that look the same from outside and mean different things, which is why this
     * is in the footer at all. The one worth a glance is `shell`: nothing restarts that process,
     * it dies with the terminal it was started from, and on a demo machine that is exactly what
     * somebody is about to find out the hard way. `container` says a rebuild replaces the code
     * while a volume keeps the data — the question that cost a diagnosis round on 2026-09-25.
     * `pm2` says it comes back on its own, and that its application log is NOT in `pm2 logs`.
     *
     * Null rather than a guess when `launch` is absent: an older server, or a host that is not
     * RAP, should show no badge instead of a wrong one.
     *
     * @param {{mode?: string, pm2?: {id?: string, name?: string|null}|null}|null|undefined} launch
     * @returns {{glyph: string, text: string}|null}
     */
    launchBadge(launch) {
        const mode = launch && launch.mode;
        if (!mode) return null;
        const who = launch.pm2
            ? `pm2 (id ${launch.pm2.id}${launch.pm2.name ? ` · ${launch.pm2.name}` : ''})`
            : 'pm2';
        switch (mode) {
            case 'container':
                return { glyph: '📦', text: 'started by: a container — a rebuild replaces the code, volumes keep the data' };
            case 'pm2':
                return { glyph: '♻', text: `started by: ${who} — it restarts on its own; its log is in combined-*.log, not in \`pm2 logs\`` };
            case 'container+pm2':
                return { glyph: '📦♻', text: `started by: ${who} inside a container` };
            case 'shell':
                return { glyph: '⌨', text: 'started by: a shell — no process manager, so nothing restarts it if it dies' };
            default:
                return null;
        }
    },

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
                    <span id="sw-launch" class="sw-launch" style="display:none"></span><span id="sw-version" ${this.options.compactInfo ? 'class="sw-version-tooltip" style="cursor:default"' : ''}>--</span>${infoDetails}
                    ${this.options.extraInfo || ''}
                </span>
                <span class="status-footer-actions">
                    ${this.options.showLayoutToggle ? `
                    <button onclick="StatusWidget.toggleLayout()" class="status-footer-btn sw-layout-btn" id="sw-layout-btn" title="${i18n.t('toggle_layout_mode')}">⊞</button>
                    ` : ''}
                    ${this.options.showInstall ? `
                    <a href="#" id="sw-install-link" class="status-footer-btn" style="display:none" onclick="StatusWidget.install(); return false;">${i18n.t('install_app')}</a>
                    ` : ''}
                    ${this.options.showReload ? `
                    <button onclick="(window.rapReloadCurrent||function(){location.reload();})()" class="status-footer-btn sw-reload-btn" title="${i18n.t('reload_page')}">&#x21bb;</button>
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
        // How this instance was started, as one glyph in front of the version. Three answers
        // that look identical from outside and mean different things — and the interesting one
        // is the bare shell: nothing brings that process back. `launch` is supplied by the
        // server's status payload; absent (an older server, or a non-RAP host) the glyph stays
        // hidden rather than guessing.
        const launchEl = document.getElementById('sw-launch');
        if (launchEl) {
            const info = StatusWidget.launchBadge(this.status.launch);
            if (info) {
                launchEl.textContent = info.glyph;
                launchEl.title = info.text;
                launchEl.style.display = '';
            } else {
                launchEl.style.display = 'none';
            }
        }

        const versionEl = document.getElementById('sw-version');
        if (versionEl && this.status.current_version) {
            const esc = (s) => { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; };
            const sv = esc(this.status.system_version);
            const cv = esc(this.status.current_version);
            const url = this.options.versionLinkUrl;
            if (url) {
                // attribute-escape minimal set for href
                const href = String(url).replace(/[&"<>]/g, c => ({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]));
                versionEl.innerHTML = this.status.system_version
                    ? `v ${sv} (<a href="${href}" target="_blank" rel="noopener">RAP ${cv}</a>)`
                    : `<a href="${href}" target="_blank" rel="noopener">v${cv}</a>`;
            } else {
                versionEl.textContent = this.status.system_version
                    ? `v ${this.status.system_version} (RAP ${this.status.current_version})`
                    : `v${this.status.current_version}`;
            }
        }

        if (this.options.compactInfo) {
            // Compact mode: platform + memory + (optional) deploy info as tooltip on version.
            // Format (rich, multi-line via \n so hover shows a verbose description):
            //   "deployed on <env> at <DD.MM.YYYY HH:MM> — memory usage on server: <used>/<total> MB
            //    platform: <node+os>"
            // Falls back to the earlier short "platform · memory" form if no deploy tag is set.
            if (versionEl) {
                const lines = [];
                if (this.status.deploy_tag && this.status.deployed_at) {
                    // deploy_tag is `deploy/<env>/<date>[-HHMM]` — extract env
                    const tagParts = this.status.deploy_tag.split('/');
                    const envName = tagParts[1] || this.status.deploy_tag;
                    const when = new Date(this.status.deployed_at);
                    const fmt = (n) => String(n).padStart(2, '0');
                    const whenStr = `${fmt(when.getDate())}.${fmt(when.getMonth() + 1)}.${when.getFullYear()} ${fmt(when.getHours())}:${fmt(when.getMinutes())}`;
                    let line = `deployed on ${envName} at ${whenStr}`;
                    if (this.status.memory) {
                        const m = this.status.memory;
                        if (m.used_mb && m.total_mb) line += ` — memory on server: ${m.used_mb} / ${m.total_mb} MB`;
                        else if (m.used_mb) line += ` — memory on server: ${m.used_mb} MB`;
                    }
                    lines.push(line);
                    if (this.status.platform) lines.push(`platform: ${this.status.platform}`);
                } else {
                    // No deploy tag (local run) — short form
                    const parts = [];
                    if (this.status.platform) parts.push(this.status.platform);
                    if (this.status.memory) {
                        const m = this.status.memory;
                        if (m.used_mb && m.total_mb) parts.push(`${m.used_mb}/${m.total_mb} MB`);
                        else if (m.used_mb) parts.push(`${m.used_mb} MB`);
                    }
                    if (parts.length) lines.push(parts.join(' · '));
                }
                // DB engine + product version (references registry, aide-rap#140):
                // e.g. "database: PostgreSQL 16.14" / "database: SQLite 3.45.0".
                if (this.status.db_version || this.status.db_engine) {
                    lines.push(`database: ${this.status.db_version || this.status.db_engine}`);
                }
                // Since when THIS process has been running — the line that makes
                // "deployed on …" checkable at all: if the start lies BEFORE the deploy,
                // the machine is still executing the old code although the new files are
                // on disk. The start time is computed from `uptime_sec` in the READER's
                // zone rather than by taking a UTC timestamp apart — one format error less.
                if (typeof this.status.uptime_sec === 'number') {
                    const started = new Date(Date.now() - this.status.uptime_sec * 1000);
                    const p = (n) => String(n).padStart(2, '0');
                    const when = `${p(started.getDate())}.${p(started.getMonth() + 1)}.${started.getFullYear()} `
                        + `${p(started.getHours())}:${p(started.getMinutes())}`;
                    lines.push(`server process running since ${when} (${StatusWidget.humanUptime(this.status.uptime_sec)})`);
                }
                // Same sentence the glyph carries, in the version tooltip the architect asked
                // for — one place to hover, next to where the versions stand.
                const launch = StatusWidget.launchBadge(this.status.launch);
                if (launch) lines.push(launch.text);
                if (lines.length) versionEl.title = lines.join('\n');
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
        // Sticky toast (non-blocking, unlike the old alert()); it vanishes on the
        // reload below anyway.
        Toast.show((typeof i18n !== 'undefined' && i18n.t && i18n.t('frame_server_restarting')) || 'Server is restarting…', 'info', 0);
        setTimeout(() => location.reload(), 3000);
    },

    async install() {
        if (typeof PWA !== 'undefined' && PWA.canInstall()) {
            await PWA.install();
        }
    }
};
