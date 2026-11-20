import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import apiClient from "./client";
import { questsApi } from "./quests";
import { accessToken, enableSignIn, resetAuth, signInAs } from "@/test/auth";
import { questCard } from "@/test/questFixture";

/*
 * A guest's quest, as the browser calls the API (feature-register/quests/
 * CONTRACT.md §8): the addresses, what is sent, which token goes along (the
 * account's, or a registration's guest token, as the ticket's), and how a
 * refusal comes back. The API is a fake adapter on the real client.
 */
let seen;
const reply = (config, status, data, headers = {}) => {
  if (status < 400) return { data, status, statusText: "OK", headers, config };
  const error = new Error(`Request failed with status code ${status}`);
  error.config = config;
  error.response = { status, data, headers, config };
  throw error;
};

function serve(answer) {
  apiClient.defaults.adapter = vi.fn(async (config) => {
    seen.push({ method: config.method, url: config.url, params: config.params, auth: config.headers.Authorization, data: config.data ? JSON.parse(config.data) : undefined });
    return answer(config);
  });
}

beforeEach(() => {
  seen = [];
  resetAuth();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  localStorage.clear();
  resetAuth();
  delete apiClient.defaults.adapter;
  vi.restoreAllMocks();
});

describe("the card", () => {
  it("is read with the account's token, signed in", async () => {
    enableSignIn();
    signInAs({ access: accessToken() });
    serve((config) => reply(config, 200, questCard()));
    const card = await questsApi.card(77);
    expect(seen[0]).toMatchObject({ method: "get", url: "/api/v1/events/77/quest", auth: expect.stringMatching(/^Bearer /) });
    expect(card).toMatchObject({ title: "DevDays Quest", mode: "points", me: { points: 10 } });
  });

  it("goes with a registration's guest token, as the ticket does, and with none for a visitor", async () => {
    localStorage.setItem("access_token", "guest-a");
    serve((config) => reply(config, 200, questCard()));
    await questsApi.card(77);
    expect(seen[0].auth).toBe("Bearer guest-a");
    localStorage.clear();
    await questsApi.card(77);
    expect(seen[1].auth).toBeUndefined();
  });

  it("is null for a quest that's off, or an API without quests; a problem is thrown", async () => {
    serve((config) => reply(config, 200, { enabled: false }));
    expect(await questsApi.card(77)).toBeNull();
    serve((config) => reply(config, 404, { detail: "Not Found" }));
    expect(await questsApi.card(77)).toBeNull();
    serve((config) => reply(config, 502, null));
    await expect(questsApi.card(77)).rejects.toMatchObject({ status: 502 });
    serve(() => {
      throw Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    });
    await expect(questsApi.card(77)).rejects.toMatchObject({ network: true });
  });
});

describe("a code", () => {
  it("is sent as typed, and the answer's card comes back parsed", async () => {
    serve((config) => reply(config, 200, { result: "DONE", task: { title: "Keynote secret word", points: 5 }, card: questCard() }));
    const a = await questsApi.code(77, " cloud 24 ");
    expect(seen[0]).toMatchObject({ method: "post", url: "/api/v1/events/77/quest/code", data: { code: " cloud 24 " } });
    expect(a.result).toBe("DONE");
    expect(a.task.title).toBe("Keynote secret word");
    expect(a.card.title).toBe("DevDays Quest");
  });

  it("comes back refused with the API's code and details", async () => {
    serve((config) => reply(config, 404, { message: "Wrong code", error_code: "QUEST_CODE_WRONG", errors: { left: 3 } }));
    await expect(questsApi.code(77, "x")).rejects.toMatchObject({ status: 404, code: "QUEST_CODE_WRONG", errors: { left: 3 } });
  });
});

describe("a size", () => {
  it("is sent by its label, and the claim comes back", async () => {
    serve((config) => reply(config, 200, { claim_id: "c-1", status: "reserved", needs_size: false, variant_label: "M", choices: [] }));
    const claim = await questsApi.size(77, "c-1", "M");
    expect(seen[0]).toMatchObject({ method: "post", url: "/api/v1/events/77/quest/claims/c-1/size", data: { variant_label: "M" } });
    expect(claim).toMatchObject({ id: "c-1", status: "reserved", size: "M" });
  });

  it("refused, says why; an answer that isn't a claim is a problem", async () => {
    serve((config) => reply(config, 409, { error_code: "QUEST_SIZE_GONE", errors: { choices: [{ label: "L", free: 2 }] } }));
    await expect(questsApi.size(77, "c-1", "M")).rejects.toMatchObject({ status: 409, code: "QUEST_SIZE_GONE" });
    serve((config) => reply(config, 200, { nope: true }));
    await expect(questsApi.size(77, "c-1", "M")).rejects.toMatchObject({ status: 502 });
  });
});

describe("the leaderboard", () => {
  it("asks for the top rows and reads them", async () => {
    serve((config) => reply(config, 200, { mode: "points", rows: [{ rank: 1, name: "Asha K.", score: 120, me: false }], me: { rank: 14, score: 40 } }));
    const b = await questsApi.leaderboard(77);
    expect(seen[0]).toMatchObject({ method: "get", url: "/api/v1/events/77/quest/leaderboard", params: { limit: 20 } });
    expect(b).toEqual({ rows: [{ rank: 1, name: "Asha K.", points: 120, me: false }], me: { rank: 14, points: 40 } });
  });
});
