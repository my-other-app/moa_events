/**
 * Sharing an event (feature-register/social-posting-contract.md): the
 * attendees' share row and the link-preview picture. Pure, shared by the
 * server page and the tests.
 *
 *   GET /api/v1/events/{id}/share  →  [{platform: "x"|"linkedin"|"facebook"|"whatsapp"|"copy",
 *                                       text, url, intent_url?}]
 *     `url` is the event's tracking link for that platform (utm_medium=share),
 *     `text` the club's words; `intent_url` (when the API sends it) the
 *     platform's own share address with both filled in. 404 (an API without
 *     it, or an event that isn't public): no row.
 *   share_image_url on the event (GET /discover/events/{ref}): the 1200 × 630
 *     picture made for link previews, or the poster.
 */

export const SHARE_PLATFORMS = ["x", "linkedin", "facebook", "whatsapp", "copy"];
export const SHARE_LABEL = { x: "X", linkedin: "LinkedIn", facebook: "Facebook", whatsapp: "WhatsApp", copy: "Copy link" };

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** An https address, or null. */
const https = (v) => {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
};

/** The hosts a platform's share address may be on (an intent_url anywhere else is ignored and built here). */
const INTENT_HOSTS = {
  x: ["x.com", "twitter.com"],
  linkedin: ["www.linkedin.com", "linkedin.com"],
  facebook: ["www.facebook.com", "facebook.com", "m.facebook.com"],
  whatsapp: ["wa.me", "api.whatsapp.com"],
};

const q = encodeURIComponent;

/** The platform's own share address for some words and a link (as the API builds it). */
export function intentUrl(platform, text, url) {
  if (platform === "x") return `https://x.com/intent/post?text=${q(text || "")}&url=${q(url)}`;
  if (platform === "linkedin") return `https://www.linkedin.com/sharing/share-offsite/?url=${q(url)}`;
  if (platform === "facebook") return `https://www.facebook.com/sharer/sharer.php?u=${q(url)}`;
  if (platform === "whatsapp") return `https://wa.me/?text=${q(text && text.includes(url) ? text : `${text ? `${text} ` : ""}${url}`)}`;
  return null;
}

/**
 * The share row: [{platform, label, text, url, href}] in the row's order,
 * each platform once; `href` is the platform's share address (null for
 * "copy", which copies `url`). Rows without an https link are dropped.
 * Null when the answer isn't a list.
 */
export function parseShareRow(d) {
  const rows = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : null;
  if (!rows) return null;
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const platform = str(r?.platform)?.toLowerCase();
    const url = https(r?.url);
    if (!platform || !SHARE_PLATFORMS.includes(platform) || !url || seen.has(platform)) continue;
    seen.add(platform);
    const text = str(r.text) || "";
    let href = null;
    if (platform !== "copy") {
      const given = https(r.intent_url);
      href = given && INTENT_HOSTS[platform].includes(new URL(given).hostname) ? given : intentUrl(platform, text, url);
    }
    out.push({ platform, label: SHARE_LABEL[platform], text, url, href });
  }
  return out.sort((a, b) => SHARE_PLATFORMS.indexOf(a.platform) - SHARE_PLATFORMS.indexOf(b.platform));
}

/** A presigned link (it dies within the hour): never in a cached page's head. */
export const isPresigned = (url) => /[?&](X-Amz-Signature|X-Amz-Credential|Signature|Expires)=/i.test(String(url || ""));

const fileOf = (url) => {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() || null;
  } catch {
    return null;
  }
};

/**
 * The picture a link preview should use for an event: the API's
 * `share_image_url` when it is a lasting https address (not presigned) and
 * not just the poster again (the site's own card, /og/events/{slug}, frames a
 * poster better); else null, and the site's card is used.
 *   posterUrl   the poster's address as the API sent it (to tell the two apart)
 */
export function previewImage(shareImageUrl, posterUrl = null) {
  const url = https(shareImageUrl);
  if (!url || isPresigned(url)) return null;
  const file = fileOf(url);
  if (file && posterUrl && file === fileOf(posterUrl)) return null;
  return url;
}
