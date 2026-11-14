/**
 * People's profiles and saving them to a network
 * (feature-register/profiles-networking-contract.md). Their shapes, read and
 * said plainly; pure, shared by the server pages, the islands and the tests.
 *
 *   GET  /api/v1/profiles/{handle}           PublicProfile for this viewer (optional auth)
 *   GET  /api/v1/profiles/by-code/{code}     {handle, profile}; 410 PROFILE_CODE_INACTIVE,
 *                                            403 PROFILE_SCANNING_OFF
 *   GET  /api/v1/profiles/{handle}/vcard     text/vcard (email/phone only for who may see them)
 *   POST /api/v1/network                     {handle, method: "link"} → {person, created, new_encounter, profile}
 *   404 for unknown, deleted, suspended or blocked either way.
 *
 * Everything a person typed is kept as text (the components render it as
 * text, never as HTML), and only http(s) links survive.
 */
import { PLAY_STORE_URL } from "@/config";
import { profilePagePath } from "@/seo/urls";

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const list = (v, fn) => (Array.isArray(v) ? v.map(fn).filter(Boolean) : []);
const idOf = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() ? v.trim() : null);
const text = (v) => (typeof v === "string" && v.trim() ? v.replace(/\r\n?/g, "\n").trim() : null);
const bool = (v) => v === true;

/**
 * What the site will look up as a handle: the API's handles are lower-case
 * (3–30 of a-z 0-9 . _ -, starting and ending with a letter or digit), but
 * older usernames may be looser, so the site only keeps out what can't be
 * one; the API decides the rest (404).
 */
const HANDLE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const isProfileHandle = (v) => HANDLE.test(String(v ?? "")) && !String(v).includes("..");

/** A QR's code: 10 of [a-z0-9] today; read case-blind, a little looser in length. */
const CODE = /^[a-z0-9]{4,16}$/;
export const isProfileCode = (v) => CODE.test(String(v ?? ""));

/** A person's page, and where their QR leads. */
export const profilePath = profilePagePath;
/** The page a scanned code lands on: "save" survives the redirect, so the page can offer it. */
export const profileSavePath = (handle) => `${profilePath(handle)}?save=1`;

/**
 * "Open in the app" on Android: an intent link to one of the site's own
 * addresses (`path`, query kept) in the app's package, which Chrome hands to
 * the app when it is installed and otherwise sends to the Play Store. A
 * plain link to this site's own address would not leave the browser; on an
 * iPhone nothing can (Safari keeps a tap on a page's own domain), so the
 * page offers the store there instead.
 */
export const ANDROID_PACKAGE = "app.myotherapp.in";
export function androidIntentUrl(path, { fallback = PLAY_STORE_URL } = {}) {
  const p = String(path || "/");
  const rest = p.startsWith("/") && !p.startsWith("//") ? p : "/";
  return `intent://myotherapp.in${rest}#Intent;scheme=https;package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}

/** The sections a profile owner chooses who sees (visibility keys). */
export const SECTIONS = ["links", "projects", "achievements", "interests", "org"];

/** What each link type is called, and its icon. */
export const LINK_TYPES = {
  linkedin: ["LinkedIn", "linkedin"],
  github: ["GitHub", "github"],
  behance: ["Behance", "link"],
  dribbble: ["Dribbble", "link"],
  medium: ["Medium", "link"],
  youtube: ["YouTube", "youtube"],
  x: ["X", "x"],
  instagram: ["Instagram", "instagram"],
  website: ["Website", "globe"],
  portfolio: ["Portfolio", "globe"],
  other: ["Link", "link"],
};

/**
 * A link a person gave that is safe to follow: an absolute http(s) URL, no
 * user or password in it. Anything else (javascript:, data:, a bare word)
 * is null: never an href.
 */
export function httpLink(v) {
  const s = str(v);
  if (!s || !/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** A link the API made (a certificate): http(s), or a path on this site. */
const siteOrHttp = (v) => {
  const s = str(v);
  if (s && s.startsWith("/") && !s.startsWith("//") && !s.includes("\\")) return s;
  return httpLink(s);
};

/** A picture: a link, or {thumbnail, medium, original} links, as the API sends them. */
const pictureOf = (p) => {
  if (typeof p === "string") return httpLink(p) ? p.trim() : null;
  const o = obj(p);
  if (!o) return null;
  const pick = (k) => (httpLink(o[k]) ? o[k].trim() : null);
  const medium = pick("medium") || pick("original") || pick("thumbnail") || pick("url");
  if (!medium) return null;
  return { thumbnail: pick("thumbnail") || medium, medium, original: pick("original") || medium };
};

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const slugOf = (v) => (str(v) && SLUG.test(v.trim()) ? v.trim() : null);

const parseLink = (l) => {
  const o = obj(l);
  const url = httpLink(o?.url);
  if (!url) return null;
  const type = str(o.type) && LINK_TYPES[o.type.trim().toLowerCase()] ? o.type.trim().toLowerCase() : "other";
  return { type, url, label: str(o.label) };
};

/** "2026-03-01" → "2026-03" (a project's month; the API sends the first of it). */
const monthOf = (v) => {
  const m = /^(\d{4})-(\d{2})/.exec(str(v) || "");
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2]}` : null;
};

const parseProject = (p) => {
  const o = obj(p);
  if (!o || !str(o.title)) return null;
  return {
    id: idOf(o.id),
    title: str(o.title),
    summary: text(o.summary),
    url: httpLink(o.url),
    image: pictureOf(o.image),
    tags: list(o.tags, (t) => str(t)).slice(0, 5),
    role: str(o.role),
    month: monthOf(o.month),
  };
};

const parseInterest = (i) => {
  const o = obj(i);
  return o && str(o.name) ? { id: idOf(o.id), name: str(o.name), emoji: str(o.emoji) } : null;
};

/** null when the owner turned that part off; a list (maybe empty) when it is on. */
const partList = (v, fn) => (Array.isArray(v) ? list(v, fn) : null);

const parseAchievements = (a) => {
  const o = obj(a) || {};
  const n = typeof o.events_attended === "number" && Number.isFinite(o.events_attended) && o.events_attended >= 0 ? Math.floor(o.events_attended) : null;
  return {
    eventsAttended: n,
    certificates: partList(o.certificates, (c) => {
      const x = obj(c);
      return x && str(x.event_name) ? { eventName: str(x.event_name), url: siteOrHttp(x.url) } : null;
    }),
    talks: partList(o.talks, (t) => {
      const x = obj(t);
      return x && str(x.event_name) ? { eventName: str(x.event_name), title: str(x.title), eventSlug: slugOf(x.event_slug) } : null;
    }),
    clubs: partList(o.clubs, (c) => {
      const x = obj(c);
      return x && str(x.name) ? { name: str(x.name), slug: slugOf(x.slug) } : null;
    }),
  };
};

const parseRelation = (r) => {
  const o = obj(r);
  if (!o) return null;
  return { savedByMe: bool(o.saved_by_me), savedMe: bool(o.saved_me), mutual: bool(o.mutual), networkId: idOf(o.network_id) };
};

/**
 * PublicProfile → what the page shows:
 *   {handle, name, picture, headline, bio, city, org, interests, links,
 *    projects, achievements, contact: {email, phone}, hidden: [section],
 *    private, locked, indexable, isMe, relation}
 * or null when it isn't one.
 *
 * `locked`: a private profile this viewer may not see yet (strangers get
 * only {handle, full_name, picture, headline, private: true} until the owner
 * saves them, i.e. relation.saved_me). The page then shows the header and
 * says so, whatever else came with it.
 */
export function parsePublicProfile(d) {
  const o = obj(d);
  if (!o) return null;
  // Handles are case-blind; an older username may be stored with capitals. One spelling, lower
  // case, for every address the page builds (and /u/{handle}'s own redirect never loops).
  const handle = str(o.handle)?.toLowerCase() || null;
  const name = str(o.full_name);
  if (!handle || !isProfileHandle(handle) || !name) return null;
  const isPrivate = bool(o.private);
  const isMe = bool(o.is_me);
  const relation = parseRelation(o.relation);
  const locked = isPrivate && !isMe && !relation?.savedMe;
  const org = obj(o.org);
  const contact = obj(o.contact) || {};
  return {
    handle,
    name,
    picture: pictureOf(o.picture),
    headline: str(o.headline),
    bio: locked ? null : text(o.bio),
    city: locked ? null : str(o.city),
    org: !locked && org && str(org.name) ? { id: idOf(org.id), name: str(org.name) } : null,
    interests: locked ? [] : list(o.interests, parseInterest),
    links: locked ? [] : list(o.links, parseLink),
    projects: locked ? [] : list(o.projects, parseProject),
    achievements: parseAchievements(locked ? null : o.achievements),
    contact: locked ? { email: null, phone: null } : { email: str(contact.email), phone: str(contact.phone) },
    hidden: list(o.hidden_sections, (s) => (SECTIONS.includes(s) ? s : null)),
    private: isPrivate,
    locked,
    // Only a public profile whose owner said yes is ever indexed.
    indexable: !isPrivate && bool(o.indexable),
    isMe,
    relation,
  };
}

/** True when the achievements have anything to show. */
export function hasAchievements(a) {
  if (!a) return false;
  return Boolean(a.eventsAttended) || Boolean(a.certificates?.length) || Boolean(a.talks?.length) || Boolean(a.clubs?.length);
}

/** "Asha Rao" → "Asha". */
export const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "them";

/** "2026-03" → "Mar 2026". */
export function monthLabel(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(month || "");
  if (!m) return null;
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1]} ${m[1]}`;
}

/** What a link is called on the page: the label the person gave, else its type's name. */
export const linkLabel = (link) => link.label || (LINK_TYPES[link.type] || LINK_TYPES.other)[0];
export const linkIcon = (link) => (LINK_TYPES[link.type] || LINK_TYPES.other)[1];

/**
 * POST /network's answer (always 200, new row or not): {saved, created,
 * mutual, profile}. `created` is false when they were saved already;
 * `profile` is the person as the saver sees them now (saving may open
 * sections up).
 */
export function parseSaveResult(d) {
  const o = obj(d) || {};
  const person = obj(o.person) || {};
  return {
    saved: true,
    created: bool(o.created),
    mutual: bool(person.mutual),
    profile: parsePublicProfile(o.profile),
  };
}

/**
 * A save's refusal (apiFailure's shape) as {kind, message}:
 *   "self" | "off" | "gone" | "inactive" | "signin" | "limit" | "network" | "server" | "message"
 */
export function describeSaveError(f = {}, name = "") {
  const first = firstName(name);
  if (f.authExpired || f.status === 401) return { kind: "signin", message: "Your sign-in ran out. Sign in again, then try once more." };
  if (f.network) return { kind: "network", message: "We couldn't reach MyOtherApp. Check your connection and try again." };
  if (f.code === "CANNOT_SAVE_SELF") return { kind: "self", message: "That's your own profile." };
  if (f.code === "PROFILE_SCANNING_OFF" || f.status === 403) return { kind: "off", message: `${first} isn't taking saves right now.` };
  if (f.code === "PROFILE_CODE_INACTIVE" || f.status === 410) return { kind: "inactive", message: "That code was replaced. Ask for the new one." };
  if (f.status === 404) return { kind: "gone", message: "This profile isn't available any more." };
  if (f.code === "RATE_LIMITED" || f.status === 429) return { kind: "limit", message: "That's a lot of saves in a row. Wait a minute, then try again." };
  if (!f.status || f.status >= 500) return { kind: "server", message: "Something went wrong on our side. Try again in a moment." };
  return { kind: "message", message: f.message || "That didn't go through. Try again." };
}

/**
 * GET /profiles/by-code/{code}, by what the API answered:
 *   {state: "ok", handle}     → the profile, with the save intent
 *   {state: "inactive"}       410 PROFILE_CODE_INACTIVE: the owner made a new code
 *   {state: "scanning-off"}   403 PROFILE_SCANNING_OFF: the owner turned saving by QR off
 *   {state: "missing"}        404 NOT_FOUND (or an answer with no handle in it)
 *   null                      anything else (429 RATE_LIMITED, 5xx): the caller treats it as an error
 */
export function readCodeAnswer(status, body) {
  const o = obj(body) || {};
  const code = str(o.error_code);
  if (status === 410 || code === "PROFILE_CODE_INACTIVE") return { state: "inactive" };
  if (status === 403 && code === "PROFILE_SCANNING_OFF") return { state: "scanning-off" };
  if (status === 404) return { state: "missing" };
  if (status >= 200 && status < 300) {
    const handle = (str(o.handle) || str(obj(o.profile)?.handle))?.toLowerCase();
    return handle && isProfileHandle(handle) ? { state: "ok", handle } : { state: "missing" };
  }
  return null;
}
