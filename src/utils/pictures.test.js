// @vitest-environment node
import { describe, expect, it } from "vitest";
import { imageUrl } from "./format";
import { BOXES, isPosterShape, logoFit, SHAPES, sizeFor } from "./pictures";

describe("the size a frame asks for", () => {
  it("is the smallest at least twice as wide as the frame, else the original", () => {
    // A poster: a row's thumbnail, the fan, a card, the event page.
    expect(sizeFor("poster", 104)).toBe("thumbnail");
    expect(sizeFor("poster", 120)).toBe("thumbnail");
    expect(sizeFor("poster", 216)).toBe("medium");
    expect(sizeFor("poster", 270)).toBe("medium");
    expect(sizeFor("poster", 360)).toBe("large");
    expect(sizeFor("poster", 540)).toBe("large");
    expect(sizeFor("poster", 560)).toBe("original");
    // A logo: the small discs, the club page's, a partner's tile.
    expect(sizeFor("logo", 56)).toBe("thumbnail");
    expect(sizeFor("logo", 75)).toBe("thumbnail");
    expect(sizeFor("logo", 104)).toBe("medium");
    expect(sizeFor("logo", 600)).toBe("original");
  });

  it("never asks for a banner's thumbnail: it has none", () => {
    expect(sizeFor("cover", 40)).toBe("medium");
    expect(sizeFor("cover", 380)).toBe("medium");
    expect(sizeFor("cover", 1120)).toBe("large");
    expect(sizeFor("cover", 1600)).toBe("original");
    expect(Object.keys(BOXES.cover)).not.toContain("thumbnail");
  });

  it("asks for the original for something it doesn't know", () => {
    expect(sizeFor("banner", 10)).toBe("original");
    expect(sizeFor("poster", undefined)).toBe("thumbnail");
  });

  it("is found in the API's sizes, a bigger one before a smaller when it is missing", () => {
    const poster = { thumbnail: "t", medium: "m", large: "l", original: "o" };
    expect(imageUrl(poster, "large")).toBe("l");
    expect(imageUrl({ medium: "m", original: "o" }, "large")).toBe("o");
    expect(imageUrl({ thumbnail: "t", large: "l" }, "medium")).toBe("l");
    expect(imageUrl({ medium: "m", large: "l", original: "o" }, "thumbnail")).toBe("m");
    expect(imageUrl("https://x/one.png", "large")).toBe("https://x/one.png");
  });
});

describe("the shapes", () => {
  it("are 4:5 for a poster, square for a logo and 3:1 for a banner", () => {
    expect(SHAPES).toEqual({ poster: 0.8, logo: 1, cover: 3 });
  });

  it("fills a logo's frame only when it is square, and shows anything else whole", () => {
    expect(logoFit(1080, 1080)).toBe("fill");
    expect(logoFit(1000, 1030)).toBe("fill");
    expect(logoFit(1330, 300)).toBe("whole");
    expect(logoFit(500, 800)).toBe("whole");
    expect(logoFit(1080, 1000)).toBe("whole");
    expect(logoFit(0, 100)).toBeNull();
    expect(logoFit(undefined, undefined)).toBeNull();
  });

  it("knows a 4:5 poster, within 1%", () => {
    expect(isPosterShape(1080, 1350)).toBe(true);
    expect(isPosterShape(800, 1000)).toBe(true);
    expect(isPosterShape(1080, 1080)).toBe(false);
    expect(isPosterShape(1600, 900)).toBe(false);
    expect(isPosterShape(1080, 1920)).toBe(false);
    expect(isPosterShape(0, 0)).toBe(false);
  });
});
