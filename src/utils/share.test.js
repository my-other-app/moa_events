import { describe, expect, it } from "vitest";
import { intentUrl, isPresigned, parseShareRow, previewImage } from "./share";

/* The attendees' share row and the link-preview picture (feature-register/social-posting-contract.md). */
const ROW = [
  { platform: "copy", text: "Hack Night 04 — 8 Dec, 6 PM · Kochi", url: "https://r.myotherapp.in/c1" },
  { platform: "x", text: "Hack Night 04 — 8 Dec, 6 PM · Kochi", url: "https://r.myotherapp.in/x1", intent_url: "https://evil.example/intent?u=1" },
  { platform: "whatsapp", text: "Hack Night 04", url: "https://r.myotherapp.in/w1" },
  { platform: "linkedin", text: "Hack Night 04", url: "https://r.myotherapp.in/l1", intent_url: "https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fr.myotherapp.in%2Fl1" },
  { platform: "facebook", text: "Hack Night 04", url: "http://r.myotherapp.in/f1" },
  { platform: "x", text: "again", url: "https://r.myotherapp.in/x2" },
  { platform: "myspace", text: "no", url: "https://r.myotherapp.in/m" },
];

describe("the share row", () => {
  it("keeps each known platform once, in the row's order, with an https link", () => {
    const row = parseShareRow(ROW);
    expect(row.map((r) => r.platform)).toEqual(["x", "linkedin", "whatsapp", "copy"]);
    expect(row.find((r) => r.platform === "copy")).toMatchObject({ label: "Copy link", url: "https://r.myotherapp.in/c1", href: null });
    expect(parseShareRow({ detail: "Not found" })).toBeNull();
    expect(parseShareRow([])).toEqual([]);
  });

  it("uses the API's share address only on the platform's own host; otherwise builds it", () => {
    const row = parseShareRow(ROW);
    expect(row.find((r) => r.platform === "x").href).toBe("https://x.com/intent/post?text=Hack%20Night%2004%20%E2%80%94%208%20Dec%2C%206%20PM%20%C2%B7%20Kochi&url=https%3A%2F%2Fr.myotherapp.in%2Fx1");
    expect(row.find((r) => r.platform === "linkedin").href).toBe("https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fr.myotherapp.in%2Fl1");
    expect(row.find((r) => r.platform === "whatsapp").href).toBe("https://wa.me/?text=Hack%20Night%2004%20https%3A%2F%2Fr.myotherapp.in%2Fw1");
  });

  it("doesn't put the link in WhatsApp's words twice", () => {
    expect(intentUrl("whatsapp", "Come! https://r.myotherapp.in/w", "https://r.myotherapp.in/w")).toBe("https://wa.me/?text=Come!%20https%3A%2F%2Fr.myotherapp.in%2Fw");
    expect(intentUrl("facebook", "x", "https://r.myotherapp.in/f")).toBe("https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fr.myotherapp.in%2Ff");
  });
});

describe("the link-preview picture", () => {
  it("is share_image_url when it lasts and isn't the poster again", () => {
    expect(previewImage("https://media.myotherapp.in/posters/68/facebook-1200x630.jpg", "https://bucket.s3.amazonaws.com/events/68/poster.jpg?X-Amz-Signature=a")).toBe(
      "https://media.myotherapp.in/posters/68/facebook-1200x630.jpg",
    );
    // A presigned link dies within the hour: never in a cached page's head.
    expect(isPresigned("https://b.s3.amazonaws.com/x.jpg?X-Amz-Signature=abc")).toBe(true);
    expect(previewImage("https://b.s3.amazonaws.com/x.jpg?X-Amz-Expires=3600&X-Amz-Signature=abc")).toBeNull();
    // The API's fallback is the poster itself: the site's own card frames it better.
    expect(previewImage("https://media.myotherapp.in/events/68/poster.jpg", "https://bucket.s3.amazonaws.com/events/68/poster.jpg?X-Amz-Signature=a")).toBeNull();
    expect(previewImage(null)).toBeNull();
    expect(previewImage("http://media.myotherapp.in/a.jpg")).toBeNull();
  });
});
