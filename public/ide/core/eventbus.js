/**
 * EventBus — Synchronous pub/sub mediator.
 * Every module communicates exclusively through this bus.
 * No module should import another module directly.
 *
 * Usage:
 *   import { bus } from '../core/eventbus.js';
 *   bus.on('editor:change', ({ fileId, content }) => { ... });
 *   bus.emit('editor:change', { fileId, content });
 */

class EventBus {
    #listeners = new Map();

    /**
     * Subscribe to an event.
     * @param {string} event
     * @param {Function} handler
     * @returns {Function} Unsubscribe function
     */
    on(event, handler) {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, new Set());
        }
        this.#listeners.get(event).add(handler);
        return () => this.off(event, handler);
    }

    /**
     * Subscribe to an event exactly once.
     * @param {string} event
     * @param {Function} handler
     * @returns {Function} Unsubscribe function
     */
    once(event, handler) {
        const wrapper = (data) => {
            handler(data);
            this.off(event, wrapper);
        };
        return this.on(event, wrapper);
    }

    /**
     * Unsubscribe a specific handler from an event.
     * @param {string} event
     * @param {Function} handler
     */
    off(event, handler) {
        this.#listeners.get(event)?.delete(handler);
    }

    /**
     * Emit an event to all subscribers.
     * @param {string} event
     * @param {*} data
     */
    emit(event, data) {
        const handlers = this.#listeners.get(event);
        if (!handlers) return;
        for (const handler of handlers) {
            try {
                handler(data);
            } catch (err) {
                console.error(`[EventBus] Error in handler for "${event}":`, err);
            }
        }
    }

    /**
     * Remove all listeners for a given event (or all events).
     * @param {string} [event]
     */
    clear(event) {
        if (event) {
            this.#listeners.delete(event);
        } else {
            this.#listeners.clear();
        }
    }
}

export const bus = new EventBus();
