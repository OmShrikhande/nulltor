/**
 * ActivityBar — Left icon rail.
 * Toggles the left panel between: Explorer, Search, Run & Debug, Settings.
 * Each click either shows that view or collapses the panel if already active.
 */

import { bus } from '../../core/eventbus.js';
import { store } from '../../core/store.js';

const TABS = [
    { id: 'explorer', icon: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1Z"/></svg>`, label: 'Explorer' },
    { id: 'search',   icon: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.75.75 0 0 1-1.06 1.06l-3.04-3.04ZM6 11a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/></svg>`, label: 'Search' },
    { id: 'run',      icon: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.78 2.068a.75.75 0 0 0-1.03.704v10.456a.75.75 0 0 0 1.03.704l10.456-5.228a.75.75 0 0 0 0-1.408Z"/></svg>`, label: 'Run & Debug' },
    { id: 'debug',    icon: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM2.5 8a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0Zm4.75-2.25a.75.75 0 0 1 1.5 0v2.5a.75.75 0 0 1-1.5 0ZM8 11a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>`, label: 'Debug Console' },
    { id: 'settings', icon: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.039.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.012 8.012 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.08.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.08-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM8 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"/></svg>`, label: 'Settings' },
];

export class ActivityBar {
    #el;

    init() {
        this.#el = document.getElementById('activity-bar');
        if (!this.#el) return;
        this._render();
        store.subscribe('activeActivityTab', () => this._updateActive());
    }

    _render() {
        this.#el.innerHTML = `
            <div class="activity-tabs">
                ${TABS.map(t => `
                    <button class="activity-btn" id="act-${t.id}" data-tab="${t.id}" title="${t.label}">
                        ${t.icon}
                    </button>
                `).join('')}
            </div>
            <div class="activity-bottom">
                <button class="activity-btn" id="act-collab" title="Collaborators">
                    <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4.001 4.001 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.49 3.49 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-1.434.42 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 .416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 1 11 4Zm-5.5-.5a2 2 0 1 0-.001 3.999A2 2 0 0 0 5.5 3.5Z"/></svg>
                    <span class="activity-peer-count" id="activity-peer-count">0</span>
                </button>
            </div>
        `;

        // Tab clicks
        this.#el.querySelectorAll('.activity-btn[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                const current = store.get('activeActivityTab');
                if (current === tab && store.get('leftPanelVisible')) {
                    bus.emit('panel:toggle-left', {});
                } else {
                    store.set('activeActivityTab', tab);
                    if (!store.get('leftPanelVisible')) bus.emit('panel:toggle-left', {});
                }
                bus.emit('activity:tab-change', { tab });
            });
        });

        this._updateActive();

        // Peer count badge
        store.subscribe('peers', (peers) => {
            const badge = document.getElementById('activity-peer-count');
            if (badge) badge.textContent = (peers?.length ?? 0);
        });
    }

    _updateActive() {
        const active = store.get('activeActivityTab');
        this.#el.querySelectorAll('.activity-btn[data-tab]').forEach(btn => {
            btn.classList.toggle('activity-btn-active', btn.dataset.tab === active);
        });
    }
}

export const activityBar = new ActivityBar();
