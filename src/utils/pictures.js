/**
 * The one shape each club picture has, the same in the app, on this site and
 * on both dashboards (agreed with the owner, Oct 2026):
 *
 *   picture                         frame   asked for
 *   club logo, partner logo         1:1     1080 x 1080  (an Instagram profile picture)
 *   event poster                    4:5     1080 x 1350  (an Instagram portrait post)
 *   club banner (`cover`)           3:1     1500 x 500   (an X header)
 *
 * A poster is never cropped: it is shown whole in its 4:5 frame, on a soft
 * blurred copy of itself (components/discover/picture.jsx). A logo that is
 * not square is shown whole, with room around it, on white. A banner fills
 * its 3:1 frame.
 *
 * The API keeps each picture at a few sizes, each fitted inside a box (never
 * cropped, never enlarged). A frame asks for the smallest one at least twice
 * as wide as it is drawn, so it is sharp on a 2x screen, and for the
 * original when none is.
 */

/** Width of each size's box, by kind (the backend's app/core/storage/shapes.py). */
export const BOXES = {
  poster: { thumbnail: 240, medium: 540, large: 1080 },
  logo: { thumbnail: 150, medium: 500, large: 1080 },
  // A banner has no thumbnail: never ask for one.
  cover: { medium: 1500, large: 3000 },
};

/** Width / height of each kind's frame. */
export const SHAPES = { poster: 4 / 5, logo: 1, cover: 3 };

/**
 * Which size to ask for, for a picture of `kind` drawn `cssWidth` pixels
 * wide: the smallest whose box is at least twice that, else "original".
 */
export function sizeFor(kind, cssWidth) {
  const boxes = BOXES[kind];
  if (!boxes) return "original";
  const need = 2 * Math.max(0, Number(cssWidth) || 0);
  const fits = Object.entries(boxes)
    .filter(([, w]) => w >= need)
    .sort((a, b) => a[1] - b[1]);
  return fits.length ? fits[0][0] : "original";
}

/** How far from square a logo may be and still fill its frame. */
export const SQUARE_TOLERANCE = 0.03;

/**
 * How a logo of `width` x `height` sits in its square: "fill" when it is
 * (close enough to) square, "whole" -- shown entire, with room around it --
 * when it is not, so a wordmark is never cut. Null until the size is known.
 */
export function logoFit(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0 && h > 0)) return null;
  return Math.abs(w / h - 1) <= SQUARE_TOLERANCE ? "fill" : "whole";
}

/** Whether a poster of `width` x `height` is 4:5 (within 1%), and so fills its frame. */
export function isPosterShape(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0 && h > 0)) return false;
  return Math.abs(w / h / SHAPES.poster - 1) <= 0.01;
}
