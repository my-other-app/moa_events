import { describe, expect, it } from "vitest";
import { CENTRED, MAX_ZOOM, clampFraming, coverScale, keyFraming, panBy, pinchOf, placement, sameFraming, zoomTo } from "./posterframe";

/*
 * The framing editor's geometry: a landscape photo (4000 × 3000) in a square
 * frame drawn 300 px wide. At zoom 1 the photo's height fills the frame, so
 * the frame shows the middle 3000 × 3000 of it: a quarter of the width is
 * hidden on each side.
 */
const photo = { w: 4000, h: 3000 };
const square = { w: 300, h: 300 };

describe("framing a photo", () => {
  it("covers the frame at zoom 1", () => {
    expect(coverScale(photo, square)).toBeCloseTo(0.1);
    expect(placement(CENTRED, photo, square)).toEqual({ width: 400, height: 300, left: -50, top: 0 });
  });

  it("keeps the photo covering the frame: no empty edge can be dragged in", () => {
    // Dragged far to the right: the photo's left edge stops at the frame's.
    const right = panBy(CENTRED, 500, 0, photo, square);
    expect(placement(right, photo, square).left).toBeCloseTo(0);
    // Dragged far to the left: its right edge stops at the frame's.
    const left = panBy(CENTRED, -500, 0, photo, square);
    const p = placement(left, photo, square);
    expect(p.left + p.width).toBeCloseTo(300);
    // At zoom 1 the height just fits, so it can't move up or down at all.
    expect(panBy(CENTRED, 0, 80, photo, square).cy).toBe(0.5);
  });

  it("moves the photo with the finger", () => {
    const moved = panBy(CENTRED, 20, 0, photo, square);
    // 20 frame px at 0.1 px per photo px = 200 photo px = 0.05 of its width, the other way.
    expect(moved.cx).toBeCloseTo(0.45);
    expect(placement(moved, photo, square).left).toBeCloseTo(-30);
  });

  it("zooms about a point and keeps that point under the fingers", () => {
    const at = { x: 60, y: -40 };
    const before = placement(CENTRED, photo, square);
    const z = zoomTo(CENTRED, 2, photo, square, at.x, at.y);
    const after = placement(z, photo, square);
    // The photo point under (60, -40) before is under it after.
    const u0 = (at.x + 150 - before.left) / before.width;
    const u1 = (at.x + 150 - after.left) / after.width;
    const v0 = (at.y + 150 - before.top) / before.height;
    const v1 = (at.y + 150 - after.top) / after.height;
    expect(u1).toBeCloseTo(u0, 3);
    expect(v1).toBeCloseTo(v0, 3);
    expect(z.zoom).toBe(2);
  });

  it("keeps the zoom between 1 and the limit", () => {
    expect(zoomTo(CENTRED, 0.2, photo, square).zoom).toBe(1);
    expect(zoomTo(CENTRED, 99, photo, square).zoom).toBe(MAX_ZOOM);
    expect(clampFraming({ zoom: "x", cx: null, cy: 7 })).toEqual({ zoom: 1, cx: 0.5, cy: 1 });
  });

  it("means the same picture at any drawn size", () => {
    const f = zoomTo(panBy(CENTRED, 30, 0, photo, square), 1.5, photo, square, 10, 10);
    const small = placement(f, photo, square);
    const big = placement(f, photo, { w: 1080, h: 1080 });
    const k = 1080 / 300;
    expect(big.left).toBeCloseTo(small.left * k, 4);
    expect(big.top).toBeCloseTo(small.top * k, 4);
    expect(big.width).toBeCloseTo(small.width * k, 4);
  });

  it("pulls the centre back in for a frame of another shape", () => {
    // Pushed to the far left of a square frame, then shown in a tall frame (a story's slot).
    const f = panBy(CENTRED, 500, 0, photo, square);
    const tall = { w: 200, h: 400 };
    const kept = clampFraming(f, photo, tall);
    const p = placement(kept, photo, tall);
    expect(p.left).toBeLessThanOrEqual(0.0001);
    expect(p.left + p.width).toBeGreaterThanOrEqual(199.999);
    expect(p.top).toBeLessThanOrEqual(0.0001);
    expect(p.top + p.height).toBeGreaterThanOrEqual(399.999);
  });

  it("measures a pinch", () => {
    expect(pinchOf({ x: 0, y: 0 }, { x: 30, y: 40 })).toEqual({ d: 50, x: 15, y: 20 });
  });

  it("answers the keyboard: arrows move, + and − zoom, 0 centres", () => {
    const z = keyFraming(CENTRED, "+", {}, photo, square);
    expect(z.zoom).toBeCloseTo(1.1);
    expect(keyFraming(z, "-", {}, photo, square).zoom).toBeCloseTo(1);
    expect(keyFraming(CENTRED, "+", { shift: true }, photo, square).zoom).toBeCloseTo(1.5);
    // The photo moves the way the arrow points: right moves it right, so the frame shows more of its left.
    expect(keyFraming(CENTRED, "ArrowRight", {}, photo, square).cx).toBeLessThan(0.5);
    expect(keyFraming(CENTRED, "ArrowLeft", { shift: true }, photo, square).cx).toBeGreaterThan(keyFraming(CENTRED, "ArrowLeft", {}, photo, square).cx);
    expect(sameFraming(keyFraming(z, "0", {}, photo, square), CENTRED)).toBe(true);
    expect(keyFraming(CENTRED, "a", {}, photo, square)).toBeNull();
  });

  it("works before any size is known", () => {
    expect(panBy(CENTRED, 10, 10, null, null)).toEqual(CENTRED);
    expect(zoomTo(CENTRED, 2, null, null).zoom).toBe(2);
    expect(placement(CENTRED, null, square)).toBeNull();
  });
});
