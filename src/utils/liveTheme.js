/**
 * The live room's look ("live theme", CONTRACT.md section 1) as the guest's
 * phone draws it.
 *
 * The organiser picks a preset and a few controls in the console; the API
 * resolves them into one theme every renderer draws (big screen, this site,
 * the app), with the text colour for every fill already chosen for contrast
 * (`text.*`). This module turns that theme into what the room and the quiz
 * page need: CSS custom properties, a few classes, the mark beside each
 * answer, and the fallbacks the contract defines.
 *
 *   custom: false   the organiser never saved a theme: `guestTheme` is null
 *                   and the pages draw exactly what they drew before.
 *   custom: true    every field is read with a fallback (a missing or bad
 *                   value takes the preset default), text colours come from
 *                   the server, or from the same WCAG rule when a field is
 *                   missing.
 */

export const SHAPES = Object.freeze([
  { glyph: "▲", name: "Triangle" },
  { glyph: "◆", name: "Diamond" },
  { glyph: "●", name: "Circle" },
  { glyph: "■", name: "Square" },
  { glyph: "★", name: "Star" },
  { glyph: "✚", name: "Cross" },
]);

export const LETTERS = Object.freeze(["A", "B", "C", "D", "E", "F"]);

const ANSWERS = ["#DC2626", "#2563EB", "#D97706", "#16A34A", "#7C3AED", "#0891B2"];

/** The theme an organiser starts from (`meridian_dark`), field for field. */
export const DEFAULT_THEME = Object.freeze({
  preset: "meridian_dark",
  colors: { background: "#0B0E0D", accent: "#4FCDB0", answers: ANSWERS },
  font: { display: "dm_sans", body: "dm_sans" },
  answers: { style: "shapes" },
  timer: "bar",
  leaderboard: { size: 5, podium: true, animate: true, own_rank: true },
  logo: null,
  background: { kind: "color", gradient: null, image: null, dim: 0.45 },
  guest: { text_scale: 1.0, logo: true, background: "plain", answer_layout: "column" },
});

/**
 * Each font the theme may name, as a CSS stack: the self-hosted face
 * (src/components/liveroom/fonts.js, or the site's own two), then the
 * renderer's default sans. Bebas Neue is capitals only and never body text:
 * named for the body, the body falls back to DM Sans.
 */
const STACKS = {
  dm_sans: 'var(--font-dm-sans), "DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  bebas_neue: 'var(--font-bebas-neue), "Bebas Neue", var(--font-dm-sans), "DM Sans", Impact, sans-serif',
  poppins: 'var(--font-poppins), "Poppins", var(--font-dm-sans), "DM Sans", system-ui, sans-serif',
  space_grotesk: 'var(--font-space-grotesk), "Space Grotesk", var(--font-dm-sans), "DM Sans", system-ui, sans-serif',
  inter: 'var(--font-inter), "Inter", var(--font-dm-sans), "DM Sans", system-ui, sans-serif',
  noto_sans: 'var(--font-noto-sans), "Noto Sans", var(--font-dm-sans), "DM Sans", system-ui, sans-serif',
};
const DISPLAY = ["dm_sans", "bebas_neue", "poppins", "space_grotesk"];
const BODY = ["dm_sans", "inter", "poppins", "noto_sans"];

const HEX = /^#[0-9A-Fa-f]{6}$/;
const hex = (v, fallback) => (typeof v === "string" && HEX.test(v) ? v.toUpperCase() : fallback);
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const num = (v, lo, hi, fallback) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const flag = (v, fallback) => (typeof v === "boolean" ? v : fallback);

/* ---------- contrast (WCAG 2.1, the server's own rule) ---------- */

const channel = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminance(color) {
  const h = String(color).replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const LIGHT = "#FFFFFF";
const DARK = "#111827";
const BLACK = "#000000";

/** The text colour that reads on every fill: the better of white and the ink at 4.5:1, else black or white, else white. */
export function textOn(...fills) {
  const worst = (c) => Math.min(...fills.map((f) => contrast(c, f)));
  const best = worst(LIGHT) >= worst(DARK) ? LIGHT : DARK;
  if (worst(best) >= 4.5) return best;
  for (const c of [BLACK, LIGHT]) if (worst(c) >= 4.5) return c;
  return LIGHT;
}

/* ---------- reading the theme ---------- */

/** A picture's address for a phone (`medium`, else what there is), only over https or the site itself. */
export function mediaUrl(media, size = "medium") {
  if (!media || typeof media !== "object") return null;
  const url = media[size] || media.medium || media.large || media.thumbnail || media.original;
  if (typeof url !== "string") return null;
  return /^https:\/\//i.test(url) || url.startsWith("/") ? url : null;
}

/**
 * The theme to draw on a guest's phone, from the API's `{custom, theme,
 * version}`: null when there is none to draw (never customised, or an API
 * from before themes), else every field present.
 */
export function guestTheme(wrapper) {
  if (!wrapper || wrapper.custom !== true || !wrapper.theme || typeof wrapper.theme !== "object") return null;
  const t = wrapper.theme;
  const d = DEFAULT_THEME;
  const colors = t.colors || {};
  const answers = Array.from({ length: 6 }, (_, i) => hex((colors.answers || [])[i], d.colors.answers[i]));
  const background = hex(colors.background, d.colors.background);
  const accent = hex(colors.accent, d.colors.accent);
  const bg = t.background || {};
  const gradient = bg.gradient && hex(bg.gradient.from, null) && hex(bg.gradient.to, null) ? { from: hex(bg.gradient.from), to: hex(bg.gradient.to), angle: num(bg.gradient.angle, 0, 359, 180) } : null;
  const image = mediaUrl(bg.image) ? bg.image : null;
  let kind = oneOf(bg.kind, ["color", "gradient", "image"], "color");
  // A gradient without its two colours, an image that is gone: the solid colour.
  if ((kind === "gradient" && !gradient) || (kind === "image" && !image)) kind = "color";
  const text = t.text || {};
  const onBackground = hex(text.on_background, null) || (kind === "gradient" ? textOn(gradient.from, gradient.to) : textOn(background));
  const display = oneOf(t.font?.display, DISPLAY, "dm_sans");
  const body = oneOf(t.font?.body, BODY, "dm_sans");
  const g = t.guest || {};
  const lb = t.leaderboard || {};
  return {
    version: typeof wrapper.version === "string" ? wrapper.version : null,
    preset: typeof t.preset === "string" ? t.preset : d.preset,
    colors: { background, accent, answers },
    text: {
      on_background: onBackground,
      on_accent: hex(text.on_accent, null) || textOn(accent),
      on_answers: answers.map((a, i) => hex((text.on_answers || [])[i], null) || textOn(a)),
    },
    font: { display, body },
    answers: { style: oneOf(t.answers?.style, ["shapes", "letters", "plain"], "shapes") },
    timer: oneOf(t.timer, ["bar", "ring", "number", "hidden"], "bar"),
    leaderboard: { size: lb.size === 10 ? 10 : 5, podium: flag(lb.podium, true), animate: flag(lb.animate, true), own_rank: flag(lb.own_rank, true) },
    logo: mediaUrl(t.logo) ? t.logo : null,
    background: { kind, gradient, image, dim: num(bg.dim, 0.3, 0.8, 0.45) },
    guest: {
      text_scale: num(g.text_scale, 0.9, 1.3, 1.0),
      logo: flag(g.logo, true),
      background: oneOf(g.background, ["plain", "theme"], "plain"),
      answer_layout: oneOf(g.answer_layout, ["grid", "column"], "column"),
    },
  };
}

/* ---------- drawing it ---------- */

const rgba = (color, alpha) => {
  const h = color.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** A picture's address made safe to sit inside url("…"). */
const cssUrl = (url) => `url("${url.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`;

/**
 * The backdrop a phone draws when the theme asks for it (`guest.background:
 * "theme"`): the colour, the gradient, or the picture under a veil of the
 * background colour (always: it is what keeps text readable on a photo). The
 * colour is set under the picture too, so it shows while the picture loads
 * and if it never does.
 */
export function backdropStyle(theme) {
  const { background, colors } = theme;
  if (background.kind === "gradient") {
    const { from, to, angle } = background.gradient;
    return { backgroundColor: from, backgroundImage: `linear-gradient(${angle}deg, ${from}, ${to})` };
  }
  if (background.kind === "image") {
    const veil = rgba(colors.background, background.dim);
    return { backgroundColor: colors.background, backgroundImage: `linear-gradient(${veil}, ${veil}), ${cssUrl(mediaUrl(background.image))}` };
  }
  return { backgroundColor: colors.background };
}

/** The CSS custom properties the themed room and quiz read (src/styles/liveroom.css). */
export function themeVars(theme) {
  const vars = {
    "--lt-bg": theme.colors.background,
    "--lt-on-bg": theme.text.on_background,
    // The sticky top over a gradient: its first colour, which the text is known to read on.
    "--lt-bar": theme.background.kind === "gradient" ? theme.background.gradient.from : theme.colors.background,
    "--lt-accent": theme.colors.accent,
    "--lt-on-accent": theme.text.on_accent,
    "--lt-scale": String(theme.guest.text_scale),
    "--dc-font": STACKS[theme.font.body],
    "--dc-display": STACKS[theme.font.display],
    "--lt-display-weight": theme.font.display === "bebas_neue" ? "400" : "700",
  };
  theme.colors.answers.forEach((c, i) => {
    vars[`--lt-a${i}`] = c;
    vars[`--lt-on-a${i}`] = theme.text.on_answers[i];
  });
  return vars;
}

/** The classes on the themed page: what the stylesheet switches on. */
export function themeClasses(theme) {
  return [
    "lt-on",
    theme.font.display === "bebas_neue" ? "lt-display-caps" : "lt-display-sans",
    theme.guest.background === "theme" ? "lt-backdrop-on" : "lt-plain",
    `lt-answers-${theme.answers.style}`,
    `lt-layout-${theme.guest.answer_layout}`,
    `lt-timer-${theme.timer}`,
    theme.leaderboard.animate ? "lt-animate" : "lt-static",
  ].join(" ");
}

/**
 * The mark beside answer i: the shape (colour + ▲◆●■★✚, the default, safe
 * for colour-blind players), the letter (colour + A–F), or today's neutral
 * letter (`plain`, and whenever there is no theme). `tinted` says whether
 * the answer is drawn in its colour.
 */
export function markFor(theme, i) {
  const letter = LETTERS[i] || String(i + 1);
  if (!theme || theme.answers.style === "plain") return { tinted: false, glyph: letter, name: null, shape: null };
  if (theme.answers.style === "letters") return { tinted: true, glyph: letter, name: null, shape: null };
  const shape = SHAPES[i];
  return shape ? { tinted: true, glyph: shape.glyph, name: shape.name, shape: i } : { tinted: true, glyph: letter, name: null, shape: null };
}

/** The style that paints answer i in its colour (and the text on it in the server's colour for it). */
export function tileStyle(theme, i) {
  if (!theme || theme.answers.style === "plain") return undefined;
  const n = i % 6;
  return { "--tile": `var(--lt-a${n})`, "--tile-on": `var(--lt-on-a${n})` };
}

/* ---------- remembering it between the room and the quiz ---------- */

const store = (eventId) => `moa.live.theme.${eventId}`;

/** The room's theme kept for this tab, so the quiz page opens in it rather than flashing today's look first. */
export function rememberTheme(eventId, wrapper) {
  try {
    if (!wrapper || typeof wrapper !== "object") sessionStorage.removeItem(store(eventId));
    else sessionStorage.setItem(store(eventId), JSON.stringify({ custom: Boolean(wrapper.custom), theme: wrapper.theme || null, version: wrapper.version || null }));
  } catch {
    /* private mode: the page fetches it */
  }
}

export function rememberedTheme(eventId) {
  try {
    const raw = sessionStorage.getItem(store(eventId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
