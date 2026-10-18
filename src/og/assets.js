import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * What the share pictures need besides data: the site's fonts (read once
 * per instance; next.config traces src/og/fonts into the functions) and
 * remote pictures fetched as data: URLs, so a slow or broken poster never
 * breaks a picture — it just isn't in it.
 */

let fonts = null;

export function ogFonts() {
  if (!fonts) {
    const dir = join(process.cwd(), "src/og/fonts");
    const load = (file) => readFile(join(dir, file));
    fonts = Promise.all(
      ["bebas-neue-latin-400-normal.woff", "dm-sans-latin-400-normal.woff", "dm-sans-latin-700-normal.woff", "dm-sans-latin-ext-400-normal.woff", "dm-sans-latin-ext-700-normal.woff"].map(load)
    )
      .then(([bebas, dm, dmBold, dmExt, dmExtBold]) => [
        { name: "Bebas Neue", data: bebas, weight: 400, style: "normal" },
        { name: "DM Sans", data: dm, weight: 400, style: "normal" },
        { name: "DM Sans", data: dmBold, weight: 700, style: "normal" },
        // Latin Extended has the ₹. Under its own name: the renderer falls back
        // to another font for a glyph its font lacks, never to a same-named one.
        { name: "DM Sans Ext", data: dmExt, weight: 400, style: "normal" },
        { name: "DM Sans Ext", data: dmExtBold, weight: 700, style: "normal" },
      ])
      .catch((e) => {
        fonts = null;
        throw e;
      });
  }
  return fonts;
}

/** The picture's type from its first bytes: only what the renderer draws (PNG, JPEG, GIF). */
export function sniffImage(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  return null;
}

const MAX_BYTES = 6 * 1024 * 1024;

/** A remote picture as a data: URL, or null (missing, too big, slow, or a type the renderer can't draw). */
export async function imageDataUrl(url, { timeoutMs = 5000, fetchImpl = globalThis.fetch } = {}) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) return null;
    const type = sniffImage(buf);
    if (!type) return null;
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * A picture with a photo in it, as a JPEG (a PNG of a photo can pass the
 * 300 KB some apps allow a preview). Without sharp, the PNG as it is.
 */
export async function asJpeg(response, { quality = 82 } = {}) {
  try {
    const { default: sharp } = await import("sharp");
    const png = Buffer.from(await response.clone().arrayBuffer());
    const jpeg = await sharp(png).jpeg({ quality, mozjpeg: true }).toBuffer();
    const headers = new Headers(response.headers);
    headers.set("Content-Type", "image/jpeg");
    headers.delete("Content-Length");
    return new Response(jpeg, { status: response.status, headers });
  } catch {
    return response;
  }
}
