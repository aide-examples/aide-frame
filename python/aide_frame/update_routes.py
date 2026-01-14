"""
HTTP routes for remote update functionality.

Provides:
- API endpoints for update operations (/api/update/*)
- HTML page for update management (/update)
- Status widget HTML fragment

Usage:
    from aide_frame import update_routes

    # Configure updates
    update_config = update_routes.UpdateConfig(
        github_repo="username/repo",
        version_file="VERSION",
        service_name="myapp"
    )

    # In HttpServer setup
    server = HttpServer(
        ...
        update_config=update_config
    )
"""

import os
from dataclasses import dataclass, field
from typing import Optional

from .update import UpdateManager, get_local_version
from .platform_detect import PLATFORM
from .log import logger


def get_memory_mb():
    """Get current process memory usage in MB (works on Linux without psutil)."""
    try:
        with open('/proc/self/status', 'r') as f:
            for line in f:
                if line.startswith('VmRSS:'):
                    # Format: "VmRSS:    12345 kB"
                    return round(int(line.split()[1]) / 1024, 1)
    except Exception:
        pass
    return None


@dataclass
class UpdateConfig:
    """Configuration for remote updates."""
    github_repo: str  # e.g., "aide-examples/aide-hello"
    version_file: str = "VERSION"
    service_name: Optional[str] = None  # For systemctl restart
    use_releases: bool = True
    branch: str = "main"
    show_memory: bool = True
    show_restart: bool = True
    # Internal
    _manager: Optional[UpdateManager] = field(default=None, repr=False)

    def get_manager(self) -> UpdateManager:
        """Get or create UpdateManager instance."""
        if self._manager is None:
            self._manager = UpdateManager({
                "enabled": True,
                "source": {
                    "repo": self.github_repo,
                    "branch": self.branch,
                    "use_releases": self.use_releases
                },
                "service_name": self.service_name
            })
        return self._manager


def handle_update_request(handler, path: str, method: str, data: dict, config: UpdateConfig) -> bool:
    """
    Handle update-related HTTP requests.

    Args:
        handler: HTTP request handler with send_json/send_html methods
        path: Request path
        method: HTTP method (GET/POST)
        data: POST data (empty dict for GET)
        config: UpdateConfig instance

    Returns:
        True if request was handled, False otherwise
    """
    manager = config.get_manager()

    # API endpoints
    if path == '/api/update/status':
        status = manager.get_status()
        # Add platform info
        status['platform'] = PLATFORM
        # Add memory info if enabled
        if config.show_memory:
            mem_mb = get_memory_mb()
            if mem_mb:
                status['memory_mb'] = mem_mb
        handler.send_json(status)
        return True

    if path == '/api/update/check' and method == 'POST':
        result = manager.check_for_updates()
        handler.send_json(result)
        return True

    if path == '/api/update/download' and method == 'POST':
        result = manager.download_update()
        handler.send_json(result)
        return True

    if path == '/api/update/apply' and method == 'POST':
        result = manager.apply_update()
        handler.send_json(result)
        return True

    if path == '/api/update/rollback' and method == 'POST':
        result = manager.rollback()
        handler.send_json(result)
        return True

    if path == '/api/update/enable' and method == 'POST':
        result = manager.enable_updates()
        handler.send_json(result)
        return True

    # HTML pages
    if path == '/update':
        html = render_update_page(config)
        handler.send_html(html)
        return True

    return False


def render_update_page(config: UpdateConfig) -> str:
    """Render the full update management page."""
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>System Update</title>
    <link rel="stylesheet" href="/static/frame/css/base.css">
    <style>
        body {{ display: flex; justify-content: center; padding-top: 40px; }}
        .version-display {{
            display: flex; justify-content: space-between;
            padding: 10px 0; border-bottom: 1px solid #eee;
        }}
        .version-display:last-child {{ border-bottom: none; }}
        .version-label {{ color: #666; }}
        .version-value {{ font-weight: 600; font-size: 1.1rem; color: #333; }}
        .version-value.current {{ color: #16a34a; }}
        .version-value.available {{ color: #2563eb; }}
        .version-value.ahead {{ color: #d97706; }}
        .status-badge {{
            display: inline-block; padding: 4px 12px;
            border-radius: 20px; font-size: 0.8rem; font-weight: 600;
        }}
        .status-badge.checking {{ background: #fef3c7; color: #92400e; }}
        .status-badge.up-to-date {{ background: #dcfce7; color: #166534; }}
        .status-badge.update-available {{ background: #dbeafe; color: #1e40af; }}
        .status-badge.staged {{ background: #e0e7ff; color: #3730a3; }}
        .status-badge.disabled {{ background: #fee2e2; color: #991b1b; }}
        .status-badge.ahead {{ background: #fef3c7; color: #92400e; }}
        .btn-grid {{ display: flex; flex-wrap: wrap; gap: 10px; margin: 15px 0; }}
        .btn-grid button {{ flex: 1; min-width: 140px; }}
        .alert {{
            padding: 12px 15px; border-radius: 8px; margin-bottom: 15px;
            display: none;
        }}
        .alert.show {{ display: block; }}
        .alert.info {{ background: #dbeafe; border: 1px solid #3b82f6; color: #1e40af; }}
        .alert.success {{ background: #dcfce7; border: 1px solid #22c55e; color: #166534; }}
        .alert.warning {{ background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; }}
        .alert.error {{ background: #fee2e2; border: 1px solid #ef4444; color: #991b1b; }}
    </style>
</head>
<body>
    <div class="container wide">
        <a href="/" class="back-link">&larr; Back</a>

        <div class="header">
            <h1>System Update</h1>
        </div>

        <div id="alert" class="alert"></div>

        <div class="card">
            <h2>Version Information</h2>
            <div class="version-display">
                <span class="version-label">Current Version</span>
                <span class="version-value current" id="current-version">--</span>
            </div>
            <div class="version-display">
                <span class="version-label">Available Version</span>
                <span class="version-value" id="available-version">--</span>
            </div>
            <div class="version-display">
                <span class="version-label">Status</span>
                <span id="update-status"><span class="status-badge checking">Loading...</span></span>
            </div>
            <div class="version-display" id="last-check-row">
                <span class="version-label">Last Check</span>
                <span class="version-value" id="last-check">--</span>
            </div>
        </div>

        <div class="card">
            <div class="btn-grid">
                <button id="btn-check" onclick="checkForUpdates()">Check for Updates</button>
                <button id="btn-download" onclick="downloadUpdate()" class="secondary hidden">Download</button>
                <button id="btn-apply" onclick="applyUpdate()" class="hidden">Install & Restart</button>
                <button id="btn-rollback" onclick="rollback()" class="danger hidden">Rollback</button>
                <button id="btn-enable" onclick="enableUpdates()" class="secondary hidden">Re-enable Updates</button>
            </div>
        </div>

        <div class="card">
            <h2>Update Source</h2>
            <div class="details">
                <code>{config.github_repo}</code>
                <span style="color: #888; margin-left: 10px;">
                    {'Releases' if config.use_releases else f'Branch: {config.branch}'}
                </span>
            </div>
        </div>
    </div>

    <script>
        let status = {{}};

        function updateUI() {{
            document.getElementById('current-version').textContent = status.current_version || '--';
            document.getElementById('available-version').textContent = status.available_version || '--';

            // Available version styling
            const availableEl = document.getElementById('available-version');
            availableEl.className = 'version-value';
            if (status.version_comparison === 'update_available') availableEl.classList.add('available');
            else if (status.version_comparison === 'local_ahead') availableEl.classList.add('ahead');

            // Status badge
            const statusEl = document.getElementById('update-status');
            let badgeClass = 'checking', badgeText = 'Unknown';

            if (status.updates_disabled) {{
                badgeClass = 'disabled';
                badgeText = 'Disabled (failures)';
            }} else if (status.update_state === 'staged') {{
                badgeClass = 'staged';
                badgeText = 'Ready to Install';
            }} else if (status.update_state === 'downloading') {{
                badgeClass = 'checking';
                badgeText = 'Downloading...';
            }} else if (status.update_state === 'checking') {{
                badgeClass = 'checking';
                badgeText = 'Checking...';
            }} else if (status.version_comparison === 'update_available') {{
                badgeClass = 'update-available';
                badgeText = 'Update Available';
            }} else if (status.version_comparison === 'local_ahead') {{
                badgeClass = 'ahead';
                badgeText = 'Development';
            }} else if (status.version_comparison === 'up_to_date') {{
                badgeClass = 'up-to-date';
                badgeText = 'Up to Date';
            }}

            statusEl.innerHTML = `<span class="status-badge ${{badgeClass}}">${{badgeText}}</span>`;

            // Last check
            if (status.last_check) {{
                const date = new Date(status.last_check);
                document.getElementById('last-check').textContent = date.toLocaleString();
            }}

            // Buttons
            document.getElementById('btn-download').classList.toggle('hidden',
                !(status.update_available && status.update_state === 'idle'));
            document.getElementById('btn-apply').classList.toggle('hidden',
                status.update_state !== 'staged');
            document.getElementById('btn-rollback').classList.toggle('hidden',
                !status.can_rollback);
            document.getElementById('btn-enable').classList.toggle('hidden',
                !status.updates_disabled);
        }}

        function showAlert(message, type) {{
            const alert = document.getElementById('alert');
            alert.textContent = message;
            alert.className = `alert ${{type}} show`;
            setTimeout(() => alert.classList.remove('show'), 5000);
        }}

        async function loadStatus() {{
            try {{
                const res = await fetch('/api/update/status');
                status = await res.json();
                updateUI();
            }} catch (e) {{
                showAlert('Failed to load status: ' + e.message, 'error');
            }}
        }}

        async function checkForUpdates() {{
            try {{
                const res = await fetch('/api/update/check', {{ method: 'POST' }});
                const data = await res.json();
                status = {{ ...status, ...data }};
                showAlert(data.message || (data.error ? data.error : 'Check complete'), data.success ? 'info' : 'error');
                await loadStatus();
            }} catch (e) {{
                showAlert('Check failed: ' + e.message, 'error');
            }}
        }}

        async function downloadUpdate() {{
            try {{
                const res = await fetch('/api/update/download', {{ method: 'POST' }});
                const data = await res.json();
                showAlert(data.message || data.error, data.success ? 'success' : 'error');
                await loadStatus();
            }} catch (e) {{
                showAlert('Download failed: ' + e.message, 'error');
            }}
        }}

        async function applyUpdate() {{
            if (!confirm('This will install the update and restart the service. Continue?')) return;
            try {{
                const res = await fetch('/api/update/apply', {{ method: 'POST' }});
                const data = await res.json();
                if (data.success) {{
                    showAlert('Update applied! Service is restarting...', 'success');
                    setTimeout(() => location.reload(), 5000);
                }} else {{
                    showAlert(data.error, 'error');
                }}
            }} catch (e) {{
                showAlert('Service may be restarting: ' + e.message, 'warning');
            }}
        }}

        async function rollback() {{
            if (!confirm('This will restore the previous version and restart. Continue?')) return;
            try {{
                const res = await fetch('/api/update/rollback', {{ method: 'POST' }});
                const data = await res.json();
                showAlert(data.message || data.error, data.success ? 'success' : 'error');
                if (data.success) setTimeout(() => location.reload(), 5000);
            }} catch (e) {{
                showAlert('Rollback failed: ' + e.message, 'error');
            }}
        }}

        async function enableUpdates() {{
            try {{
                const res = await fetch('/api/update/enable', {{ method: 'POST' }});
                const data = await res.json();
                showAlert(data.message || data.error, data.success ? 'success' : 'error');
                await loadStatus();
            }} catch (e) {{
                showAlert('Failed: ' + e.message, 'error');
            }}
        }}

        loadStatus();
        setInterval(loadStatus, 30000);
    </script>
</body>
</html>'''


def render_status_widget_html() -> str:
    """Render HTML for the status widget (to be embedded in app pages)."""
    return '''
<div class="card" id="status-widget">
    <div class="status-row">
        <span class="status-label">Version</span>
        <span class="status-value" id="sw-version">--</span>
    </div>
    <div class="status-row" id="sw-memory-row">
        <span class="status-label">Memory</span>
        <span class="status-value" id="sw-memory" style="font-size: 0.85em; color: #888;">--</span>
    </div>
    <div class="status-row" id="sw-update-row" style="display: none;">
        <span class="status-label">Update</span>
        <a href="/update" class="status-value" style="color: #60a5fa; text-decoration: none;">Available</a>
    </div>
    <div class="status-row">
        <a href="/update" style="flex: 1; color: #2563eb; text-decoration: none;">System Update</a>
        <button onclick="swRestart()" class="secondary" style="padding: 8px 12px; font-size: 0.85em;">Restart</button>
    </div>
</div>
'''


__all__ = [
    'UpdateConfig',
    'handle_update_request',
    'render_update_page',
    'render_status_widget_html',
]
