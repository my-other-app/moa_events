/**
 * Speakers (feature-register/speakers-contract.md): one central profile
 * per person who has spoken at an event, with a public page at
 * /speakers/{slug}. Their shapes, read and said plainly; pure, shared by the
 * server pages, the islands and the tests.
 *
 *   GET  /api/v1/speakers/{slug}          the public page; {redirect_slug} for a
 *                                         merged profile; 404 hidden or unknown
 *   POST|DELETE /speakers/{slug}/follow   an app user follows them
 *   GET  /speakers/claim/{token}          what a claim link is for
 *   POST /speakers/claim/{token}          claim it (signed in)
 *   GET|PATCH /speakers/me, PUT /speakers/me/photo   the claimed profile, by its speaker
 *   GET  /speakers/sitemap                {speakers: [{slug, updated_at}]}
 */

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const list = (v, fn) => (Array.isArray(v) ? v.map(fn).filter(Boolean) : []);
const idOf = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() ? v.trim() : null);
const isoOrNull = (v) => {
  const s = str(v);
  return s && !Number.isNaN(new Date(s).getTime()) ? s : null;
};
const text = (v) => (typeof v === "string" && v.trim() ? v.replace(/\r\n?/g, "\n").trim() : null);
const count = (v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

export const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
export const isSpeakerSlug = (v) => SLUG.test(String(v ?? ""));

/** A speaker's page on the site. */
export const speakerPath = (slug) => `/speakers/${encodeURIComponent(slug)}`;

/** The links a profile may have, in the order they are shown, with how each is named. */
export const LINK_KINDS = [
  ["website", "Website"],
  ["linkedin", "LinkedIn"],
  ["x", "X"],
  ["github", "GitHub"],
  ["other", "Link"],
];
export const LINK_ICON = { website: "globe", linkedin: "linkedin", x: "x", github: "github", other: "link" };

/** A link that is safe to follow: https (or http), nothing else. */
export function safeLink(v) {
  const s = str(v);
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** {website, linkedin, x, github, other} → [{kind, label, url}] for the ones that are real links. */
export function profileLinks(links) {
  const o = obj(links) || {};
  return LINK_KINDS.map(([kind, label]) => {
    const url = safeLink(o[kind]);
    return url ? { kind, label, url } : null;
  }).filter(Boolean);
}

const parseTopic = (t) => {
  const o = obj(t);
  if (!o || !str(o.name)) return null;
  return { id: idOf(o.id), name: str(o.name), slug: str(o.slug) && SLUG.test(o.slug.trim()) ? o.slug.trim() : null };
};

const parseClub = (c) => {
  const o = obj(c);
  if (!o || !str(o.name)) return null;
  return { id: idOf(o.id), name: str(o.name), slug: str(o.slug) && SLUG.test(o.slug.trim()) ? o.slug.trim() : null };
};

/** One talk: an event the speaker is on (published, listed events only). */
export function parseTalk(t) {
  const o = obj(t);
  if (!o || idOf(o.event_id) === null || !str(o.name)) return null;
  return {
    eventId: idOf(o.event_id),
    slug: str(o.slug) && SLUG.test(o.slug.trim()) ? o.slug.trim() : null,
    name: str(o.name),
    date: isoOrNull(o.date),
    endsAt: isoOrNull(o.ends_at),
    club: parseClub(o.club),
    talkTitle: str(o.talk_title),
    poster: typeof o.poster === "string" ? str(o.poster) : obj(o.poster) || null,
  };
}

const photoOf = (p) => {
  if (typeof p === "string") return str(p) ? { thumbnail: p, medium: p } : null;
  const o = obj(p);
  if (!o) return null;
  const medium = str(o.medium) || str(o.original) || str(o.thumbnail);
  const thumbnail = str(o.thumbnail) || medium;
  return medium ? { thumbnail, medium } : null;
};

/**
 * GET /speakers/{slug}:
 *   {redirect: "<slug>"}   a merged profile: its page is the other one's now
 *   the page               {slug, name, headline, bio, photo, links, city, topics,
 *                          claimed, followers, following, upcoming, past, updatedAt}
 *   null                   anything else
 */
export function parseSpeakerPage(d) {
  const o = obj(d);
  if (!o) return null;
  const redirect = str(o.redirect_slug);
  if (redirect && SLUG.test(redirect)) return { redirect };
  if (!str(o.slug) || !SLUG.test(o.slug.trim()) || !str(o.name)) return null;
  const talks = obj(o.talks) || {};
  return {
    slug: o.slug.trim(),
    name: str(o.name),
    headline: str(o.headline),
    bio: text(o.bio),
    photo: photoOf(o.photo),
    links: profileLinks(o.links),
    rawLinks: obj(o.links) || {},
    city: str(o.city),
    topics: list(o.topics, parseTopic),
    claimed: o.claimed === true,
    followers: count(o.followers_count),
    following: o.following === true ? true : o.following === false ? false : null,
    upcoming: list(talks.upcoming, parseTalk),
    past: list(talks.past, parseTalk),
    updatedAt: isoOrNull(o.updated_at),
  };
}

/** GET /speakers/me: the claimed profile, as its speaker edits it. Null when it isn't one. */
export function parseMyProfile(d) {
  const page = parseSpeakerPage(d);
  if (!page || page.redirect) return null;
  return { ...page, id: idOf(d.id ?? d.profile_id) };
}

/** GET /speakers/claim/{token}: {profile, emailMasked, valid, reason, message}. */
export function parseClaimPreview(d) {
  const o = obj(d);
  if (!o) return null;
  const p = obj(o.profile);
  return {
    profile:
      p && str(p.name)
        ? { slug: str(p.slug), name: str(p.name), headline: str(p.headline), bio: text(p.bio), photo: photoOf(p.photo), talksCount: count(p.talks_count) }
        : null,
    emailMasked: str(o.email_masked),
    valid: o.valid === true,
    reason: str(o.reason),
    message: str(o.message),
  };
}

/** GET /speakers/sitemap: [{slug, updated_at}], bad rows left out. */
export function parseSpeakerSitemap(d) {
  const o = obj(d);
  const rows = Array.isArray(o?.speakers) ? o.speakers : Array.isArray(o?.items) ? o.items : Array.isArray(d) ? d : null;
  if (!rows) return null;
  return list(rows, (r) => {
    const x = obj(r);
    const slug = str(x?.slug);
    return slug && SLUG.test(slug) ? { slug, updated_at: isoOrNull(x.updated_at) } : null;
  });
}

/* ---------- what a refusal means ---------- */

/** Why a claim link can't be used, in words (the API's `reason`, or its error code). */
export const CLAIM_REASONS = {
  used: "This link was used already. If that was you, your profile is yours: sign in to edit it.",
  replaced: "A newer link was sent for this profile. Use the one in our latest email.",
  expired: "This link has expired. Write to us and we'll send a new one.",
  unavailable: "This profile can't be claimed any more.",
  claimed: "This profile has been claimed already.",
  invalid: "This link isn't valid. Check that the whole link was copied from your email.",
};

/**
 * A speaker call's refusal (apiFailure's shape) as {kind, message}:
 *   kind "off"       the API has no speakers yet (404 or 405 without a code)
 *   kind "gone"      not there (SPEAKER_NOT_FOUND, CLAIM_INVALID, NO_SPEAKER_PROFILE)
 *   kind "claim"     the claim link can't be used (`reason` set)
 *   kind "has"       the account already has a profile
 *   kind "app"       not an app user's account
 *   kind "signin" | "fields" | "limit" | "network" | "server" | "message"
 */
export function describeSpeakerError(f = {}) {
  const code = typeof f.code === "string" ? f.code : null;
  if (f.authExpired || f.status === 401) return { kind: "signin", message: "Your sign-in ran out. Sign in again, then try once more." };
  if (f.network) return { kind: "network", message: "We couldn't reach MyOtherApp. Check your connection and try again." };
  if (code && code.startsWith("CLAIM_")) {
    const reason = code.slice(6).toLowerCase();
    return { kind: reason === "invalid" ? "gone" : "claim", reason, message: CLAIM_REASONS[reason] || CLAIM_REASONS.invalid };
  }
  if (code === "ALREADY_HAS_PROFILE") return { kind: "has", message: "Your account already has a speaker profile. Write to us and we'll join the two." };
  if (code === "APP_USER_ONLY") return { kind: "app", message: "Sign in with your own MyOtherApp account (not a club's) to do this." };
  if (code === "SPEAKER_NOT_FOUND" || code === "NO_SPEAKER_PROFILE") return { kind: "gone", message: f.message || "We couldn't find that speaker profile." };
  if ((f.status === 404 || f.status === 405 || f.status === 501) && !code) return { kind: "off", message: "Speaker profiles aren't available just yet. Try again soon." };
  if (f.status === 404) return { kind: "gone", message: f.message || "We couldn't find that speaker profile." };
  if (f.status === 429) return { kind: "limit", message: "That's a lot of tries in a row. Wait a minute, then try again." };
  if (f.status === 422) {
    const e = obj(f.errors) || {};
    const fields = {};
    for (const [k, v] of Object.entries(e)) {
      const said = Array.isArray(v) ? str(v[0]) : str(v);
      if (said) fields[k] = said;
    }
    return { kind: "fields", fields, message: f.message || "Check the highlighted fields." };
  }
  if (!f.status || f.status >= 500) return { kind: "server", message: "Something went wrong on our side. Try again in a moment." };
  return { kind: "message", message: f.message || "That didn't go through. Try again." };
}
