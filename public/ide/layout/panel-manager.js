/**
 * PanelManager — Drag-resizable split panels.
 * Uses CSS custom properties on the root element so the layout responds to JS without re-rendering.
 *
 * Panels managed:
 *  - Left panel  (file tree / activity content)  → --left-panel-width
 *  - Bottom panel (terminal / output)             → --bottom-panel-height
 */

import { bus } from '../core/eventbus.js';
import { store } from '../core/store.js';

export class PanelManager {
    #root;
    #leftResizer;
    #bottomResizer;
    #dragging = null;

    constructor() {
        this.#root = document.documentElement;
    }

    init() {
        this.#leftResizer   = document.getElementById('left-resizer');
        this.#bottomResizer = document.getElementById('bottom-resizer');

        // Restore persisted sizes
        this._applyLeftWidth(store.get('leftPanelWidth'));
        this._applyBottomHeight(store.get('bottomPanelHeight'));
        this._applyLeftVisible(store.get('leftPanelVisible'));
        this._applyBottomVisible(store.get('bottomPanelVisible'));

        // Wire drag handles
        this.#leftResizer?.addEventListener('pointerdown',   (e) => this._startDrag(e, 'left'));
        this.#bottomResizer?.addEventListener('pointerdown', (e) => this._startDrag(e, 'bottom'));

        document.addEventListener('pointermove', (e) => this._onDrag(e));
        document.addEventListener('pointerup',   ()  => this._endDrag());

        // React to store
        store.subscribe('leftPanelVisible',  (v) => this._applyLeftVisible(v));
        store.subscribe('bottomPanelVisible',(v) => this._applyBottomVisible(v));

        // Bus commands
        bus.on('panel:toggle-left',   () => this.toggleLeft());
        bus.on('panel:toggle-bottom', () => this.toggleBottom());
        bus.on('panel:resize-left',   ({ width })  => this._applyLeftWidth(width));
        bus.on('panel:resize-bottom', ({ height }) => this._applyBottomHeight(height));
    }

    toggleLeft() {
        const v = !store.get('leftPanelVisible');
        store.set('leftPanelVisible', v);
    }

    toggleBottom() {
        const v = !store.get('bottomPanelVisible');
        store.set('bottomPanelVisible', v);
    }

    // ── Private ───────────────────────────────────────────────────────────────

    _applyLeftWidth(px) {
        const clamped = Math.max(160, Math.min(520, px));
        this.#root.style.setProperty('--left-panel-width', `${clamped}px`);
        store.set('leftPanelWidth', clamped);
    }

    _applyBottomHeight(px) {
        const clamped = Math.max(80, Math.min(600, px));
        this.#root.style.setProperty('--bottom-panel-height', `${clamped}px`);
        store.set('bottomPanelHeight', clamped);
    }

    _applyLeftVisible(visible) {
        document.getElementById('ide-left-panel')?.classList.toggle('panel-hidden', !visible);
        document.getElementById('left-resizer')?.classList.toggle('panel-hidden', !visible);
        this.#root.style.setProperty('--left-panel-visible', visible ? '1' : '0');
    }

    _applyBottomVisible(visible) {
        document.getElementById('ide-bottom-panel')?.classList.toggle('panel-hidden', !visible);
        document.getElementById('bottom-resizer')?.classList.toggle('panel-hidden', !visible);
        this.#root.style.setProperty('--bottom-panel-visible', visible ? '1' : '0');
    }

    _startDrag(e, which) {
        this.#dragging = { which, startX: e.clientX, startY: e.clientY,
            startW: store.get('leftPanelWidth'),
            startH: store.get('bottomPanelHeight'),
        };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = which === 'left' ? 'col-resize' : 'row-resize';
        e.currentTarget.setPointerCapture(e.pointerId);
    }

    _onDrag(e) {
        if (!this.#dragging) return;
        const { which, startX, startY, startW, startH } = this.#dragging;
        if (which === 'left') {
            this._applyLeftWidth(startW + (e.clientX - startX));
        } else {
            this._applyBottomHeight(startH - (e.clientY - startY));
        }
    }

    _endDrag() {
        if (!this.#dragging) return;
        this.#dragging = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        // Persist
        localStorage.setItem('ide-left-width',    store.get('leftPanelWidth'));
        localStorage.setItem('ide-bottom-height', store.get('bottomPanelHeight'));
    }
}

export const panelManager = new PanelManager();
