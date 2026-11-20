import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import apiClient from "./client";
import { postersApi } from "./posters";
import { accessToken, enableSignIn, resetAuth, signInAs } from "@/test/auth";

/*
 * A guest's poster, as the browser calls the API (feature-register/posters/
 * CONTRACT.md §6): the address, what is sent, which credential goes along
 * (the link's key, or the holder's token), and how a refusal comes back.
 * The API is a fake adapter on the real client: nothing leaves the test.
 */
const T = "MOA-1A2B3-XY7QZ";
const KEY = "3f9a0c1d2e3f4a5b6c7d8e9f0a1b2c3d";
const BODY = (over = {}) => ({
  available: true,
  reason: null,
  key: KEY,
  event: { id: 1, name: "DevFest 2026", slug: "devfest-2026-dd9e17", starts_at: "2026-11-28T08:30:00+05:30", ends_at: "2026-11-28T17:00:00+05:30", url: "https://myotherapp.in/events/devfest-2026-dd9e17" },
  guest: { name: "Asha Nair", first_name: "Asha", initials: "AN", role: "attendee", role_label: "Attendee" },
  moment: { key: "before", phrase: "I'm attending", caption: "I'm attending DevFest 2026! Join me: https://api.myotherapp.in/l/x7k2m9pq" },
  share_url: "https://api.myotherapp.in/l/x7k2m9pq",
  photo: null,
  formats: [
    {
      key: "square",
      width: 1080,
      height: 1080,
      variant: "default",
      frame: { x: 140, y: 180, width: 800, height: 800, radius: [400, 400, 400, 400] },
      framing: { zoom: 1, x: 0.5, y: 0.45 },
      render: { status: "none" },
    },
  ],
  limits: { renders_per_hour: 30, photos_per_hour: 10 },
  ...over,
});

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
    const isForm = typeof FormData !== "undefined" && config.data instanceof FormData;
    seen.push({
      method: config.method,
      url: config.url,
      params: config.params,
      auth: config.headers.Authorization,
      responseType: config.responseType,
      data: isForm ? config.data : config.data ? JSON.parse(config.data) : undefined,
    });
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

describe("reading a poster", () => {
  it("goes with the holder's token when there is no key", async () => {
    enableSignIn();
    signInAs({ access: accessToken() });
    serve((config) => reply(config, 200, BODY()));
    const p = await postersApi.read(T);
    expect(seen[0]).toMatchObject({ method: "get", url: `/api/v1/posters/${T}`, auth: expect.stringMatching(/^Bearer /) });
    expect(seen[0].params).toBeUndefined();
    expect(p).toMatchObject({ available: true, key: KEY, guest: { initials: "AN" }, formats: [{ key: "square" }] });
  });

  it("goes with the link's key and nothing else, even signed in", async () => {
    enableSignIn();
    signInAs({ access: accessToken() });
    serve((config) => reply(config, 200, BODY()));
    await postersApi.read(T, KEY);
    expect(seen[0]).toMatchObject({ url: `/api/v1/posters/${T}`, params: { s: KEY }, auth: undefined });
  });

  it("goes with a registration's guest token, as the ticket does", async () => {
    localStorage.setItem("access_token", "guest-a");
    serve((config) => reply(config, 200, BODY()));
    await postersApi.read(T);
    expect(seen[0].auth).toBe("Bearer guest-a");
  });

  it("says a refusal with its status and code", async () => {
    serve((config) => reply(config, 403, { message: "Not yours", error_code: "POSTER_FORBIDDEN" }));
    await expect(postersApi.read(T, KEY)).rejects.toMatchObject({ status: 403, code: "POSTER_FORBIDDEN" });
    serve((config) => reply(config, 200, { nonsense: true }));
    await expect(postersApi.read(T, KEY)).rejects.toMatchObject({ status: 502 });
  });

  it("for the ticket's button: the answer, or null for anything else, never a throw", async () => {
    serve((config) => reply(config, 200, { available: false, reason: "off" }));
    expect(await postersApi.availability(T)).toEqual({ available: false, reason: "off", event: null, guest: null });
    serve((config) => reply(config, 404, { detail: "Not Found" }));
    expect(await postersApi.availability(T)).toBeNull();
    serve(() => {
      throw Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    });
    expect(await postersApi.availability(T)).toBeNull();
  });
});

describe("the photo", () => {
  it("is sent as multipart `file`, with the key", async () => {
    serve((config) => reply(config, 200, BODY({ photo: { width: 1600, height: 2000, uploaded_at: "2026-11-22T10:01:00+05:30" } })));
    const blob = new Blob([new Uint8Array(10)], { type: "image/jpeg" });
    const p = await postersApi.upload(T, KEY, blob, "photo.jpg");
    expect(seen[0]).toMatchObject({ method: "post", url: `/api/v1/posters/${T}/photo`, params: { s: KEY }, auth: undefined });
    const file = seen[0].data.get("file");
    expect(file).toBeInstanceOf(Blob);
    expect(file.name).toBe("photo.jpg");
    expect(file.size).toBe(10);
    expect(p.photo).toEqual({ width: 1600, height: 2000, uploadedAt: "2026-11-22T10:01:00+05:30" });
  });

  it("is read back as a blob, and removed with a DELETE", async () => {
    serve((config) => reply(config, 200, config.method === "get" ? new Blob(["jpeg"], { type: "image/jpeg" }) : BODY()));
    const b = await postersApi.photo(T, KEY);
    expect(b.type).toBe("image/jpeg");
    expect(seen[0]).toMatchObject({ method: "get", url: `/api/v1/posters/${T}/photo`, params: { s: KEY }, responseType: "blob" });
    const p = await postersApi.removePhoto(T, KEY);
    expect(seen[1]).toMatchObject({ method: "delete", url: `/api/v1/posters/${T}/photo`, params: { s: KEY } });
    expect(p.photo).toBeNull();
  });

  it("says why an upload was refused", async () => {
    serve((config) => reply(config, 413, { message: "Too large" }));
    await expect(postersApi.upload(T, KEY, new Blob(["x"]), "a.jpg")).rejects.toMatchObject({ status: 413 });
    serve((config) => reply(config, 429, { message: "Slow down", error_code: "RATE_LIMITED", errors: { retry_after: 600 } }));
    await expect(postersApi.upload(T, KEY, new Blob(["x"]), "a.jpg")).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED", errors: { retry_after: 600 } });
  });
});

describe("framing and drawing", () => {
  it("keeps the framing as the API takes it: zoom, and the point at the frame's centre", async () => {
    serve((config) => reply(config, 200, BODY()));
    await postersApi.frame(T, KEY, { zoom: 1.35, cx: 0.52, cy: 0.4 });
    expect(seen[0]).toMatchObject({ method: "put", url: `/api/v1/posters/${T}/framing`, params: { s: KEY }, data: { zoom: 1.35, x: 0.52, y: 0.4 } });
    await postersApi.frame(T, KEY, { zoom: 9, cx: -1, cy: 0.5 }, "story");
    expect(seen[1].data).toEqual({ format: "story", zoom: 5, x: 0, y: 0.5 });
  });

  it("asks for a render and polls it, with the status it came with", async () => {
    serve((config) => {
      if (config.method === "post") return reply(config, 202, { status: "rendering", format: "story", fingerprint: "fp1", retry_after_ms: 1500, caption: "Hi" });
      return reply(config, 200, { status: "ready", format: "story", fingerprint: "fp1", image_url: "https://api.myotherapp.in/x", caption: "Hi" });
    });
    expect(await postersApi.render(T, KEY, "story")).toEqual({ status: "rendering", fingerprint: "fp1", retryAfterMs: 1500, caption: "Hi", http: 202 });
    expect(seen[0]).toMatchObject({ method: "post", url: `/api/v1/posters/${T}/render`, data: { format: "story" }, params: { s: KEY } });
    expect(await postersApi.renderStatus(T, KEY, "story")).toMatchObject({ status: "ready", fingerprint: "fp1", http: 200 });
    expect(seen[1]).toMatchObject({ method: "get", url: `/api/v1/posters/${T}/render/story` });
  });

  it("reads the PNG as a blob, by its fingerprint, from the API (never the address in the answer)", async () => {
    serve((config) => reply(config, 200, new Blob(["png"], { type: "image/png" })));
    const b = await postersApi.image(T, KEY, "square", "fp9");
    expect(b.type).toBe("image/png");
    expect(seen[0]).toMatchObject({ method: "get", url: `/api/v1/posters/${T}/image/square`, params: { v: "fp9", s: KEY }, responseType: "blob" });
  });

  it("refuses an empty picture", async () => {
    serve((config) => reply(config, 200, new Blob([])));
    await expect(postersApi.image(T, KEY, "square", "fp9")).rejects.toMatchObject({ status: 502 });
  });

  it("says when the drawing is busy", async () => {
    serve((config) => reply(config, 503, { message: "Try again in a moment.", error_code: "POSTER_RENDER_BUSY" }));
    await expect(postersApi.render(T, KEY, "square")).rejects.toMatchObject({ status: 503, code: "POSTER_RENDER_BUSY" });
  });
});

describe("what the guest did", () => {
  it("is noted, and a failure is nothing to the page", async () => {
    serve((config) => reply(config, 204, null));
    expect(await postersApi.note(T, KEY, "download", "square")).toBe(true);
    expect(seen[0]).toMatchObject({ method: "post", url: `/api/v1/posters/${T}/events`, data: { action: "download", format: "square" }, params: { s: KEY } });
    serve((config) => reply(config, 500, null));
    expect(await postersApi.note(T, KEY, "share")).toBe(false);
  });
});
