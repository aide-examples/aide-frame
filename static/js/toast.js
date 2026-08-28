/**
 * Toast — non-blocking, corner notifications for aide-frame applications.
 *
 * The frame's shared notification mechanism: a small message that slides into the
 * top-right corner and either auto-dismisses or waits for a click (sticky). It is
 * the non-blocking replacement for `alert()` — a blocking `alert()` freezes the
 * page and demands an OK; a *sticky* toast (`duration: 0`) conveys the same
 * "you must see this" weight while leaving the page usable, and carries its own ×.
 *
 * i18n-agnostic by design: callers pass an already-resolved string (do the
 * `i18n.t(...)` at the call site), so this file has no dependency and can load
 * anywhere in the bundle.
 *
 * API is intentionally identical to aide-rap's DomUtils.toast so that consumer
 * can later delegate here (one mechanism, §17):
 *   Toast.show(message, type='info', duration?, opts?)
 *     type     : 'info' | 'success' | 'warning' | 'error'
 *     duration : ms before auto-dismiss; 0 = sticky (manual × / click). Default:
 *                error → 0 (sticky), warning → 8000, else → 4000.
 *     opts.action : { label, onClick } → a clickable link inside the toast
 *     opts.big    : taller, more prominent toast (larger padding + font)
 */

const Toast = {
  show(message, type = 'info', duration, opts = {}) {
    if (typeof document === 'undefined') return null;
    if (duration === undefined) duration = (type === 'error') ? 0 : (type === 'warning') ? 8000 : 4000;

    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = `
        position: fixed; top: 10px; right: 10px; z-index: 10000;
        display: flex; flex-direction: column; gap: 8px; max-width: 400px;
      `;
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const colors = { info: '#2196F3', success: '#4CAF50', warning: '#FF9800', error: '#f44336' };
    toast.style.cssText = `
      background: ${colors[type] || colors.info}; color: white;
      padding: 12px 16px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      font-size: 14px; line-height: 1.4; cursor: pointer;
      animation: toast-slide-in 0.3s ease-out;
      white-space: pre-line; position: relative;
    `;
    // opts.big — a taller, more prominent toast.
    if (opts && opts.big) {
      toast.style.padding = '20px 24px';
      toast.style.fontSize = '15.5px';
      toast.style.lineHeight = '1.5';
    }
    toast.textContent = message;
    toast.onclick = () => toast.remove();

    // Sticky toasts (duration 0): a visible × so the manual-dismiss affordance is
    // obvious — this is the case that stands in for a blocking alert().
    if (duration === 0) {
      const closeBtn = document.createElement('span');
      closeBtn.textContent = '×';
      closeBtn.style.cssText = 'position:absolute; top:4px; right:8px; font-size:18px; font-weight:bold; cursor:pointer; opacity:0.7;';
      closeBtn.onclick = (e) => { e.stopPropagation(); toast.remove(); };
      toast.style.paddingRight = '28px';
      toast.appendChild(closeBtn);
    }

    // Optional action link: clicking runs the handler and dismisses the toast.
    if (opts && opts.action && typeof opts.action.onClick === 'function') {
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = opts.action.label || 'Open';
      link.style.cssText = 'display:block; margin-top:6px; color:#fff; font-weight:600; text-decoration:underline; cursor:pointer;';
      link.onclick = (e) => { e.preventDefault(); e.stopPropagation(); try { opts.action.onClick(); } finally { toast.remove(); } };
      toast.appendChild(link);
    }

    if (!document.getElementById('toast-styles')) {
      const style = document.createElement('style');
      style.id = 'toast-styles';
      style.textContent = `
        @keyframes toast-slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `;
      document.head.appendChild(style);
    }

    container.appendChild(toast);
    if (duration > 0) setTimeout(() => toast.remove(), duration);
    return toast;
  },

  /** Shorthand: a sticky error toast — the faithful alert() replacement. */
  error(message) { return this.show(message, 'error', 0); },
};

if (typeof window !== 'undefined') window.Toast = Toast;
