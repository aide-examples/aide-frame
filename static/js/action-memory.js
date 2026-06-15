// @ts-check
'use strict';

/**
 * ActionMemory — a tiny per-action persistent key/value store for ACTION
 * dialogs. A "cookie-like" memory backed by localStorage under a namespaced
 * prefix, so an action can remember small bits of UI state across launches
 * (e.g. the last-selected host, a preferred line count) WITHOUT each action
 * reinventing key naming or scope hygiene.
 *
 * The MECHANISM is generic — the frame bundle provides it to every action
 * page. WHETHER and HOW an action uses it is the individual dialog's policy:
 * e.g. "when launched without an ?id=, fall back to the last-selected record"
 * is a choice the dialog makes, not a framework rule. (Named 2026-06-15 with
 * the architect: generalise the store, not the default-to-last-used behaviour.)
 *
 * Scope convention: '<system>:<action>' (e.g. 'rapsmgr:pm2') so two actions —
 * or the same action in two systems — never collide.
 *
 *   const mem = new ActionMemory('rapsmgr:pm2');
 *   mem.set('lastHost', 'amigo');
 *   const h = mem.get('lastHost');        // 'amigo' | null
 *   const n = mem.get('lines', 40);       // fallback when absent
 *   mem.remove('lastHost');
 *
 * Values are JSON-serialised, so strings/numbers/booleans/objects all work.
 * All accessors are defensive: a disabled/--full localStorage (private mode,
 * quota) degrades to "no memory", never throws.
 */
class ActionMemory {
  /** @param {string} scope stable id for the action, e.g. '<system>:<action>' */
  constructor(scope) {
    this._prefix = 'rap-action-mem:' + String(scope || 'default') + ':';
  }

  /** @param {string} key @param {*} [fallback] @returns {*} the stored value, or `fallback` when absent/unreadable */
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(this._prefix + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }

  /** @param {string} key @param {*} value JSON-serialisable */
  set(key, value) {
    try { localStorage.setItem(this._prefix + key, JSON.stringify(value)); }
    catch { /* localStorage unavailable (private mode / quota) — silently no-op */ }
  }

  /** @param {string} key */
  remove(key) {
    try { localStorage.removeItem(this._prefix + key); }
    catch { /* ignore */ }
  }
}

// Global (top-level declaration → visible to action-page scripts loaded after
// the frame bundle, same realm — mirrors how `i18n` is exposed).
if (typeof module !== 'undefined' && module.exports) { module.exports = ActionMemory; }
