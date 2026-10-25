/**
 * The live room, pushed.
 *
 * The API can send a live view as server-sent events:
 *
 *   GET /api/v1/events/{id}/live/stream?view=room|quiz|banner
 *
 * Every `snapshot` is exactly the JSON body the view's poll returns right
 * now, for this browser (its own `voted` / `mine` / `my_response`; the
 * player's own score and answer), with a version as its `id`. A `ping` comes
 * after 15 quiet seconds; `gone` means the room (or this player) is not
 * there any more. So the stream is only a faster way to fill the state the
 * poll fills, and the poll stays as the fallback whenever there is no stream:
 *
 *   404 / 405 / 501 / 422, or a 2xx that is not a stream
 *              streams are off (today's API) or an older server: poll; try
 *              once more after 10 minutes, then poll for the rest of the visit
 *   503 / 429  too many streams: poll; try again after Retry-After (60 s)
 *   401 / 403  as the poll: poll at once (its refusal reaches the page, which
 *              does what it always did), and reconnect with the back-off
 *   gone       never reopened: the poll confirms, and the page does what the
 *              poll says
 *   a drop, an open that says nothing in 20 s, 45 s of silence, a 5xx
 *              reconnect after 3 s, 6 s, … (30 s at most, plus up to as much
 *              again at random, so a hall does not come back at once); three
 *              failed attempts in a row, or a network error: poll, and try
 *              the stream again after 5 minutes
 *
 * Whenever the stream has not spoken for a poll interval (the page has
 * nothing yet, or a reconnect is slow) the poll fills in, at its usual
 * interval, and stops as soon as the stream speaks again.
 *
 * One stream per view, event (and player) in the tab, shared by whoever
 * subscribes. It closes when the last subscriber leaves, on pagehide, and
 * when the page has been hidden for 30 s; it resumes with the last id when
 * the page is shown again. Never on the server (subscribers call this from
 * effects) and never for bots (src/seo/bots.js).
 *
 * A browser's EventSource cannot send headers, so the browser key, the
 * player key and the last id go in the query string, as the API allows for
 * it. It cannot read a refused answer either: when one closes the source,
 * the same address is asked once with fetch to learn the status.
 */
import { getSession, guestToken } from "@/auth/session";
import { API_BASE_URL } from "@/config";
import { isBot } from "@/seo/bots";
import { liveKey } from "@/utils/live";
import { liveApi } from "./live";

/**
 * Whether the room's calls go as a person (an account, or a registration's
 * guest token): the API then counts their votes and answers as that person,
 * and shows them as theirs. An EventSource cannot send the token, so its
 * snapshots would show the browser's own flags instead: such a visitor's room
 * is polled (each poll carries the token), never streamed.
 */
const asPerson = () => Boolean(getSession() || guestToken());

export const TIMING = Object.freeze({
  /** The stream's `retry:` (EventSource keeps the server's value to itself). */
  retry: 3000,
  maxDelay: 30 * 1000,
  maxFailures: 3,
  /** An open that sends no frame (snapshot or ping) in this long failed. */
  openTimeout: 20 * 1000,
  /** Three missed pings: the connection is dead. */
  idleTimeout: 45 * 1000,
  hiddenGrace: 30 * 1000,
  /** A page with nothing on it yet does not wait longer than this for the stream. */
  firstPaint: 2000,
  afterFailures: 5 * 60 * 1000,
  afterOff: 10 * 60 * 1000,
  /** When a 503 / 429 has no Retry-After the browser may read. */
  afterFull: 60 * 1000,
  probeTimeout: 10 * 1000,
});

/** Each view: its poll (the body the stream's snapshots carry), today's interval, its credentials, and whether it may stream. */
const VIEWS = {
  room: {
    interval: 5000,
    poll: ({ eventId }) => liveApi.fetchFeed(eventId),
    query: () => ({ key: liveKey() }),
    who: () => "",
    streamable: () => !asPerson(),
  },
  /** The event page's strip: the same for everyone, so no key. */
  banner: {
    interval: 30000,
    poll: ({ eventId }) => liveApi.fetchBanner(eventId),
    query: () => ({}),
    who: () => "",
  },
  quiz: {
    interval: 2000,
    poll: ({ eventId, player }) => liveApi.playState(eventId, player),
    query: ({ player }) => ({ player }),
    who: ({ player }) => player,
  },
};

const CLOSED = 2;

/** The open channels, one per view, event and player. */
const channels = new Map();

/** Channels whose stream was found off this visit: when to try again (Infinity: not again). */
const off = new Map();

const canStream = () => typeof window !== "undefined" && typeof EventSource === "function" && !isBot(globalThis.navigator?.userAgent);

/** `retry` for the first reconnect, doubled per failure in a row, at most 30 s, plus 0–100 % at random. */
const backoff = (failures) => {
  const base = Math.min(TIMING.retry * 2 ** Math.max(0, failures - 1), TIMING.maxDelay);
  return base + Math.random() * base;
};

/** Retry-After in seconds or as a date; never sooner than a reconnect would be. */
const retryAfter = (value) => {
  if (value == null || value === "") return TIMING.afterFull;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(ms) ? Math.max(ms, TIMING.retry) : TIMING.afterFull;
};

/** What the API answers at the stream's address: its status, and whether it is a stream. 0 for a network error. */
async function probe(url) {
  const abort = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => abort?.abort(), TIMING.probeTimeout);
  try {
    const res = await fetch(url, { headers: { Accept: "text/event-stream" }, cache: "no-store", signal: abort?.signal });
    const type = res.headers.get("content-type") || "";
    return { status: res.status, stream: type.startsWith("text/event-stream"), retryAfter: res.headers.get("retry-after") };
  } catch {
    return { status: 0 };
  } finally {
    clearTimeout(timer);
    // A stream that did open is not kept: the EventSource reconnects instead.
    abort?.abort();
  }
}

class Channel {
  constructor(key, view, spec, params) {
    this.key = key;
    this.view = view;
    this.spec = spec;
    this.params = params;
    this.subs = new Set();
    this.every = spec.interval;
    this.streams = canStream() && (spec.streamable ? spec.streamable() : true);
    this.body = undefined;
    this.lastId = null;
    this.es = null;
    this.live = false;
    this.gen = 0;
    this.pushes = 0;
    this.failures = 0;
    this.nextTry = 0;
    this.paused = false;
    this.closed = false;
    this.polling = null;
    this.timers = {};
  }

  /* ---------- subscribers ---------- */

  add(sub) {
    this.subs.add(sub);
    this.retime();
  }

  remove(sub) {
    this.subs.delete(sub);
    if (this.subs.size === 0) this.close();
    else this.retime();
  }

  deliver(body) {
    this.body = body;
    for (const sub of [...this.subs]) sub.snapshot?.(body);
  }

  fail(error) {
    for (const sub of [...this.subs]) sub.error?.(error);
  }

  /** The poll runs at the shortest interval any subscriber asked for. */
  retime() {
    const every = Math.min(...[...this.subs].map((s) => s.every));
    if (every === this.every) return;
    this.every = every;
    if (this.polling) {
      clearInterval(this.polling);
      this.polling = setInterval(() => this.read(), this.every);
    }
  }

  /* ---------- timers ---------- */

  later(name, ms, fn) {
    this.clear(name);
    this.timers[name] = setTimeout(() => {
      this.timers[name] = null;
      fn();
    }, ms);
  }

  clear(name) {
    if (this.timers[name]) clearTimeout(this.timers[name]);
    this.timers[name] = null;
  }

  /* ---------- life ---------- */

  start() {
    if (!this.streams) return this.poll();
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("pageshow", this.onPageShow);
    const known = off.get(this.key);
    if (known && known.until > Date.now()) {
      this.poll();
      if (Number.isFinite(known.until)) this.tryAt(known.until);
      else this.streams = false;
      return undefined;
    }
    return this.connect();
  }

  close() {
    this.closed = true;
    this.drop();
    this.stopPolling();
    for (const name of Object.keys(this.timers)) this.clear(name);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibility);
      window.removeEventListener("pagehide", this.onPageHide);
      window.removeEventListener("pageshow", this.onPageShow);
    }
    channels.delete(this.key);
  }

  /* ---------- the stream ---------- */

  url() {
    const q = new URLSearchParams({ view: this.view, ...this.spec.query(this.params) });
    if (this.lastId) q.set("last_event_id", this.lastId);
    return `${API_BASE_URL}/api/v1/events/${encodeURIComponent(this.params.eventId)}/live/stream?${q}`;
  }

  connect() {
    this.clear("wait");
    if (this.closed || !this.streams || this.paused) return;
    this.drop();
    const gen = this.gen;
    let es;
    try {
      es = new EventSource(this.url());
    } catch {
      this.streams = false;
      return this.poll();
    }
    this.es = es;
    es.addEventListener("snapshot", (e) => gen === this.gen && this.onSnapshot(e));
    es.addEventListener("ping", () => gen === this.gen && this.onFrame(false));
    es.addEventListener("gone", () => gen === this.gen && this.onGone());
    es.onerror = () => gen === this.gen && this.onError(es);
    this.later("dog", TIMING.openTimeout, () => this.lost(false));
    this.cover(this.body === undefined ? Math.min(TIMING.firstPaint, this.every) : this.every);
  }

  /** Closes the current source, if any; whatever it still says is ignored. */
  drop() {
    this.gen += 1;
    if (this.es) {
      this.es.onerror = null;
      this.es.close();
      this.es = null;
    }
    this.live = false;
    this.clear("dog");
  }

  onFrame(snapshot) {
    this.live = true;
    this.failures = 0;
    off.delete(this.key);
    this.later("dog", TIMING.idleTimeout, () => this.lost(true));
    // A ping before anything is on the page does not stand the poll down.
    if (snapshot || this.body !== undefined) {
      this.clear("stale");
      this.stopPolling();
    }
  }

  onSnapshot(e) {
    let body;
    try {
      body = JSON.parse(e.data);
    } catch {
      return this.onFrame(false);
    }
    if (e.lastEventId) this.lastId = e.lastEventId;
    this.onFrame(true);
    this.pushes += 1;
    return this.deliver(body);
  }

  /** The room, or this player, is not there any more: never reopened; the poll says what it says now. */
  onGone() {
    this.streams = false;
    this.drop();
    this.clear("wait");
    this.stopPolling();
    this.poll();
  }

  onError(es) {
    const wasLive = this.live;
    // CLOSED: the answer was not a stream (a refusal); otherwise it dropped.
    const refused = es.readyState === CLOSED;
    this.drop();
    if (!refused) return this.lost(wasLive);
    const gen = this.gen;
    return probe(es.url).then((answer) => {
      if (gen === this.gen && !this.closed) this.refused(answer);
    });
  }

  refused({ status, stream, retryAfter: after }) {
    if (status === 404 || status === 405 || status === 501 || status === 422 || (status >= 200 && status < 300 && !stream)) return this.off();
    if (status === 503 || status === 429) return this.fallBack(retryAfter(after));
    if (status === 401 || status === 403) {
      this.poll();
      return this.lost(false);
    }
    if (status === 0) return this.fallBack(TIMING.afterFailures);
    return this.lost(false);
  }

  /** No stream here: poll; once more after 10 minutes, and after that not this visit. */
  off() {
    const until = off.has(this.key) ? Infinity : Date.now() + TIMING.afterOff;
    off.set(this.key, { until });
    this.poll();
    if (Number.isFinite(until)) this.tryAt(until);
    else this.streams = false;
  }

  /** Poll, and try the stream again after `ms`. */
  fallBack(ms) {
    this.failures = 0;
    this.poll();
    this.tryAt(Date.now() + ms);
  }

  /** A connection ended: after a healthy one, reconnect; after the third failure in a row, poll for a while. */
  lost(wasLive) {
    this.drop();
    this.failures = wasLive ? 0 : this.failures + 1;
    if (this.failures >= TIMING.maxFailures) return this.fallBack(TIMING.afterFailures);
    this.tryAt(Date.now() + backoff(this.failures));
    return this.cover(this.every);
  }

  tryAt(when) {
    this.nextTry = when;
    if (this.paused) return undefined;
    if (when <= Date.now()) return this.connect();
    return this.later("wait", when - Date.now(), () => this.connect());
  }

  /* ---------- the poll ---------- */

  /** Unless the stream speaks within `ms`, the poll fills in. */
  cover(ms) {
    if (this.polling || this.timers.stale) return;
    this.later("stale", ms, () => {
      if (!this.live || this.body === undefined) this.poll();
    });
  }

  /** Polls now and at the interval, exactly as the page did before the stream. */
  poll() {
    this.clear("stale");
    if (this.polling || this.closed) return;
    this.read();
    this.polling = setInterval(() => this.read(), this.every);
  }

  stopPolling() {
    if (this.polling) clearInterval(this.polling);
    this.polling = null;
  }

  read() {
    // A poll that set out before a snapshot came is older than it: dropped.
    const pushes = this.pushes;
    let answer;
    try {
      answer = Promise.resolve(this.spec.poll(this.params));
    } catch (e) {
      answer = Promise.reject(e);
    }
    answer.then(
      (body) => !this.closed && pushes === this.pushes && this.deliver(body),
      (error) => !this.closed && pushes === this.pushes && this.fail(error)
    );
  }

  /* ---------- hidden pages ---------- */

  onVisibility = () => {
    if (document.visibilityState === "hidden") {
      if (!this.timers.hide) this.later("hide", TIMING.hiddenGrace, () => this.pause());
    } else {
      this.clear("hide");
      this.resume();
    }
  };

  onPageHide = () => {
    this.clear("hide");
    this.pause();
  };

  onPageShow = () => this.resume();

  pause() {
    if (this.paused || !this.streams) return;
    this.paused = true;
    this.drop();
    this.clear("wait");
    this.clear("stale");
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this.closed || !this.streams) return;
    this.tryAt(Math.max(this.nextTry, Date.now()));
  }
}

/**
 * Follows a live view: `handlers.snapshot(body)` with every body (from the
 * stream, or from the poll when there is none), `handlers.error(e)` with
 * every refused poll, as the page's own poll did. A function is taken as
 * `snapshot`. Returns the unsubscribe.
 *
 *   view     "room" or "banner" (params: eventId), or "quiz" (params: eventId, player)
 *   params   also `interval`: the poll's, when not the view's usual one
 *
 * Whoever subscribes to a view that is already open shares its stream, and
 * gets the latest body at once.
 */
export function subscribe(view, params, handlers) {
  const spec = VIEWS[view];
  if (!spec) throw new Error(`No live view "${view}"`);
  if (typeof window === "undefined") return () => {};
  const sub = typeof handlers === "function" ? { snapshot: handlers } : { ...handlers };
  sub.every = params.interval || spec.interval;
  const key = [view, params.eventId, spec.who(params)].join(":");
  let channel = channels.get(key);
  if (channel) {
    channel.add(sub);
    if (channel.body !== undefined) sub.snapshot?.(channel.body);
  } else {
    channel = new Channel(key, view, spec, params);
    channels.set(key, channel);
    channel.add(sub);
    channel.start();
  }
  return () => channel.remove(sub);
}
