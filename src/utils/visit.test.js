import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn(() => Promise.resolve({ status: 204 }));
vi.mock("@/api/client", () => ({ default: { post, get: vi.fn() } }));

const { countVisit } = await import("@/utils/visit");

describe("a visit to a club's site", () => {
  beforeEach(() => post.mockClear());

  it("is sent as plain text with the code, the short-link mark and the page before", () => {
    Object.defineProperty(document, "referrer", { value: "https://www.instagram.com/", configurable: true });
    countVisit("circuit-society", new URLSearchParams("?ref=x7k2m9pq&via=l&utm_source=instagram"));
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe("/api/v1/sites/circuit-society/visit");
    expect(JSON.parse(body)).toEqual({ ref: "x7k2m9pq", via: "l", referrer: "https://www.instagram.com/" });
    expect(config).toMatchObject({ skipAuth: true, headers: { "Content-Type": "text/plain" } });
  });

  it("never throws when the count fails", async () => {
    post.mockImplementationOnce(() => Promise.reject(new Error("offline")));
    expect(() => countVisit("circuit-society", new URLSearchParams(""))).not.toThrow();
    await Promise.resolve();
  });
});
