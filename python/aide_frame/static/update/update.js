/**
 * System Update - JavaScript
 * Handles update checking, downloading, applying, and rollback
 */

let status = null;
let isLoading = false;

function showAlert(message, type = 'info') {
    const container = document.getElementById('alert-container');
    container.innerHTML = `<div class="message ${type}">${message}</div>`;
    setTimeout(() => container.innerHTML = '', 5000);
}

function setLoading(buttonId, loading) {
    const btn = document.getElementById(buttonId);
    if (loading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = '<span class="loading"></span> ' + i18n.t('update_please_wait');
    } else {
        btn.disabled = false;
        if (btn.dataset.originalText) {
            btn.innerHTML = btn.dataset.originalText;
        }
    }
}

function formatDate(isoString) {
    if (!isoString) return '--';
    const date = new Date(isoString);
    return date.toLocaleString();
}

function updateUI() {
    if (!status) return;

    // Version display
    document.getElementById('current-version').textContent = status.current_version || '--';
    document.getElementById('available-version').textContent = status.available_version || '--';
    document.getElementById('last-check').textContent = formatDate(status.last_check);

    // Available version styling
    const availableEl = document.getElementById('available-version');
    availableEl.className = 'version-value';
    if (status.version_comparison === 'update_available') {
        availableEl.classList.add('available');
    } else if (status.version_comparison === 'local_ahead') {
        availableEl.classList.add('ahead');
    }

    // Status badge
    const statusEl = document.getElementById('update-status');
    let badgeClass = 'checking';
    let badgeText = i18n.t('update_status_unknown');

    if (status.updates_disabled) {
        badgeClass = 'disabled';
        badgeText = i18n.t('update_status_disabled');
    } else if (status.update_state === 'staged') {
        badgeClass = 'staged';
        badgeText = i18n.t('update_status_staged');
    } else if (status.update_state === 'downloading') {
        badgeClass = 'downloading';
        badgeText = i18n.t('update_status_downloading');
    } else if (status.update_state === 'checking') {
        badgeClass = 'checking';
        badgeText = i18n.t('update_status_checking');
    } else if (status.pending_verification) {
        badgeClass = 'checking';
        badgeText = i18n.t('update_status_verifying');
    } else if (status.version_comparison === 'update_available') {
        badgeClass = 'update-available';
        badgeText = i18n.t('update_status_available');
    } else if (status.version_comparison === 'local_ahead') {
        badgeClass = 'local-ahead';
        badgeText = i18n.t('update_status_dev_mode');
    } else if (status.version_comparison === 'up_to_date') {
        badgeClass = 'up-to-date';
        badgeText = i18n.t('update_status_up_to_date');
    }

    statusEl.innerHTML = `<span class="status-badge ${badgeClass}">${badgeText}</span>`;

    // Button visibility
    document.getElementById('btn-check').classList.remove('hidden');
    document.getElementById('btn-download').classList.toggle('hidden',
        !(status.update_available && status.update_state === 'idle'));
    document.getElementById('btn-apply').classList.toggle('hidden',
        status.update_state !== 'staged');
    document.getElementById('btn-rollback').classList.toggle('hidden',
        !status.can_rollback);
    document.getElementById('btn-enable').classList.toggle('hidden',
        !status.updates_disabled);

    // Source info
    if (status.source) {
        document.getElementById('source-repo').textContent = status.source.repo || '--';
        document.getElementById('source-branch').textContent = status.source.branch || '--';
    }
}

async function refreshStatus() {
    try {
        const res = await fetch('/api/update/status');
        status = await res.json();
        updateUI();
    } catch (e) {
        console.error('Status error:', e);
    }
}

async function checkForUpdates() {
    setLoading('btn-check', true);
    try {
        const res = await fetch('/api/update/check', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showAlert(data.message, data.update_available ? 'info' : 'success');
        } else {
            showAlert(data.error || i18n.t('update_check_failed'), 'error');
        }
        await refreshStatus();
    } catch (e) {
        showAlert(i18n.t('update_network_error') + ': ' + e.message, 'error');
    }
    setLoading('btn-check', false);
}

async function downloadUpdate() {
    setLoading('btn-download', true);
    try {
        const res = await fetch('/api/update/download', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showAlert(data.message, 'success');
            if (data.errors && data.errors.length > 0) {
                showAlert(i18n.t('update_download_warnings') + ': ' + data.errors.join(', '), 'warning');
            }
        } else {
            showAlert(data.error || i18n.t('update_download_failed'), 'error');
        }
        await refreshStatus();
    } catch (e) {
        showAlert(i18n.t('update_network_error') + ': ' + e.message, 'error');
    }
    setLoading('btn-download', false);
}

async function applyUpdate() {
    if (!confirm(i18n.t('update_apply_confirm'))) {
        return;
    }
    setLoading('btn-apply', true);
    try {
        const res = await fetch('/api/update/apply', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showAlert(i18n.t('update_apply_success'), 'success');
            // Wait a bit then try to reconnect
            setTimeout(() => {
                showAlert(i18n.t('update_reconnecting'), 'info');
                setTimeout(() => location.reload(), 3000);
            }, 5000);
        } else {
            showAlert(data.error || i18n.t('update_apply_failed'), 'error');
            await refreshStatus();
        }
    } catch (e) {
        showAlert(i18n.t('update_network_error_restart') + ': ' + e.message, 'warning');
        setTimeout(() => location.reload(), 5000);
    }
    setLoading('btn-apply', false);
}

async function rollback() {
    if (!confirm(i18n.t('update_rollback_confirm'))) {
        return;
    }
    setLoading('btn-rollback', true);
    try {
        const res = await fetch('/api/update/rollback', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showAlert(data.message, 'success');
            setTimeout(() => location.reload(), 5000);
        } else {
            showAlert(data.error || i18n.t('update_rollback_failed'), 'error');
            await refreshStatus();
        }
    } catch (e) {
        showAlert(i18n.t('update_network_error') + ': ' + e.message, 'error');
    }
    setLoading('btn-rollback', false);
}

async function enableUpdates() {
    setLoading('btn-enable', true);
    try {
        const res = await fetch('/api/update/enable', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showAlert(data.message, 'success');
        } else {
            showAlert(data.error || i18n.t('update_enable_failed'), 'error');
        }
        await refreshStatus();
    } catch (e) {
        showAlert(i18n.t('update_network_error') + ': ' + e.message, 'error');
    }
    setLoading('btn-enable', false);
}

// Apply i18n to elements
function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = i18n.t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = i18n.t(el.dataset.i18nTitle);
    });
    document.title = i18n.t('update_title');
}

// Initialize
(async () => {
    await i18n.init();
    applyI18n();
    refreshStatus();
    // Auto-refresh every 10 seconds
    setInterval(refreshStatus, 10000);
})();
