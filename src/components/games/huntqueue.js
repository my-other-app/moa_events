/*
 * Hunt scans on bad Wi-Fi: a scan is written to storage first ("Saved,
 * sending..."), then sent; it stays until the server has answered it. A
 * network error or a 5xx keeps it and tries again (after `retryMs`, and when
 * the browser says it is back online); any other answer ends it, good or
 * refused, and is handed to `onResult`. Scans go one at a time, in order.
 * The phone never scores: the answer is the server's.
 */
export const RETRY_MS = 5000;

const qkey = (eventId) => `moa.game.queue.${eventId}`;

export function createQueue({ eventId, send, onResult, onChange = () => {}, storage = globalThis.localStorage, retryMs = RETRY_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let items = [];
  let busy = false;
  let timer = null;
  let stopped = false;

  const save = () => {
    try {
      storage.setItem(qkey(eventId), JSON.stringify(items));
    } catch {
      /* kept in memory */
    }
  };
  try {
    const raw = storage.getItem(qkey(eventId));
    const v = raw ? JSON.parse(raw) : [];
    items = Array.isArray(v) ? v.filter((i) => i && typeof i.code === "string") : [];
  } catch {
    items = [];
  }

  const retryable = (f) => !f || f.network === true || f.status === 0 || f.status >= 500;

  async function pump() {
    if (busy || stopped || items.length === 0) return;
    busy = true;
    clearTimer(timer);
    timer = null;
    const item = items[0];
    try {
      const result = await send(item.code);
      items = items.slice(1);
      save();
      onChange(items.length);
      onResult({ ok: true, code: item.code, result });
    } catch (f) {
      if (retryable(f)) {
        if (!stopped) timer = setTimer(pump, retryMs);
      } else {
        items = items.slice(1);
        save();
        onChange(items.length);
        onResult({ ok: false, code: item.code, failure: f });
      }
    }
    busy = false;
    if (items.length > 0 && !timer && !stopped) pump();
  }

  return {
    /** Saves the scan and starts sending it. The same code twice in a row is one scan. */
    add(code) {
      if (items.some((i) => i.code === code)) return;
      items = [...items, { code, at: Date.now() }];
      save();
      onChange(items.length);
      pump();
    },
    /** Sends what is waiting now (a page opening, the browser coming back online). */
    flush: pump,
    pending: () => items.length,
    stop() {
      stopped = true;
      clearTimer(timer);
    },
  };
}
