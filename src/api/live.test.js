import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import apiClient from "./client";
import { liveApi, resetBannerForTests } from "./live";
import { liveKey } from "@/utils/live";

/**
 * The live room's calls (src/api/live.js): joining the quiz with this
 * browser's key, so joining again is the same player; and the event page's
 * strip, read from the API's small `banner` view — or from the room's feed
 * on an API from before it.
 */
let seen;
const reply = (config, status, data) => {
  if (status < 400) return { data, status, statusText: "OK", headers: {}, config };
  const error = new Error(`Request failed with status code ${status}`);
  error.config = config;
  error.response = { status, data, config };
  throw error;
};

function serve(answer) {
  apiClient.defaults.adapter = vi.fn(async (config) => {
    seen.push({ method: config.method, url: config.url, auth: config.headers.Authorization, key: config.headers["X-Live-Key"], data: config.data ? JSON.parse(config.data) : null });
    return answer(config);
  });
}

const strip = { event: { id: 68, status: "live" }, banner: null, poll: null, quiz: { live: true, title: "Quiz" }, qa: { open: true, has_questions: false } };
const feed = { event: { id: 68, status: "live" }, banner: null, updates: [], poll: null, questions: [], qa: { open: true }, quiz: { live: true, title: "Quiz" } };

beforeEach(() => {
  seen = [];
  resetBannerForTests();
});
afterEach(() => {
  localStorage.clear();
  delete apiClient.defaults.adapter;
  vi.restoreAllMocks();
});

describe("joining the quiz", () => {
  it("sends this browser's key, the same every time", async () => {
    serve((config) => reply(config, 201, { player_key: "secret", name: "Sneha" }));
    await liveApi.joinQuiz("483921", "Sneha");
    await liveApi.joinQuiz("483921", "Sneha");
    const key = liveKey();
    expect(seen.map((s) => s.data)).toEqual([
      { code: "483921", name: "Sneha", player_key: key },
      { code: "483921", name: "Sneha", player_key: key },
    ]);
    expect(seen[0].url).toBe("/api/v1/live/quiz/join");
  });
});

describe("the event page's strip", () => {
  it("reads the small banner view, as a visitor whoever is signed in", async () => {
    localStorage.setItem("access_token", "guest-token");
    serve((config) => reply(config, 200, strip));
    expect(await liveApi.fetchBanner(68)).toEqual(strip);
    expect(seen).toEqual([{ method: "get", url: "/api/v1/events/68/live/banner", auth: undefined, key: undefined, data: null }]);
  });

  it("falls back to the room's feed on an API from before it, and stays there", async () => {
    serve((config) => (config.url.endsWith("/banner") ? reply(config, 404, { message: "Not Found" }) : reply(config, 200, feed)));
    expect(await liveApi.fetchBanner(68)).toEqual(feed);
    expect(await liveApi.fetchBanner(68)).toEqual(feed);
    expect(seen.map((s) => s.url)).toEqual(["/api/v1/events/68/live/banner", "/api/v1/events/68/live", "/api/v1/events/68/live"]);
  });

  it("does not hide another refusal", async () => {
    serve((config) => reply(config, 500, { message: "Boom" }));
    await expect(liveApi.fetchBanner(68)).rejects.toMatchObject({ response: { status: 500 } });
    expect(seen).toHaveLength(1);
  });

  it("an event the room is not open for is a 404 both ways, and the strip is tried again next time", async () => {
    serve((config) => reply(config, 404, { message: "Event not found" }));
    await expect(liveApi.fetchBanner(68)).rejects.toMatchObject({ response: { status: 404 } });
    serve((config) => reply(config, 200, strip));
    expect(await liveApi.fetchBanner(68)).toEqual(strip);
    expect(seen.at(-1).url).toBe("/api/v1/events/68/live/banner");
  });
});

describe("this release's live room (X-Live-Version: 2)", () => {
  const record = () => {
    const calls = [];
    apiClient.defaults.adapter = vi.fn(async (config) => {
      calls.push({ method: config.method, url: config.url, version: config.headers["X-Live-Version"], player: config.headers["X-Live-Player"], data: config.data ? JSON.parse(config.data) : null });
      return reply(config, 200, { ok: true });
    });
    return calls;
  };

  it("says so on the feed, the play state, an answer, a poll answer and a join", async () => {
    const calls = record();
    await liveApi.fetchFeed(68);
    await liveApi.playState(68, "pk");
    await liveApi.answer(68, "pk", "a");
    await liveApi.respond(68, "p1", "Tea");
    await liveApi.joinQuiz("483921", "Sneha");
    expect(calls.map((c) => [c.url, c.version])).toEqual([
      ["/api/v1/events/68/live", "2"],
      ["/api/v1/events/68/live/quiz/play", "2"],
      ["/api/v1/events/68/live/quiz/answer", "2"],
      ["/api/v1/events/68/live/polls/p1/respond", "2"],
      ["/api/v1/live/quiz/join", "2"],
    ]);
    expect(calls[1].player).toBe("pk");
  });

  it("sends each question kind's own answer", async () => {
    const calls = record();
    await liveApi.answer(68, "pk", "b");
    await liveApi.answer(68, "pk", { option_key: "a" });
    await liveApi.answer(68, "pk", { option_keys: ["a", "c"] });
    await liveApi.answer(68, "pk", { text: "Sao Paulo" });
    await liveApi.answer(68, "pk", { order: ["c", "a", "d", "b"] });
    expect(calls.map((c) => c.data)).toEqual([{ option_key: "b" }, { option_key: "a" }, { option_keys: ["a", "c"] }, { text: "Sao Paulo" }, { order: ["c", "a", "d", "b"] }]);
  });

  it("sends a poll answer as the poll's kind takes it", async () => {
    const calls = record();
    await liveApi.respond(68, "p1", "Tea");
    await liveApi.respond(68, "p1", { values: ["Tea", "Juice"] });
    await liveApi.respond(68, "p1", { order: ["Juice", "Tea", "Coffee"] });
    await liveApi.respond(68, "p1", { value: "More chai", name: "Asha" });
    await liveApi.respond(68, "p1", { value: "More chai", name: "" });
    expect(calls.map((c) => c.data)).toEqual([{ value: "Tea" }, { values: ["Tea", "Juice"] }, { order: ["Juice", "Tea", "Coffee"] }, { value: "More chai", name: "Asha" }, { value: "More chai" }]);
  });

  it("joins with a team when the player picked one, and without when not", async () => {
    const calls = record();
    await liveApi.joinQuiz("483921", "Sneha", "red");
    await liveApi.joinQuiz("483921", "Sneha");
    const key = liveKey();
    expect(calls.map((c) => c.data)).toEqual([
      { code: "483921", name: "Sneha", player_key: key, team: "red" },
      { code: "483921", name: "Sneha", player_key: key },
    ]);
  });

  it("reads the public theme as a visitor, and takes an API without themes as none", async () => {
    localStorage.setItem("access_token", "guest-token");
    const wrapper = { custom: true, theme: { preset: "club" }, version: "a91c3f02" };
    serve((config) => reply(config, 200, wrapper));
    expect(await liveApi.fetchTheme(68)).toEqual(wrapper);
    expect(seen.at(-1)).toMatchObject({ url: "/api/v1/events/68/live/theme/public", auth: undefined });
    serve((config) => reply(config, 404, { message: "Not Found" }));
    expect(await liveApi.fetchTheme(68)).toBeNull();
    serve((config) => reply(config, 500, { message: "Boom" }));
    await expect(liveApi.fetchTheme(68)).rejects.toMatchObject({ response: { status: 500 } });
  });

  it("looks up the round behind a join code as a visitor, and takes an unknown code or an API without the lookup as none", async () => {
    localStorage.setItem("access_token", "guest-token");
    const found = { event_id: 68, quiz_id: "qz1", title: "Round 1", started: false, teams: { mode: "pick", score: "total", list: [] }, players: { names: "nickname", late_join: true } };
    const calls = [];
    apiClient.defaults.adapter = vi.fn(async (config) => {
      calls.push({ url: config.url, params: config.params, auth: config.headers.Authorization, version: config.headers["X-Live-Version"] });
      return reply(config, 200, found);
    });
    expect(await liveApi.lookupQuiz("483921")).toEqual(found);
    expect(calls).toEqual([{ url: "/api/v1/live/quiz/lookup", params: { code: "483921" }, auth: undefined, version: "2" }]);
    serve((config) => reply(config, 404, { message: "No quiz is running with that code." }));
    expect(await liveApi.lookupQuiz("000000")).toBeNull();
    serve((config) => reply(config, 500, { message: "Boom" }));
    await expect(liveApi.lookupQuiz("483921")).rejects.toMatchObject({ response: { status: 500 } });
  });
});
