import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeEventSource } from "@/test/eventsource";
import { API_BASE_URL } from "@/config";

vi.mock("@/api/live", () => ({ liveApi: { fetchFeed: vi.fn(), playState: vi.fn() } }));

const { liveApi } = await import("@/api/live");
const { subscribe, TIMING } = await import("./liveStream");

/*
 * The live room's stream (src/api/liveStream.js): snapshots into the same
 * state the poll fills, the last id on every reconnect, `gone`, and the poll
 * whenever there is no stream — with the waits the API asks for before the
 * stream is tried again.
 */

// Streams found off are remembered for the visit, by event: each test has its own.
let n = 1000;
const nextEvent = () => String(++n);

const feed = (more = {}) => ({ event: { id: 68 }, banner: null, updates: [], poll: null, questions: [], qa: { open: true }, quiz: null, ...more });
const answer = (status, headers = {}) => () => Promise.resolve(new Response(status === 200 ? "" : "{}", { status, headers }));

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const sources = () => FakeEventSource.instances;
const last = () => FakeEventSource.last;

let stops = [];
const follow = (view, params, handlers) => {
  const stop = subscribe(view, params, handlers);
  stops.push(stop);
  return stop;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  FakeEventSource.reset();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(answer(404, { "content-type": "application/json" })));
  // No jitter, unless a test asks for it.
  vi.spyOn(Math, "random").mockReturnValue(0);
  liveApi.fetchFeed.mockResolvedValue(feed());
  liveApi.playState.mockResolvedValue({ status: "live", name: "Sneha", score: 0 });
});

afterEach(() => {
  stops.forEach((stop) => stop());
  stops = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("snapshots", () => {
  it("opens the room's stream with the browser's key and hands every snapshot over, without polling", async () => {
    const id = nextEvent();
    const seen = [];
    follow("room", { eventId: id }, (body) => seen.push(body));
    expect(sources()).toHaveLength(1);
    const key = localStorage.getItem("moa.live.key");
    expect(key).toBeTruthy();
    expect(last().url).toBe(`${API_BASE_URL}/api/v1/events/${id}/live/stream?view=room&key=${key}`);

    last().snapshot(feed({ banner: { text: "Doors at 6" } }), 11);
    last().snapshot(feed({ banner: { text: "Doors at 7" } }), 12);
    expect(seen.map((f) => f.banner.text)).toEqual(["Doors at 6", "Doors at 7"]);

    for (let i = 0; i < 4; i++) {
      await tick(15000);
      last().ping();
    }
    expect(liveApi.fetchFeed).not.toHaveBeenCalled();
    expect(sources()).toHaveLength(1);
  });

  it("opens the quiz's stream with the player's key", () => {
    const id = nextEvent();
    const seen = [];
    follow("quiz", { eventId: id, player: "secret-key" }, (s) => seen.push(s));
    expect(last().query.get("view")).toBe("quiz");
    expect(last().query.get("player")).toBe("secret-key");
    expect(last().query.has("key")).toBe(false);
    last().snapshot({ status: "live", name: "Sneha", score: 930 }, 3);
    expect(seen).toEqual([{ status: "live", name: "Sneha", score: 930 }]);
    expect(liveApi.playState).not.toHaveBeenCalled();
  });

  it("ignores a frame it cannot read, and keeps the stream", () => {
    const id = nextEvent();
    const seen = [];
    follow("room", { eventId: id }, (body) => seen.push(body));
    last().emit("snapshot", "{not json", "4");
    last().snapshot(feed(), 5);
    expect(seen).toHaveLength(1);
    expect(sources()).toHaveLength(1);
  });
});

describe("one source per view", () => {
  it("shares a view's stream; a later subscriber gets the latest body at once; the last one out closes it", () => {
    const id = nextEvent();
    const a = [];
    const b = [];
    const stopA = follow("room", { eventId: id }, (f) => a.push(f));
    last().snapshot(feed({ banner: { text: "one" } }), 1);
    const stopB = follow("room", { eventId: id, interval: 30000 }, (f) => b.push(f));
    expect(sources()).toHaveLength(1);
    expect(b.map((f) => f.banner.text)).toEqual(["one"]);

    last().snapshot(feed({ banner: { text: "two" } }), 2);
    expect(a.map((f) => f.banner.text)).toEqual(["one", "two"]);
    expect(b.map((f) => f.banner.text)).toEqual(["one", "two"]);

    // Another event, or the quiz, is another stream.
    follow("room", { eventId: nextEvent() }, () => {});
    follow("quiz", { eventId: id, player: "pk" }, () => {});
    expect(sources()).toHaveLength(3);

    stopA();
    expect(sources()[0].closed).toBe(false);
    stopB();
    expect(sources()[0].closed).toBe(true);
  });

  it("polls at the shortest interval its subscribers asked for", async () => {
    const id = nextEvent();
    follow("room", { eventId: id, interval: 30000 }, () => {});
    last().refuse();
    await tick();
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(1);
    await tick(29999);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(2);
    const stop = follow("room", { eventId: id }, () => {});
    await tick(5000);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(3);
    stop();
    await tick(5000);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(3);
  });
});

describe("reconnecting", () => {
  it("reconnects after `retry` with the last id; a ping then means nothing changed", async () => {
    const id = nextEvent();
    const seen = [];
    follow("room", { eventId: id }, (f) => seen.push(f));
    last().snapshot(feed(), 41);
    const first = last();
    first.drop();
    expect(first.closed).toBe(true);
    await tick(TIMING.retry - 1);
    expect(sources()).toHaveLength(1);
    await tick(1);
    expect(sources()).toHaveLength(2);
    expect(last().query.get("last_event_id")).toBe("41");
    expect(last().query.get("key")).toBe(localStorage.getItem("moa.live.key"));
    last().ping();
    expect(seen).toHaveLength(1);
    last().snapshot(feed({ banner: { text: "new" } }), 42);
    last().drop();
    await tick(TIMING.retry);
    expect(last().query.get("last_event_id")).toBe("42");
  });

  it("adds up to as much again at random to every wait", async () => {
    Math.random.mockReturnValue(0.5);
    follow("room", { eventId: nextEvent() }, () => {});
    last().snapshot(feed(), 1);
    last().drop();
    await tick(TIMING.retry * 1.5 - 1);
    expect(sources()).toHaveLength(1);
    await tick(1);
    expect(sources()).toHaveLength(2);
  });

  it("counts an open that says nothing in 20 s as failed, and reconnects after 45 s of silence", async () => {
    follow("room", { eventId: nextEvent() }, () => {});
    await tick(TIMING.openTimeout - 1);
    expect(sources()[0].closed).toBe(false);
    await tick(1);
    expect(sources()[0].closed).toBe(true);
    await tick(TIMING.retry);
    expect(sources()).toHaveLength(2);

    last().snapshot(feed(), 9);
    await tick(TIMING.idleTimeout - 1);
    expect(sources()[1].closed).toBe(false);
    await tick(1);
    expect(sources()[1].closed).toBe(true);
    await tick(TIMING.retry);
    expect(sources()).toHaveLength(3);
    expect(last().query.get("last_event_id")).toBe("9");
  });

  it("lets the poll fill an empty page when the stream says nothing for 2 s, and stands it down when the stream speaks", async () => {
    const seen = [];
    follow("room", { eventId: nextEvent() }, (f) => seen.push(f));
    await tick(TIMING.firstPaint - 1);
    expect(liveApi.fetchFeed).not.toHaveBeenCalled();
    await tick(1);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(2);
    expect(seen).toHaveLength(2);
    last().snapshot(feed({ banner: { text: "pushed" } }), 1);
    await tick(15000);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(2);
    expect(seen.at(-1).banner.text).toBe("pushed");
  });

  it("drops a poll that set out before a snapshot came", async () => {
    let resolve;
    liveApi.fetchFeed.mockReturnValue(new Promise((r) => (resolve = r)));
    const seen = [];
    follow("room", { eventId: nextEvent() }, (f) => seen.push(f));
    await tick(TIMING.firstPaint);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(1);
    last().snapshot(feed({ banner: { text: "stream" } }), 2);
    resolve(feed({ banner: { text: "older poll" } }));
    await tick();
    expect(seen.map((f) => f.banner.text)).toEqual(["stream"]);
  });
});

describe("gone", () => {
  it("is never reopened; one poll confirms, and its refusal reaches the page", async () => {
    const id = nextEvent();
    liveApi.playState.mockRejectedValue({ response: { status: 401 } });
    const seen = [];
    const errors = [];
    follow("quiz", { eventId: id, player: "pk" }, { snapshot: (s) => seen.push(s), error: (e) => errors.push(e.response.status) });
    last().snapshot({ status: "live", name: "Sneha" }, 3);
    last().gone(401, "You are not in this quiz.");
    expect(last().closed).toBe(true);
    await tick();
    expect(liveApi.playState).toHaveBeenCalledWith(id, "pk");
    expect(errors).toEqual([401]);
    await tick(TIMING.afterOff * 2);
    expect(sources()).toHaveLength(1);
  });

  it("goes on with the poll for the room, as the page did before", async () => {
    const id = nextEvent();
    follow("room", { eventId: id }, () => {});
    last().snapshot(feed(), 3);
    last().gone(404, "Event not found");
    await tick();
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(2);
    expect(sources()).toHaveLength(1);
  });
});

describe("falling back to the poll", () => {
  it("404 (today's API): asks once what the answer was, polls every 5 s, tries once more after 10 minutes, then not again", async () => {
    const id = nextEvent();
    const seen = [];
    follow("room", { eventId: id }, (f) => seen.push(f));
    const url = last().url;
    last().refuse();
    await tick();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ headers: { Accept: "text/event-stream" } }));
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([feed()]);
    await tick(5000);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(2);

    await tick(TIMING.afterOff - 5001);
    expect(sources()).toHaveLength(1);
    await tick(1);
    expect(sources()).toHaveLength(2);
    last().refuse();
    await tick();
    await tick(60 * 60 * 1000);
    expect(sources()).toHaveLength(2);
    // Polled all along, every 5 s.
    expect(liveApi.fetchFeed.mock.calls.length).toBeGreaterThanOrEqual((TIMING.afterOff + 60 * 60 * 1000) / 5000);
  });

  it("remembers for the visit that the stream is off: the next page of the same room polls without asking", async () => {
    const id = nextEvent();
    const stop = follow("room", { eventId: id }, () => {});
    last().refuse();
    await tick();
    stop();
    follow("room", { eventId: id }, () => {});
    expect(sources()).toHaveLength(1);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(2);
  });

  it("405, 501, 422 and a 2xx that is not a stream count as off", async () => {
    for (const [status, type] of [
      [405, "application/json"],
      [501, "application/json"],
      [422, "application/json"],
      [200, "application/json"],
    ]) {
      fetch.mockImplementation(answer(status, { "content-type": type }));
      const before = sources().length;
      const stop = follow("room", { eventId: nextEvent() }, () => {});
      last().refuse();
      await tick();
      await tick(TIMING.afterOff - 1);
      expect(sources()).toHaveLength(before + 1);
      await tick(1);
      expect(sources()).toHaveLength(before + 2);
      stop();
    }
  });

  it("503 LIVE_STREAM_FULL: polls, and tries again after Retry-After, not before", async () => {
    fetch.mockImplementation(answer(503, { "content-type": "application/json", "retry-after": "120" }));
    follow("room", { eventId: nextEvent() }, () => {});
    last().refuse();
    await tick();
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(1);
    await tick(120000 - 1);
    expect(sources()).toHaveLength(1);
    await tick(1);
    expect(sources()).toHaveLength(2);
    // The stream is back: the poll stands down.
    last().snapshot(feed(), 1);
    const polled = liveApi.fetchFeed.mock.calls.length;
    await tick(20000);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(polled);
  });

  it("503 or 429 without a Retry-After the browser can read: 60 s", async () => {
    for (const status of [503, 429]) {
      fetch.mockImplementation(answer(status, { "content-type": "application/json" }));
      const before = sources().length;
      const stop = follow("room", { eventId: nextEvent() }, () => {});
      last().refuse();
      await tick();
      await tick(TIMING.afterFull - 1);
      expect(sources()).toHaveLength(before + 1);
      await tick(1);
      expect(sources()).toHaveLength(before + 2);
      stop();
    }
  });

  it("three failed attempts in a row: waits 3 s, then 6 s; then polls and tries again after 5 minutes", async () => {
    follow("room", { eventId: nextEvent() }, () => {});
    last().drop();
    await tick(TIMING.retry);
    expect(sources()).toHaveLength(2);
    last().drop();
    await tick(TIMING.retry * 2 - 1);
    expect(sources()).toHaveLength(2);
    await tick(1);
    expect(sources()).toHaveLength(3);
    last().drop();
    // Polling now (it had filled in while the page was empty), every 5 s until the stream is back.
    const polled = liveApi.fetchFeed.mock.calls.length;
    await tick(5000);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(polled + 1);
    await tick(TIMING.afterFailures - 5001);
    expect(sources()).toHaveLength(3);
    await tick(1);
    expect(sources()).toHaveLength(4);
    // The count starts again.
    last().drop();
    await tick(TIMING.retry);
    expect(sources()).toHaveLength(5);
  });

  it("a 5xx is a failed attempt; a network error polls for 5 minutes", async () => {
    fetch.mockImplementation(answer(502));
    follow("room", { eventId: nextEvent() }, () => {});
    last().refuse();
    await tick();
    await tick(TIMING.retry);
    expect(sources()).toHaveLength(2);

    fetch.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    last().refuse();
    await tick();
    expect(liveApi.fetchFeed).toHaveBeenCalled();
    await tick(TIMING.afterFailures - 1);
    expect(sources()).toHaveLength(2);
    await tick(1);
    expect(sources()).toHaveLength(3);
  });

  it("401 on open: the poll at once (the page handles its refusal), then the stream again after the back-off", async () => {
    fetch.mockImplementation(answer(401, { "content-type": "application/json" }));
    liveApi.playState.mockRejectedValue({ response: { status: 401 } });
    const errors = [];
    follow("quiz", { eventId: nextEvent(), player: "old" }, { snapshot: () => {}, error: (e) => errors.push(e.response.status) });
    last().refuse();
    await tick();
    expect(errors).toEqual([401]);
    await tick(TIMING.retry);
    expect(sources()).toHaveLength(2);
  });
});

describe("closing", () => {
  it("closes the stream, the poll and every wait when the last subscriber leaves", async () => {
    const stop = follow("room", { eventId: nextEvent() }, () => {});
    const es = last();
    stop();
    expect(es.closed).toBe(true);
    await tick(60 * 60 * 1000);
    expect(sources()).toHaveLength(1);
    expect(liveApi.fetchFeed).not.toHaveBeenCalled();

    const stop2 = follow("room", { eventId: nextEvent() }, () => {});
    last().refuse();
    await tick();
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(1);
    stop2();
    await tick(60 * 60 * 1000);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(1);
    expect(sources()).toHaveLength(2);
  });

  it("closes when the page has been hidden 30 s, and reopens with the last id when it is shown", async () => {
    let state = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => state);
    const set = (s) => {
      state = s;
      document.dispatchEvent(new Event("visibilitychange"));
    };
    follow("room", { eventId: nextEvent() }, () => {});
    last().snapshot(feed(), 7);

    // A glance away keeps the stream.
    set("hidden");
    await tick(10000);
    set("visible");
    await tick(TIMING.hiddenGrace);
    expect(sources()).toHaveLength(1);
    expect(last().closed).toBe(false);
    last().ping();

    set("hidden");
    await tick(TIMING.hiddenGrace - 1);
    expect(last().closed).toBe(false);
    await tick(1);
    expect(last().closed).toBe(true);
    await tick(10 * 60 * 1000);
    expect(sources()).toHaveLength(1);
    expect(liveApi.fetchFeed).not.toHaveBeenCalled();

    set("visible");
    expect(sources()).toHaveLength(2);
    expect(last().query.get("last_event_id")).toBe("7");
  });

  it("closes on pagehide at once, and reopens on pageshow", () => {
    follow("room", { eventId: nextEvent() }, () => {});
    last().snapshot(feed(), 8);
    window.dispatchEvent(new Event("pagehide"));
    expect(last().closed).toBe(true);
    window.dispatchEvent(new Event("pageshow"));
    expect(sources()).toHaveLength(2);
    expect(last().query.get("last_event_id")).toBe("8");
  });
});

describe("no stream at all", () => {
  it("never for bots: the poll, as before", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("WhatsApp/2.23.20.0 A");
    follow("room", { eventId: nextEvent() }, () => {});
    expect(sources()).toHaveLength(0);
    await tick();
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(2);
  });

  it("without EventSource: the poll, as before", async () => {
    vi.stubGlobal("EventSource", undefined);
    follow("quiz", { eventId: nextEvent(), player: "pk" }, () => {});
    await tick();
    expect(liveApi.playState).toHaveBeenCalledTimes(1);
    await tick(2000);
    expect(liveApi.playState).toHaveBeenCalledTimes(2);
  });
});
