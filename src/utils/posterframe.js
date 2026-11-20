/**
 * Where the guest's photo sits inside the poster's photo frame: pure
 * geometry, shared by the framing editor and the tests.
 *
 * A framing is `{zoom, cx, cy}`:
 *   zoom     1 = the photo just covers the frame (as `object-fit: cover`
 *            would draw it); up to MAX_ZOOM times closer
 *   cx, cy   the point of the photo at the frame's centre, as fractions of
 *            the photo's width and height (0.5, 0.5 = its middle)
 *
 * The same three numbers mean the same picture whatever size the frame is
 * drawn at (the editor's frame on a phone, the server's at 1080 px), and
 * whatever its shape: a frame of another shape (another format) shows a
 * little more or less around the same centre. They are always kept so the
 * photo covers the frame: no empty edge can be dragged into view.
 */

export const MIN_ZOOM = 1;
/** The API's limit too (PUT …/framing takes 1 to 5). */
export const MAX_ZOOM = 5;

/** The framing a new photo starts with: whole (cover), centred. */
export const CENTRED = Object.freeze({ zoom: 1, cx: 0.5, cy: 0.5 });

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const positive = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

/** A size `{w, h}` with both sides above zero, or null. */
export function sizeOf(s) {
  return s && positive(s.w) && positive(s.h) ? { w: s.w, h: s.h } : null;
}

/** The scale at which the photo (`img`, natural px) just covers the frame (`frame`, drawn px). */
export function coverScale(img, frame) {
  return Math.max(frame.w / img.w, frame.h / img.h);
}

/**
 * The framing kept to what can be drawn: the zoom within its limits, and
 * the centre where the photo still covers the frame on every side. With
 * no sizes known yet, only the zoom and the 0..1 range are checked.
 */
export function clampFraming(f, img = null, frame = null) {
  const zoom = clamp(num(f?.zoom, 1), MIN_ZOOM, MAX_ZOOM);
  let cx = clamp(num(f?.cx, 0.5), 0, 1);
  let cy = clamp(num(f?.cy, 0.5), 0, 1);
  const i = sizeOf(img);
  const fr = sizeOf(frame);
  if (i && fr) {
    const s = coverScale(i, fr) * zoom;
    // How much of the photo the frame shows, as a fraction of each side.
    const vw = fr.w / (s * i.w);
    const vh = fr.h / (s * i.h);
    cx = vw >= 1 ? 0.5 : clamp(cx, vw / 2, 1 - vw / 2);
    cy = vh >= 1 ? 0.5 : clamp(cy, vh / 2, 1 - vh / 2);
  }
  return { zoom: round(zoom), cx: round(cx), cy: round(cy) };
}

const round = (v) => Math.round(v * 10000) / 10000;

/** The framing after the photo is dragged by (dx, dy) frame pixels. */
export function panBy(f, dx, dy, img, frame) {
  const i = sizeOf(img);
  const fr = sizeOf(frame);
  if (!i || !fr) return clampFraming(f);
  const s = coverScale(i, fr) * clamp(num(f?.zoom, 1), MIN_ZOOM, MAX_ZOOM);
  return clampFraming({ ...f, cx: num(f?.cx, 0.5) - dx / (s * i.w), cy: num(f?.cy, 0.5) - dy / (s * i.h) }, i, fr);
}

/**
 * The framing at another zoom, keeping the photo's point under (px, py)
 * where it is (a pinch's midpoint, the wheel's pointer). (px, py) are frame
 * pixels from the frame's centre; leave them out to zoom about the centre.
 */
export function zoomTo(f, zoom, img, frame, px = 0, py = 0) {
  const i = sizeOf(img);
  const fr = sizeOf(frame);
  const z0 = clamp(num(f?.zoom, 1), MIN_ZOOM, MAX_ZOOM);
  const z1 = clamp(num(zoom, z0), MIN_ZOOM, MAX_ZOOM);
  if (!i || !fr) return clampFraming({ ...f, zoom: z1 });
  const s0 = coverScale(i, fr);
  const a = s0 * z0;
  const b = s0 * z1;
  const cx = num(f?.cx, 0.5) + (px / i.w) * (1 / a - 1 / b);
  const cy = num(f?.cy, 0.5) + (py / i.h) * (1 / a - 1 / b);
  return clampFraming({ zoom: z1, cx, cy }, i, fr);
}

/**
 * Where the photo is drawn inside a frame of `frame` px: its size and its
 * top-left corner, relative to the frame's.
 */
export function placement(f, img, frame) {
  const i = sizeOf(img);
  const fr = sizeOf(frame);
  if (!i || !fr) return null;
  const g = clampFraming(f, i, fr);
  const s = coverScale(i, fr) * g.zoom;
  const w = i.w * s;
  const h = i.h * s;
  return { width: w, height: h, left: fr.w / 2 - g.cx * w, top: fr.h / 2 - g.cy * h };
}

/** Whether two framings draw the same picture (to the nearest ten-thousandth). */
export const sameFraming = (a, b) => {
  const x = clampFraming(a);
  const y = clampFraming(b);
  return x.zoom === y.zoom && x.cx === y.cx && x.cy === y.cy;
};

/** The distance and midpoint of two pointers (a pinch). */
export function pinchOf(a, b) {
  return { d: Math.hypot(b.x - a.x, b.y - a.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** One keyboard press on the framing: arrows move, + and − zoom, 0 / Home start again. Null for any other key. */
export function keyFraming(f, key, { shift = false } = {}, img = null, frame = null) {
  const fr = sizeOf(frame);
  const step = (fr ? Math.min(fr.w, fr.h) : 100) * (shift ? 0.1 : 0.02);
  const z = clamp(num(f?.zoom, 1), MIN_ZOOM, MAX_ZOOM);
  switch (key) {
    // The photo moves the way the arrow points.
    case "ArrowLeft":
      return panBy(f, -step, 0, img, frame);
    case "ArrowRight":
      return panBy(f, step, 0, img, frame);
    case "ArrowUp":
      return panBy(f, 0, -step, img, frame);
    case "ArrowDown":
      return panBy(f, 0, step, img, frame);
    case "+":
    case "=":
      return zoomTo(f, z + (shift ? 0.5 : 0.1), img, frame);
    case "-":
    case "_":
      return zoomTo(f, z - (shift ? 0.5 : 0.1), img, frame);
    case "0":
    case "Home":
      return clampFraming(CENTRED, img, frame);
    default:
      return null;
  }
}
