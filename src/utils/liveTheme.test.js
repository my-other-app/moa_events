import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_THEME, backdropStyle, contrast, guestTheme, markFor, mediaUrl, rememberTheme, rememberedTheme, textOn, themeClasses, themeVars, tileStyle } from "./liveTheme";

/**
 * The live theme as a guest's phone reads it (CONTRACT.md 1): nothing to
 * draw unless the organiser saved one, every field with a fallback, the
 * server's text colours (or the same WCAG rule where one is missing), and
 * the pictures only from https.
 */
const media = (over = {}) => ({ id: "m1", kind: "logo", thumbnail: "https://media.myotherapp.in/t.png", medium: "https://media.myotherapp.in/m.png", large: "https://media.myotherapp.in/l.png", width: 960, height: 480, ...over });

const saved = (over = {}) => ({
  custom: true,
  version: "a91c3f02",
  theme: {
    preset: "club",
    colors: { background: "#101820", accent: "#F2AA4C", answers: ["#E4572E", "#29335C", "#F3A712", "#669BBC", "#A8C686", "#7D4E57"] },
    text: { on_background: "#FFFFFF", on_accent: "#111827", on_answers: ["#111827", "#FFFFFF", "#111827", "#111827", "#111827", "#FFFFFF"] },
    font: { display: "bebas_neue", body: "inter" },
    answers: { style: "letters" },
    timer: "ring",
    leaderboard: { size: 10, podium: false, animate: false, own_rank: true },
    logo: media(),
    background: { kind: "color", gradient: null, image: null, dim: 0.5 },
    screen: { text_scale: 1.3, logo: true, sponsors: true, join: "lobby", answer_layout: "grid" },
    guest: { text_scale: 1.1, logo: true, background: "theme", answer_layout: "grid" },
    ...over,
  },
});

afterEach(() => sessionStorage.clear());

describe("which theme a phone draws", () => {
  it("draws none when the organiser never saved one, or the API is from before themes", () => {
    expect(guestTheme(null)).toBeNull();
    expect(guestTheme(undefined)).toBeNull();
    // `custom: false` carries the editor's starting point (meridian_dark): never drawn.
    expect(guestTheme({ custom: false, theme: { ...saved().theme }, version: "x" })).toBeNull();
    expect(guestTheme({ custom: true, theme: null })).toBeNull();
  });

  it("keeps every field the organiser set, the server's text colours with it", () => {
    const t = guestTheme(saved());
    expect(t.version).toBe("a91c3f02");
    expect(t.colors).toEqual({ background: "#101820", accent: "#F2AA4C", answers: ["#E4572E", "#29335C", "#F3A712", "#669BBC", "#A8C686", "#7D4E57"] });
    expect(t.text.on_answers).toEqual(["#111827", "#FFFFFF", "#111827", "#111827", "#111827", "#FFFFFF"]);
    expect(t.font).toEqual({ display: "bebas_neue", body: "inter" });
    expect(t.answers.style).toBe("letters");
    expect(t.timer).toBe("ring");
    expect(t.leaderboard).toEqual({ size: 10, podium: false, animate: false, own_rank: true });
    expect(t.guest).toEqual({ text_scale: 1.1, logo: true, background: "theme", answer_layout: "grid" });
  });

  it("falls back to the preset's value for anything missing or out of range", () => {
    const t = guestTheme({ custom: true, theme: { colors: { background: "red", accent: "#12345", answers: ["#000000"] }, font: { display: "comic_sans", body: "bebas_neue" }, timer: "sundial", answers: { style: "emoji" }, guest: { text_scale: 9, answer_layout: "spiral" } } });
    expect(t.colors.background).toBe(DEFAULT_THEME.colors.background);
    expect(t.colors.accent).toBe(DEFAULT_THEME.colors.accent);
    // The six answers: the one given, then the preset's for the rest.
    expect(t.colors.answers).toEqual(["#000000", ...DEFAULT_THEME.colors.answers.slice(1)]);
    // Bebas Neue is capitals only: never the body; an unknown face is DM Sans.
    expect(t.font).toEqual({ display: "dm_sans", body: "dm_sans" });
    expect(t.timer).toBe("bar");
    expect(t.answers.style).toBe("shapes");
    expect(t.guest.text_scale).toBe(1.3);
    expect(t.guest.answer_layout).toBe("column");
    expect(t.guest.background).toBe("plain");
    expect(t.leaderboard).toEqual({ size: 5, podium: true, animate: true, own_rank: true });
  });

  it("works out a missing text colour by the server's rule: white or the ink at 4.5:1, else black", () => {
    const t = guestTheme({ custom: true, theme: { colors: { background: "#F4F5F2", accent: "#777777", answers: ["#FFD400", "#2563EB", "#D97706", "#16A34A", "#7C3AED", "#0891B2"] } } });
    expect(t.text.on_background).toBe("#111827");
    // #777777: white is 4.48:1 and the ink 3.9:1, neither enough; black is 4.69:1.
    expect(t.text.on_accent).toBe("#000000");
    expect(t.text.on_answers[0]).toBe("#111827");
    expect(t.text.on_answers[1]).toBe("#FFFFFF");
  });

  it("draws the solid colour when a gradient lacks its colours or the picture is gone or not https", () => {
    expect(guestTheme(saved({ background: { kind: "gradient", gradient: { from: "#000000" }, dim: 0.45 } })).background.kind).toBe("color");
    expect(guestTheme(saved({ background: { kind: "image", image: null, dim: 0.45 } })).background.kind).toBe("color");
    expect(guestTheme(saved({ background: { kind: "image", image: media({ medium: "http://evil.example/x.png", large: null, thumbnail: null }), dim: 0.45 } })).background.kind).toBe("color");
    const g = guestTheme(saved({ background: { kind: "gradient", gradient: { from: "#101820", to: "#29335C", angle: 135 }, dim: 0.45 } }));
    expect(g.background).toMatchObject({ kind: "gradient", gradient: { from: "#101820", to: "#29335C", angle: 135 } });
  });
});

describe("contrast", () => {
  it("is WCAG 2.1's ratio", () => {
    expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrast("#0B0E0D", "#0B0E0D")).toBe(1);
  });

  it("picks the text for a fill as the server does", () => {
    expect(textOn("#0B0E0D")).toBe("#FFFFFF");
    expect(textOn("#F4F5F2")).toBe("#111827");
    expect(textOn("#777777")).toBe("#000000");
    // A gradient: the colour that reads on both ends.
    expect(textOn("#101820", "#29335C")).toBe("#FFFFFF");
  });
});

describe("drawing it", () => {
  it("sets the colours, the faces and the text size as custom properties", () => {
    const vars = themeVars(guestTheme(saved()));
    expect(vars["--lt-bg"]).toBe("#101820");
    expect(vars["--lt-on-bg"]).toBe("#FFFFFF");
    expect(vars["--lt-accent"]).toBe("#F2AA4C");
    expect(vars["--lt-on-accent"]).toBe("#111827");
    expect(vars["--lt-a1"]).toBe("#29335C");
    expect(vars["--lt-on-a1"]).toBe("#FFFFFF");
    expect(vars["--lt-scale"]).toBe("1.1");
    expect(vars["--dc-display"]).toContain("--font-bebas-neue");
    expect(vars["--dc-font"]).toContain("--font-inter");
    expect(vars["--lt-display-weight"]).toBe("400");
  });

  it("tops a gradient's sticky bar with the gradient's first colour", () => {
    const t = guestTheme(saved({ background: { kind: "gradient", gradient: { from: "#101820", to: "#29335C", angle: 90 }, dim: 0.45 } }));
    expect(themeVars(t)["--lt-bar"]).toBe("#101820");
    expect(backdropStyle(t)).toEqual({ backgroundColor: "#101820", backgroundImage: "linear-gradient(90deg, #101820, #29335C)" });
  });

  it("veils a background picture with the background colour, the colour beneath while it loads", () => {
    const t = guestTheme(saved({ background: { kind: "image", image: media({ medium: 'https://media.myotherapp.in/a"b.png' }), dim: 0.6 } }));
    const style = backdropStyle(t);
    expect(style.backgroundColor).toBe("#101820");
    expect(style.backgroundImage).toBe('linear-gradient(rgba(16, 24, 32, 0.6), rgba(16, 24, 32, 0.6)), url("https://media.myotherapp.in/a%22b.png")');
  });

  it("names its layout, answers, timer and motion in classes", () => {
    expect(themeClasses(guestTheme(saved())).split(" ")).toEqual(["lt-on", "lt-display-caps", "lt-backdrop-on", "lt-answers-letters", "lt-layout-grid", "lt-timer-ring", "lt-static"]);
  });

  it("marks answers with shapes by default, letters, or today's plain letter", () => {
    const shapes = guestTheme({ custom: true, theme: {} });
    expect(markFor(shapes, 0)).toMatchObject({ tinted: true, name: "Triangle", shape: 0 });
    expect(markFor(shapes, 5)).toMatchObject({ tinted: true, name: "Cross", shape: 5 });
    expect(markFor(guestTheme(saved()), 2)).toEqual({ tinted: true, glyph: "C", name: null, shape: null });
    expect(markFor(guestTheme(saved({ answers: { style: "plain" } })), 2)).toEqual({ tinted: false, glyph: "C", name: null, shape: null });
    expect(markFor(null, 1)).toEqual({ tinted: false, glyph: "B", name: null, shape: null });
    expect(tileStyle(guestTheme(saved()), 7)).toEqual({ "--tile": "var(--lt-a1)", "--tile-on": "var(--lt-on-a1)" });
    expect(tileStyle(null, 0)).toBeUndefined();
  });

  it("takes pictures only over https or from the site itself", () => {
    expect(mediaUrl(media())).toBe("https://media.myotherapp.in/m.png");
    expect(mediaUrl(media({ medium: null }))).toBe("https://media.myotherapp.in/l.png");
    expect(mediaUrl({ medium: "javascript:alert(1)" })).toBeNull();
    expect(mediaUrl({ medium: "/media/x.png" })).toBe("/media/x.png");
    expect(mediaUrl(null)).toBeNull();
  });
});

describe("between the room and the quiz", () => {
  it("keeps the room's theme for the tab, and forgets it on request", () => {
    expect(rememberedTheme(68)).toBeNull();
    rememberTheme(68, saved());
    expect(rememberedTheme(68)).toMatchObject({ custom: true, version: "a91c3f02" });
    rememberTheme(68, null);
    expect(rememberedTheme(68)).toBeNull();
  });
});
