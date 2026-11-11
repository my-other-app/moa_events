import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import apiClient from "./client";
import { leadsApi, supportApi } from "./support";
import { accessToken, enableSignIn, resetAuth, signInAs } from "@/test/auth";
import { storeGuestTokens } from "@/auth/session";

/*
 * The support desk and the sales intake as the browser calls them: the
 * address, what is sent, which token goes along, and what a server without
 * them (404) answers. A fake adapter on the real client: nothing leaves.
 */
let seen;
const reply = (config, status, data) => {
  if (status < 400) return { data, status, statusText: "OK", headers: {}, config };
  const error = new Error(`Request failed with status code ${status}`);
  error.config = config;
  error.response = { status, data, headers: {}, config };
  throw error;
};
function serve(answer) {
  apiClient.defaults.adapter = vi.fn(async (config) => {
    const isForm = typeof FormData !== "undefined" && config.data instanceof FormData;
    seen.push({
      method: config.method,
      url: config.url,
      auth: config.headers.Authorization,
      data: isForm ? config.data : config.data ? JSON.parse(config.data) : undefined,
      type: config.headers["Content-Type"],
    });
    return answer(config);
  });
}
const original = apiClient.defaults.adapter;

beforeEach(() => {
  seen = [];
  resetAuth();
});
afterEach(() => {
  apiClient.defaults.adapter = original;
  resetAuth();
});

describe("the support desk", () => {
  it("reads the answers and the topics with no token; null from a server without the desk", async () => {
    enableSignIn();
    signInAs({ access: accessToken() });
    serve((c) => (c.url.endsWith("/help") ? reply(c, 200, [{ id: 1, topic: "tickets", question: "Q?", answer: "A." }]) : reply(c, 404, { detail: "Not Found" })));
    expect(await supportApi.help()).toEqual([{ id: 1, topic: "tickets", question: "Q?", answer: "A." }]);
    expect(await supportApi.topics()).toBeNull();
    expect(seen.map((s) => [s.url, s.auth])).toEqual([
      ["/api/v1/support/help", undefined],
      ["/api/v1/support/topics", undefined],
    ]);
  });

  it("sends a guest's request without the guest token a registration left", async () => {
    storeGuestTokens({ access_token: "guest-token-1", refresh_token: "guest-refresh-1" });
    serve((c) => reply(c, 201, { id: 9, number: 1042, status: "new" }));
    const body = { topic: "tickets", message: "No ticket", name: "Asha", email: "asha@example.org", context: { platform: "web" } };
    expect(await supportApi.send(body)).toEqual({ id: 9, number: 1042, status: "new" });
    expect(seen[0]).toMatchObject({ method: "post", url: "/api/v1/support/requests", auth: undefined, data: body });
  });

  it("sends a signed-in person's request, list and replies with their token", async () => {
    enableSignIn();
    signInAs({ access: accessToken() });
    serve((c) => {
      if (c.url === "/api/v1/support/requests" && c.method === "get") return reply(c, 200, [{ id: 9, number: 1042, status: "open", unread: true }]);
      if (c.url === "/api/v1/support/requests/9") return reply(c, 200, { id: 9, number: 1042, status: "open", messages: [], can_reply: true });
      return reply(c, 201, { id: 1 });
    });
    expect((await supportApi.mine())[0]).toMatchObject({ id: 9, unread: true });
    expect((await supportApi.request(9)).canReply).toBe(true);
    await supportApi.reply(9, { message: "Thanks" });
    await supportApi.surveyMine(9, { solved: true });
    expect(seen.map((s) => s.auth)).toEqual(seen.map(() => expect.stringMatching(/^Bearer /)));
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      "get /api/v1/support/requests",
      "get /api/v1/support/requests/9",
      "post /api/v1/support/requests/9/replies",
      "post /api/v1/support/requests/9/survey",
    ]);
  });

  it("lists nothing (null) from a server without the desk, and throws a refusal's shape otherwise", async () => {
    enableSignIn();
    signInAs({ access: accessToken() });
    serve((c) => reply(c, 404, {}));
    expect(await supportApi.mine()).toBeNull();
    serve((c) => reply(c, 429, { message: "Slow down", track_id: "trk_1" }));
    await expect(supportApi.send({})).rejects.toMatchObject({ status: 429, trackId: "trk_1" });
  });

  it("uploads one file as multipart, and answers with its key", async () => {
    serve((c) => reply(c, 201, { key: "up/abc", name: "shot.png", size: 1200 }));
    const file = new File(["x"], "shot.png", { type: "image/png" });
    expect(await supportApi.upload(file)).toEqual({ key: "up/abc", name: "shot.png", size: 1200 });
    expect(seen[0].url).toBe("/api/v1/support/uploads");
    expect(seen[0].data).toBeInstanceOf(FormData);
    expect(seen[0].data.get("file")).toBeInstanceOf(File);
  });

  it("answers a survey link with the link's token alone", async () => {
    enableSignIn();
    signInAs({ access: accessToken() });
    serve((c) => reply(c, 200, { ok: true }));
    await supportApi.survey("tok-abcdefghijklmnop", { solved: false, comment: "Still broken" });
    expect(seen[0]).toMatchObject({ url: "/api/v1/support/survey/tok-abcdefghijklmnop", auth: undefined, data: { solved: false, comment: "Still broken" } });
  });
});

describe("Talk to us", () => {
  it("posts the lead with no token", async () => {
    enableSignIn();
    signInAs({ access: accessToken() });
    serve((c) => reply(c, 200, { ok: true }));
    expect(await leadsApi.talkToUs({ name: "Asha", email: "a@x.org", organisation: "Circuit Society", type: "club" })).toEqual({ ok: true });
    expect(seen[0]).toMatchObject({ method: "post", url: "/api/v1/leads/talk-to-us", auth: undefined });
  });

  it("refuses with a 404 shape while the API has no route", async () => {
    serve((c) => reply(c, 404, { detail: "Not Found" }));
    await expect(leadsApi.talkToUs({})).rejects.toMatchObject({ status: 404 });
  });
});
