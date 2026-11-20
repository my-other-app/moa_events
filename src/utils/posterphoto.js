/**
 * The guest's photo, made ready in the browser before it is sent.
 *
 * A phone's photo is often 4000 px and 3–12 MB; the poster draws it at most
 * about 1080 px wide. So where the browser can read the picture, it is
 * drawn upright (browsers apply the camera's orientation when drawing) at
 * most MAX_EDGE px on its long side and sent as a JPEG: quicker on a slow
 * connection, and it carries none of the camera's metadata (the place it
 * was taken among it). The server cleans every photo again whatever comes.
 *
 * A picture the browser can't read (HEIC outside Safari) goes as it is, when
 * it is within the server's limit: the server converts it. iPhones hand a
 * web page a JPEG for a photo from the library (the file field asks for
 * "image/*"), so this is mostly desktop Chrome with a HEIC file.
 */

/** The long side, in px, a photo is brought down to. */
export const MAX_EDGE = 2048;
const QUALITY = 0.88;

/** What the file field asks for: any picture (on iPhone that brings the library's photos as JPEG). Checked after choosing. */
export const ACCEPT = "image/*,.heic,.heif";

const KINDS = [
  ["jpeg", /^image\/(jpeg|jpg|pjpeg)$/i, /\.(jpe?g|jfif)$/i],
  ["png", /^image\/png$/i, /\.png$/i],
  ["webp", /^image\/webp$/i, /\.webp$/i],
  ["heic", /^image\/(heic|heif|heic-sequence|heif-sequence)$/i, /\.(heic|heif)$/i],
];

/** "jpeg" | "png" | "webp" | "heic", by the file's type or, when the browser says none (HEIC often), its name; null for anything else. */
export function photoKind(file) {
  const type = typeof file?.type === "string" ? file.type : "";
  const name = typeof file?.name === "string" ? file.name : "";
  for (const [kind, mime] of KINDS) if (mime.test(type)) return kind;
  if (type && !/^application\/octet-stream$/i.test(type)) return null;
  for (const [kind, , ext] of KINDS) if (ext.test(name)) return kind;
  return null;
}

/** "8 MB", "750 KB". */
export function sizeWords(bytes) {
  if (!(bytes > 0)) return "";
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

/** A photo that couldn't be made ready: `code` is "type", "size" or "unreadable". */
export class PhotoProblem extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PhotoProblem";
    this.code = code;
  }
}

/** The words for each, for the line under the photo. */
export function photoProblemText(code, maxBytes) {
  if (code === "type") return "Choose a photo: JPEG, PNG, HEIC or WebP.";
  if (code === "size") return maxBytes ? `That photo is too big. Choose one under ${sizeWords(maxBytes)}.` : "That photo is too big. Choose a smaller one.";
  return "We couldn't read that photo. Try another one, or take a screenshot of it and choose that.";
}

/** The size to draw a w × h picture at, its long side at most `maxEdge`. */
export function fitWithin(w, h, maxEdge = MAX_EDGE) {
  if (!(w > 0) || !(h > 0)) return null;
  const long = Math.max(w, h);
  const k = long > maxEdge ? maxEdge / long : 1;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** The picture, read by the browser: an <img> with its natural size, or null when it can't read it. */
export function loadImage(blob) {
  return new Promise((resolve) => {
    let url = null;
    try {
      url = URL.createObjectURL(blob);
    } catch {
      resolve(null);
      return;
    }
    const img = new Image();
    const done = (ok) => {
      img.onload = null;
      img.onerror = null;
      if (ok && img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve({ img, url, w: img.naturalWidth, h: img.naturalHeight });
        return;
      }
      revokeUrl(url);
      resolve(null);
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.decoding = "async";
    img.src = url;
  });
}

function revokeUrl(url) {
  try {
    if (url) URL.revokeObjectURL(url);
  } catch {
    /* nothing to let go of */
  }
}

/** The picture drawn at `size` on white (a PNG's transparency would turn black in a JPEG), as a JPEG blob; null when the browser won't. */
function drawJpeg(img, size, quality) {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = size.w;
      canvas.height = size.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size.w, size.h);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, size.w, size.h);
      if (typeof canvas.toBlob !== "function") return resolve(null);
      canvas.toBlob((b) => resolve(b && b.size > 0 ? b : null), "image/jpeg", quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * The photo to send: `{blob, filename, width, height, previewUrl}`.
 * `width`/`height` and `previewUrl` (an object URL the caller lets go of)
 * are null when the browser couldn't read the picture and it goes as it is.
 *
 * Throws a PhotoProblem: "type" for anything but JPEG/PNG/HEIC/WebP, "size"
 * when even the made-ready photo is over `maxBytes` (or an unreadable one
 * is), "unreadable" for a file that says it is a picture but isn't one the
 * server could take either.
 */
export async function preparePhoto(file, { maxBytes = 0, maxEdge = MAX_EDGE, load = loadImage } = {}) {
  const kind = photoKind(file);
  if (!kind) throw new PhotoProblem("type", photoProblemText("type"));
  if (!(file?.size > 0)) throw new PhotoProblem("unreadable", photoProblemText("unreadable"));
  const within = (b) => !maxBytes || b.size <= maxBytes;
  const read = await load(file);
  if (!read) {
    // Not readable here. HEIC goes on to the server, which converts it; anything else is a broken file.
    if (kind !== "heic") throw new PhotoProblem("unreadable", photoProblemText("unreadable"));
    if (!within(file)) throw new PhotoProblem("size", photoProblemText("size", maxBytes));
    return { blob: file, filename: file.name || "photo.heic", width: null, height: null, previewUrl: null };
  }
  const tries = [
    [maxEdge, QUALITY],
    [maxEdge, 0.75],
    [Math.round(maxEdge * 0.75), 0.75],
  ];
  for (const [edge, quality] of tries) {
    const size = fitWithin(read.w, read.h, edge);
    const blob = size ? await drawJpeg(read.img, size, quality) : null;
    if (!blob) break;
    if (within(blob)) return { blob, filename: "photo.jpg", width: size.w, height: size.h, previewUrl: read.url };
  }
  // The browser read it but wouldn't draw it smaller (or not small enough): the file as it is, if it fits.
  if (within(file)) return { blob: file, filename: file.name || `photo.${kind === "jpeg" ? "jpg" : kind}`, width: read.w, height: read.h, previewUrl: read.url };
  revokeUrl(read.url);
  throw new PhotoProblem("size", photoProblemText("size", maxBytes));
}
