/**
 * Toast — Non-blocking notification system.
 * Variants: info | success | warning | error
 * Supports auto-dismiss, persistent mode, and an action button.
 *
 * Usage:
 *   import { toast } from '../modules/notifications/toast.js';
 *   toast.success('File saved');
 *   toast.error('Connection lost', { persist: true });
 *   toast.info('Peer joined', { action: { label: 'Dismiss', fn: () => {} } });
 */

import { bus } from '../../core/eventbus.js';

class Toast {
    #container;
    #queue = [];
    #active = new Map();
    #counter = 0;

    init() {
        this.#container = document.getElementById('toast-container');
        if (!this.#container) {
            this.#container = document.createElement('div');
            this.#container.id = 'toast-container';
            this.#container.className = 'toast-container';
            document.body.appendChild(this.#container);
        }

        // Allow other modules to trigger toasts via bus
        bus.on('toast:info',    (d) => this.info(d.msg, d));
        bus.on('toast:success', (d) => this.success(d.msg, d));
        bus.on('toast:warning', (d) => this.warning(d.msg, d));
        bus.on('toast:error',   (d) => this.error(d.msg, d));
    }

    info(msg, opts = {})    { return this._show(msg, 'info',    opts); }
    success(msg, opts = {}) { return this._show(msg, 'success', opts); }
    warning(msg, opts = {}) { return this._show(msg, 'warning', opts); }
    error(msg, opts = {})   { return this._show(msg, 'error',   opts); }

    dismiss(id) {
        const el = this.#active.get(id);
        if (!el) return;
        el.classList.add('toast-out');
        el.addEventListener('animationend', () => {
            el.remove();
            this.#active.delete(id);
        }, { once: true });
    }

    dismissAll() {
        for (const id of this.#active.keys()) this.dismiss(id);
    }

    _show(msg, type, opts = {}) {
        const id       = ++this.#counter;
        const duration = opts.persist ? 0 : (opts.duration ?? 4000);
        const icon     = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' }[type];

        const el = document.createElement('div');
        el.className = `toast toast-${type} toast-in`;
        el.setAttribute('role', 'alert');
        el.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span class="toast-msg">${_escape(msg)}</span>
            ${opts.action ? `<button class="toast-action">${_escape(opts.action.label)}</button>` : ''}
            <button class="toast-dismiss" title="Dismiss">✕</button>
        `;

        el.querySelector('.toast-dismiss').addEventListener('click', () => this.dismiss(id));
        if (opts.action) {
            el.querySelector('.toast-action').addEventListener('click', () => {
                opts.action.fn();
                this.dismiss(id);
            });
        }

        this.#container.appendChild(el);
        this.#active.set(id, el);

        if (duration > 0) {
            setTimeout(() => this.dismiss(id), duration);
        }

        return id;
    }
}

function _escape(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export const toast = new Toast();
