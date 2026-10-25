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
