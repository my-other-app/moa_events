import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom doesn't implement window.alert (and the api/ functions' tests run on plain Node, with no window).
if (typeof window !== 'undefined') window.alert = vi.fn();

// Node 25+'s experimental built-in `localStorage` global shadows jsdom's
// working implementation with a stub that isn't actually functional in this
// test environment — replace it with a plain in-memory implementation.
class MemoryStorage {
    #store = new Map();
    get length() {
        return this.#store.size;
    }
    clear() {
        this.#store.clear();
    }
    getItem(key) {
        return this.#store.has(key) ? this.#store.get(key) : null;
    }
    key(index) {
        return Array.from(this.#store.keys())[index] ?? null;
    }
    removeItem(key) {
        this.#store.delete(key);
    }
    setItem(key, value) {
        this.#store.set(key, String(value));
    }
}

Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    writable: true,
});
