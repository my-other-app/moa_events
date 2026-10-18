/**
 * A stand-in for the browser's EventSource (jsdom has none). Every source
 * opened is kept in `FakeEventSource.instances`, and a test says what the
 * server did:
 *
 *   es.snapshot(body, id)   an `event: snapshot` frame with that `id:`
 *   es.ping()               an `event: ping`
 *   es.gone(status)         an `event: gone`
 *   es.drop()               the connection broke (or the server ended it):
 *                           the browser would reconnect by itself
 *   es.refuse()             the answer was not a stream (a 404, a 503 …):
 *                           the browser gives the source up
 *
 *   vi.stubGlobal("EventSource", FakeEventSource);
 */
export class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances = [];

  static reset() {
    FakeEventSource.instances = [];
  }

  static get last() {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1];
  }

  /** The sources not closed. */
  static get open() {
    return FakeEventSource.instances.filter((s) => s.readyState !== FakeEventSource.CLOSED);
  }

  constructor(url) {
    this.url = url;
    this.readyState = FakeEventSource.CONNECTING;
    this.onerror = null;
    this.listeners = {};
    FakeEventSource.instances.push(this);
  }

  /** The address's query, to read `view`, `key`, `player` and `last_event_id`. */
  get query() {
    return new URL(this.url).searchParams;
  }

  get closed() {
    return this.readyState === FakeEventSource.CLOSED;
  }

  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  emit(type, data, id = "") {
    if (this.closed) return;
    this.readyState = FakeEventSource.OPEN;
    const event = { type, data: typeof data === "string" ? data : JSON.stringify(data), lastEventId: id };
    for (const fn of this.listeners[type] || []) fn(event);
  }

  snapshot(body, id) {
    this.emit("snapshot", body, String(id));
  }

  ping() {
    this.emit("ping", { t: Date.now() });
  }

  gone(status, message = "Gone") {
    this.emit("gone", { status, message });
  }

  drop() {
    if (this.closed) return;
    this.readyState = FakeEventSource.CONNECTING;
    this.onerror?.({ type: "error" });
  }

  refuse() {
    if (this.closed) return;
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.({ type: "error" });
  }
}
