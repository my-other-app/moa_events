// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/next";
import { ApiError, apiGet, apiUrl, serverApiBase } from "./api";

afterEach(() => vi.unstubAllEnvs());

describe("reading the API on the server", () => {
  it("asks API_BASE_URL (else the public one, else production) through Next's data cache", async () => {
    expect(serverApiBase()).toBe("https://api.myotherapp.in");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://public.example/");
    expect(serverApiBase()).toBe("https://public.example");
    vi.stubEnv("API_BASE_URL", "http://internal:8000");
    expect(apiUrl("/api/v1/discover/events", { q: "robots", empty: "", none: null, offset: 0 })).toBe("http://internal:8000/api/v1/discover/events?q=robots&offset=0");

    const fetchImpl = fakeFetch({ "/api/v1/x": { body: { ok: true } } });
    expect(await apiGet("/api/v1/x", { fetchImpl, tags: ["event:x"] })).toEqual({ status: 200, data: { ok: true } });
    expect(fetchImpl.calls[0].init.next).toEqual({ revalidate: 60, tags: ["event:x"] });
    expect(fetchImpl.calls[0].init.cache).toBeUndefined();
    await apiGet("/api/v1/x", { fetchImpl, fresh: true });
    expect(fetchImpl.calls[1].init).toMatchObject({ cache: "no-store" });
    expect(fetchImpl.calls[1].init.next).toBeUndefined();
  });

  it("tells a missing thing (null data) from a failure (ApiError)", async () => {
    const fetchImpl = fakeFetch({ "/gone": { status: 404, body: {} }, "/down": { status: 502, body: {} }, "/off": new TypeError("fetch failed") });
    expect(await apiGet("/gone", { fetchImpl })).toEqual({ status: 404, data: null });
    await expect(apiGet("/down", { fetchImpl })).rejects.toMatchObject({ name: "ApiError", status: 502 });
    await expect(apiGet("/off", { fetchImpl })).rejects.toBeInstanceOf(ApiError);
  });

  it("sends the site's token when there is one, so the API can tell the site from a visitor", async () => {
    vi.stubEnv("API_SITE_TOKEN", "s3cret");
    const fetchImpl = fakeFetch({ "/x": { body: {} } });
    await apiGet("/x", { fetchImpl });
    expect(fetchImpl.calls[0].init.headers).toMatchObject({ Accept: "application/json", "X-Site-Token": "s3cret" });
  });
});
