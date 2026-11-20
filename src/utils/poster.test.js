import { describe, expect, it } from "vitest";
import { describePosterError, frameAspect, frameRadius, framingFromApi, framingToApi, isPosterKey, parsePoster, posterFilename, readRender, unavailableWords } from "./poster";

/*
 * What the API says about a guest's poster (feature-register/posters/
 * CONTRACT.md §6.1), read for the pages, and what its refusals mean.
 */
const body = (over = {}) => ({
  available: true,
  reason: null,
  key: "3f9a0c1d2e3f4a5b6c7d8e9f0a1b2c3d",
  event: { id: 1, name: "DevFest 2026", slug: "devfest-2026-dd9e17", starts_at: "2026-11-28T08:30:00+05:30", ends_at: "2026-11-28T17:00:00+05:30" },
  guest: { name: "Asha Nair", first_name: "Asha", initials: "AN", role: "speaker", role_label: "Speaker" },
  moment: { key: "before", phrase: "I'm attending", caption: "I'm attending DevFest 2026!" },
  share_url: "https://api.myotherapp.in/l/x7k2m9pq",
  photo: { width: 1600, height: 2000, uploaded_at: "2026-11-22T10:01:00+05:30" },
  formats: [
    { key: "story", width: 1080, height: 1920, variant: "role:speaker", frame: { x: 140, y: 300, width: 800, height: 1000, radius: [40, 40, 40, 40] }, framing: { zoom: 1.2, x: 0.5, y: 0.4 }, render: { status: "rendering", fingerprint: "s1" } },
    { key: "square", width: 1080, height: 1080, variant: "default", frame: { x: 140, y: 180, width: 800, height: 800, radius: [400, 400, 400, 400] }, framing: { zoom: 1, x: 0.5, y: 0.45 }, render: { status: "ready", fingerprint: "a1" } },
    { key: "poster", width: 10, height: 10, render: {} },
  ],
  ...over,
});

describe("reading a poster", () => {
  it("reads everything the page needs, the formats in the page's order", () => {
    const p = parsePoster(body());
    expect(p).toMatchObject({
      available: true,
      key: "3f9a0c1d2e3f4a5b6c7d8e9f0a1b2c3d",
      event: { id: 1, name: "DevFest 2026", slug: "devfest-2026-dd9e17", path: "/events/devfest-2026-dd9e17" },
      guest: { name: "Asha Nair", firstName: "Asha", initials: "AN", role: "speaker", roleLabel: "Speaker" },
      moment: { key: "before", phrase: "I'm attending", caption: "I'm attending DevFest 2026!" },
      shareUrl: "https://api.myotherapp.in/l/x7k2m9pq",
      photo: { width: 1600, height: 2000, uploadedAt: "2026-11-22T10:01:00+05:30" },
    });
    // An unknown format is dropped; square comes before story.
    expect(p.formats.map((f) => f.key)).toEqual(["square", "story"]);
    expect(p.formats[0]).toMatchObject({ variant: "default", frame: { width: 800, height: 800, radius: [400, 400, 400, 400] }, framing: { zoom: 1, cx: 0.5, cy: 0.45 }, render: { status: "ready", fingerprint: "a1" } });
  });

  it("reads a poster that isn't available, with why", () => {
    expect(parsePoster({ available: false, reason: "off" })).toEqual({ available: false, reason: "off", event: null, guest: null });
    expect(parsePoster({ available: false, reason: "not_sent", event: { id: 1, name: "DevFest 2026", slug: "devfest" } })).toMatchObject({ reason: "not_sent", event: { path: "/events/devfest" } });
    expect(parsePoster({ available: false })).toMatchObject({ reason: "off" });
  });

  it("isn't a poster without `available`, and isn't available with no format to make", () => {
    expect(parsePoster(null)).toBeNull();
    expect(parsePoster({ detail: "Not Found" })).toBeNull();
    expect(parsePoster(body({ formats: [] }))).toMatchObject({ available: false, reason: "off" });
  });

  it("takes no photo without its size, no key that isn't one, no link that isn't a web address", () => {
    const p = parsePoster(body({ photo: { width: 0, height: 10 }, key: "short", share_url: "javascript:alert(1)" }));
    expect(p.photo).toBeNull();
    expect(p.key).toBeNull();
    expect(p.shareUrl).toBeNull();
    expect(isPosterKey("3f9a0c1d2e3f4a5b6c7d8e9f0a1b2c3d")).toBe(true);
    expect(isPosterKey("../x")).toBe(false);
  });

  it("reads a render's state; a ready one without a fingerprint isn't ready", () => {
    expect(readRender({ status: "ready", fingerprint: "f", retry_after_ms: 1500, caption: "Hi" })).toEqual({ status: "ready", fingerprint: "f", retryAfterMs: 1500, caption: "Hi" });
    expect(readRender({ status: "ready" }).status).toBe("none");
    expect(readRender({ status: "weird" }).status).toBe("none");
    expect(readRender(null).status).toBe("none");
  });

  it("turns the API's framing into the page's and back", () => {
    expect(framingFromApi({ zoom: 1.35, x: 0.52, y: 0.4 })).toEqual({ zoom: 1.35, cx: 0.52, cy: 0.4 });
    expect(framingFromApi(null)).toEqual({ zoom: 1, cx: 0.5, cy: 0.5 });
    expect(framingToApi({ zoom: 1.35, cx: 0.52, cy: 0.4 })).toEqual({ zoom: 1.35, x: 0.52, y: 0.4 });
    expect(framingToApi({ zoom: 0.2, cx: 2, cy: -1 })).toEqual({ zoom: 1, x: 1, y: 0 });
  });
});

describe("the frame and the file", () => {
  it("draws the frame's corners in its own proportions: a circle stays a circle", () => {
    const [square, story] = parsePoster(body()).formats;
    expect(frameRadius(square.frame)).toBe("50% 50% 50% 50% / 50% 50% 50% 50%");
    expect(frameRadius(story.frame)).toBe("5% 5% 5% 5% / 4% 4% 4% 4%");
    expect(frameRadius(null)).toBeUndefined();
    expect(frameAspect(story)).toBeCloseTo(0.8);
    expect(frameAspect({ ...story, frame: null })).toBeCloseTo(1080 / 1920);
  });

  it("names the download as the server does", () => {
    const p = parsePoster(body());
    expect(posterFilename(p, "square")).toBe("im-attending-devfest-2026-dd9e17-square.png");
    expect(posterFilename({ ...p, moment: { phrase: "I attended" } }, "story")).toBe("i-attended-devfest-2026-dd9e17-story.png");
  });
});

describe("when a poster can't be made", () => {
  it("has words for every reason, and for one it doesn't know", () => {
    for (const reason of ["off", "event_cancelled", "cancelled", "revoked", "not_sent", "moment_off"]) {
      expect(unavailableWords(reason).title).toBeTruthy();
    }
    expect(unavailableWords("whatever")).toEqual(unavailableWords("off"));
    expect(unavailableWords("not_sent").title).toBe("Your poster isn’t ready yet");
  });

  const fail = (status, data = null, headers = {}) => ({ response: { status, data, headers } });

  it("reads each refusal", () => {
    expect(describePosterError(fail(403, { error_code: "POSTER_FORBIDDEN" })).kind).toBe("not_yours");
    expect(describePosterError(fail(401, {})).kind).toBe("not_yours");
    expect(describePosterError(fail(404, { error_code: "TICKET_NOT_FOUND" })).kind).toBe("missing");
    expect(describePosterError(fail(404, { detail: "Not Found" })).kind).toBe("off");
    expect(describePosterError(fail(409, { error_code: "POSTER_NOT_AVAILABLE", errors: { reason: "revoked" } }))).toMatchObject({ kind: "unavailable", reason: "revoked" });
    expect(describePosterError(fail(409, { error_code: "POSTER_NOT_AVAILABLE", reason: "moment_off" }))).toMatchObject({ kind: "unavailable", reason: "moment_off" });
    expect(describePosterError(fail(503, { error_code: "POSTER_RENDER_BUSY" }))).toMatchObject({ kind: "busy", message: "Your poster couldn’t be drawn just now. Try again in a moment." });
    expect(describePosterError(fail(413, {}))).toMatchObject({ kind: "too_big" });
    expect(describePosterError({ message: "Network Error" })).toMatchObject({ kind: "network" });
  });

  it("says how long to wait after too many", () => {
    expect(describePosterError(fail(429, { error_code: "RATE_LIMITED", errors: { retry_after: 600 } })).message).toBe("That’s a lot of changes in a short time. Try again in 10 minutes.");
    expect(describePosterError(fail(429, {}, { "retry-after": "20" })).message).toBe("That’s a lot of changes in a short time. Try again in a minute.");
    expect(describePosterError(fail(429, {})).message).toMatch(/a few minutes/);
  });

  it("says the server's words for a photo it couldn't read", () => {
    expect(describePosterError(fail(422, { message: "That file isn't a picture" }), { upload: true })).toEqual({ kind: "bad_photo", message: "That file isn't a picture." });
    expect(describePosterError(fail(422, {}), { upload: true }).message).toBe("We couldn’t read that photo. Try another one.");
    // Off an upload, a 422 is the page's own mistake: no server words shown.
    expect(describePosterError(fail(422, { message: "format not offered" })).kind).toBe("error");
  });
});
