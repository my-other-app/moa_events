/**
 * How the discovery pages say dates, prices and counts. Every time is shown
 * in India time, the way the clubs set them, whatever the visitor's clock.
 */
export const TZ = "Asia/Kolkata";

const valid = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const shortDateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const longDateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const yearFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric" });

const part = (parts, type) => parts.find((p) => p.type === type)?.value || "";

/** "Sat, 18 Oct · 6:00 PM" in IST; empty when the date is missing or broken. */
export function formatWhen(iso) {
  const d = valid(iso);
  if (!d) return "";
  const p = dayFmt.formatToParts(d);
  return `${part(p, "weekday")}, ${part(p, "day")} ${part(p, "month")} · ${timeFmt.format(d)}`;
}

/** "6:00 PM" in IST, whatever the visitor's clock; empty when missing. */
export function formatTime(iso) {
  const d = valid(iso);
  return d ? timeFmt.format(d) : "";
}

/** "18 Oct 2026" — for past events and the like. */
export function formatDate(iso) {
  const d = valid(iso);
  return d ? longDateFmt.format(d) : "";
}

/** "just now", "5m ago", "3h ago", "2d ago", then the date. */
export function timeAgo(iso, now = Date.now()) {
  const d = valid(iso);
  if (!d) return "";
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return yearFmt.format(d) === yearFmt.format(new Date(now)) ? shortDateFmt.format(d) : longDateFmt.format(d);
}

const rupees = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** "Free", "₹199", or "Paid" when the price is not known. */
export function formatPrice(hasFee, fee) {
  if (!hasFee) return "Free";
  const n = Number(fee);
  return Number.isFinite(n) && n > 0 ? `₹${rupees.format(n)}` : "Paid";
}

/** 950, 1.2k, 3.4M. */
export function formatCount(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** "800 m away", "2.4 km away", "38 km away"; null when the distance is not known. */
export function formatDistance(km) {
  if (km === null || km === undefined || km === "") return null;
  const v = Number(km);
  if (!Number.isFinite(v) || v < 0) return null;
  if (v < 1) return `${Math.max(50, Math.round((v * 1000) / 50) * 50)} m away`;
  if (v < 10) return `${v.toFixed(1).replace(/\.0$/, "")} km away`;
  return `${Math.round(v)} km away`;
}

export const plural = (n, one, many = `${one}s`) => `${formatCount(n)} ${Number(n) === 1 ? one : many}`;

/**
 * The pill on an event's poster: what is most worth knowing at a glance.
 * Live beats closing soon beats full; a free event says so when nothing
 * more pressing does.
 */
export function statusPill(event) {
  if (!event) return null;
  switch (event.status) {
    case "live":
      return { label: "Live now", tone: "live" };
    case "closing_soon":
      return { label: "Closing soon", tone: "warn" };
    case "full":
      return { label: "Full", tone: "muted" };
    case "ended":
      return { label: "Ended", tone: "muted" };
    default:
      return event.has_fee ? null : { label: "Free", tone: "free" };
  }
}

/**
 * An image from the API is either a plain URL or the S3 dict of sizes
 * (thumbnail / medium / original). Returns the best URL for the size asked,
 * or null.
 */
export function imageUrl(img, size = "medium") {
  if (!img) return null;
  if (typeof img === "string") return img;
  if (typeof img !== "object") return null;
  const order = { thumbnail: ["thumbnail", "medium", "original"], medium: ["medium", "original", "thumbnail"], original: ["original", "medium", "thumbnail"] }[size] || ["medium", "original", "thumbnail"];
  for (const k of [...order, "url", "src"]) {
    if (typeof img[k] === "string" && img[k]) return img[k];
  }
  return null;
}

/** "Circuit Society" → "C"; for the round placeholder when a club has no logo. */
export function initial(name) {
  const s = String(name || "").trim();
  return s ? s[0].toUpperCase() : "?";
}
