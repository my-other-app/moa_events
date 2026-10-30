import apiClient from "./client";
import { parseClub, parseClubRef, parseComment, parsePoll } from "./discover";
import { ticketTypeName } from "@/utils/ticketing";

/**
 * The signed-in person's side of the API: signing in (with Google, or an
 * email and password), making an account, verifying its email, resetting a
 * password, their profile, their tickets, the clubs they follow, and liking,
 * voting and commenting on posts. Every call but the sign-ins themselves
 * goes with the account's token (client.js adds it, and refreshes it once
 * when it is refused).
 *
 * Responses are read defensively, as discover.js reads its own.
 */

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const str = (v) => (typeof v === "string" && v.trim() ? v : null);
const num = (v) => {
  const x = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};
const idOf = (v) => (typeof v === "number" || (typeof v === "string" && v !== "") ? v : null);
const list = (v, fn) => (Array.isArray(v) ? v.map(fn).filter(Boolean) : []);

/** The paging the API answers with: `next` is set when there is more. */
const page = (d, items, offset) => {
  const o = obj(d) || {};
  return { items, offset, more: Boolean(str(o.next)) };
};

/**
 * One registration, from GET /events/list?is_registered=true: the event as
 * the site's cards read it, and the ticket. Rows without a ticket are dropped.
 */
export function parseMyEvent(e) {
  const o = obj(e);
  if (!o || idOf(o.id) === null || !str(o.ticket_id)) return null;
  const starts = str(o.event_datetime);
  const hours = num(o.duration);
  const startMs = starts ? new Date(starts).getTime() : NaN;
  const ends = Number.isFinite(startMs) && hours > 0 ? new Date(startMs + hours * 3600 * 1000).toISOString() : null;
  const category = obj(o.category);
  // The ticket's type, and whether the event was cancelled, once the list says them (docs/TICKETING.md, club_ops).
  const typeName = ticketTypeName(o);
  return {
    ticket_id: o.ticket_id,
    attended: Boolean(o.is_attended),
    certificate: Boolean(str(o.certificate_url)),
    // Revoked by the organiser, as the list already says (src/utils/revoked.js):
    // the row says so instead of reading like a ticket that still works.
    revoked: o.ticket_revoked === true,
    // A paid event's registration whose payment never went through: not a ticket yet.
    awaitingPayment: Boolean(o.has_fee) && o.is_paid === false,
    ...(typeName ? { ticketType: typeName } : {}),
    event: {
      ...(o.status === "cancelled" ? { status: "cancelled", cancellation: obj(o.cancellation) } : {}),
      id: o.id,
      slug: str(o.slug),
      name: str(o.name) || "Untitled event",
      poster: o.poster || null,
      poster_thumb: null,
      starts_at: Number.isFinite(startMs) ? starts : null,
      ends_at: ends,
      duration_hours: hours > 0 ? hours : null,
      is_online: Boolean(o.is_online),
      location_name: str(o.location_name),
      has_fee: Boolean(o.has_fee),
      category: category && idOf(category.id) !== null && str(category.name) ? { id: category.id, name: category.name } : null,
      club: parseClubRef(o.club),
    },
  };
}

/** A followed club, from GET /user/following, in the shape ClubCard reads. The list doesn't say what's coming up. */
export function parseFollowedClub(c) {
  const o = obj(c);
  if (!o) return null;
  const club = parseClub({ ...o, followers: o.followers_count ?? o.followers });
  return club ? { ...club, upcoming_events: null } : null;
}

/** "already following" and "not following" are the state the person asked for. */
const settled = (promise) =>
  promise.then(
    () => true,
    (e) => (e?.response?.status === 409 ? false : Promise.reject(e)),
  );

/** The token endpoint is OAuth2's password grant: a form, not JSON. */
const FORM = { skipAuth: true, headers: { "Content-Type": "application/x-www-form-urlencoded" } };

export const accountApi = {
  /** Google's ID token for the account's tokens: {access_token, refresh_token, token_type}. */
  googleSignIn: (idToken) => apiClient.post("/api/v1/auth/google", { id_token: idToken, platform: "web" }, { skipAuth: true }).then((r) => r.data),

  /**
   * An email and password for the account's tokens, the way the app signs in.
   * An account with a second factor is refused with 401 TOTP_REQUIRED until
   * `totpCode` (or a recovery code) comes along.
   */
  passwordSignIn: ({ email, password, totpCode = null }) => {
    const form = new URLSearchParams({ username: email, password });
    if (totpCode) form.set("totp_code", totpCode);
    return apiClient.post("/api/v1/auth/token", form, FORM).then((r) => r.data);
  },

  /** A new password account: {username, access_token, refresh_token, token_type}. The server mails a six-digit code to the address. */
  signUp: ({ name, email, password }) =>
    apiClient.post("/api/v1/user/register", { full_name: name, email, password }, { skipAuth: true }).then((r) => r.data),

  /** Another code to the signed-in account's address: {sent, email, expires_in, retry_after}. */
  sendEmailCode: () => apiClient.post("/api/v1/auth/email/send-code").then((r) => r.data),

  /** The code typed back: {email_verified, email_verified_at, merged, registrations_transferred}. */
  verifyEmail: (code) => apiClient.post("/api/v1/auth/email/verify", { code }).then((r) => r.data),

  /** A reset code to the address, if it has an account: {sent: true} either way. */
  forgotPassword: (email) => apiClient.post("/api/v1/auth/password/forgot", { email }, { skipAuth: true }).then((r) => r.data),

  /** The code and a new password for the account's tokens, as a sign-in hands back. */
  resetPassword: ({ email, code, password }) =>
    apiClient.post("/api/v1/auth/password/reset", { email, code, new_password: password }, { skipAuth: true }).then((r) => r.data),

  /** The account (and, on the server, any website guest tickets folded into it). */
  profile: () => apiClient.get("/api/v1/user/profile/me").then((r) => r.data),

  /** The same, for tokens that aren't the session yet: asked before a sign-in is kept, so it arrives whole. */
  profileWith: (accessToken) =>
    apiClient.get("/api/v1/user/profile/me", { skipAuth: true, headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.data),

  /** Ends this browser's session on the server. Sent with the token it ends, since the session is already gone here. */
  endSession: (accessToken, sid) =>
    apiClient.delete(`/api/v1/auth/sessions/${encodeURIComponent(sid)}`, { skipAuth: true, headers: { Authorization: `Bearer ${accessToken}` } }),

  /** Upcoming (`ended: false`, soonest first) or past (`ended: true`, latest first) registrations. */
  myEvents: ({ ended, offset = 0, limit = 20 }) =>
    apiClient
      .get("/api/v1/events/list", { params: { is_registered: true, is_ended: ended, offset, limit } })
      .then((r) => page(r.data, list(r.data?.items, parseMyEvent), offset)),

  following: ({ offset = 0, limit = 24 } = {}) =>
    apiClient.get("/api/v1/user/following", { params: { offset, limit } }).then((r) => page(r.data, list(r.data?.items, parseFollowedClub), offset)),

  /** Whether the signed-in person follows the club. */
  isFollowing: (clubId) => accountApi.followState(clubId).then((s) => s.following),

  /**
   * The signed-in person and the club: whether they follow it, and whether
   * they said yes to "Get updates from <club> on WhatsApp" (false from an API
   * that doesn't say).
   */
  followState: (clubId) =>
    apiClient.get(`/api/v1/clubs/info/${encodeURIComponent(clubId)}`).then((r) => ({
      following: Boolean(r.data?.user_data?.is_following),
      updates: r.data?.user_data?.club_updates_whatsapp === true,
    })),

  /**
   * Resolves true when the follow is new, false when it was already there. `ref` credits a tracking link.
   * `updates: true` is "Get updates from <club> on WhatsApp" ticked as they follow; unticked, the follow is sent as it always was.
   */
  follow: (clubId, ref = null, { updates = false } = {}) =>
    settled(
      apiClient.post(`/api/v1/clubs/follow/${encodeURIComponent(clubId)}`, updates ? { club_updates_whatsapp: true } : null, ref ? { params: { ref } } : undefined)
    ),

  /** A follower turning the club's updates on WhatsApp on or off; the follow stays as it is. */
  setClubUpdates: (clubId, on) =>
    apiClient.post(`/api/v1/clubs/follow/${encodeURIComponent(clubId)}`, { club_updates_whatsapp: Boolean(on) }).then(() => Boolean(on)),

  unfollow: (clubId) => settled(apiClient.post(`/api/v1/clubs/unfollow/${encodeURIComponent(clubId)}`)),

  /** Likes the post, or takes the like back: {liked, likes}. */
  toggleLike: (threadId) =>
    apiClient.post(`/api/v1/threads/${encodeURIComponent(threadId)}/like`).then((r) => ({
      liked: Boolean(r.data?.liked),
      likes: Math.max(0, num(r.data?.likes) ?? 0),
    })),

  /** One vote per person; voting again moves it. Resolves the poll as it now stands. */
  vote: (threadId, optionId) =>
    apiClient.post(`/api/v1/threads/${encodeURIComponent(threadId)}/vote`, { option_id: String(optionId) }).then((r) => parsePoll(r.data)),

  /**
   * A comment on the post, as the signed-in person (the app's own route).
   * The words go trimmed; the API takes 1 to 500 characters, 30 comments a
   * minute (429 past that), and answers 404 for a post that is gone.
   * Resolves the comment as the API saved it, in parseComment's shape.
   */
  addComment: (threadId, body) =>
    apiClient.post(`/api/v1/threads/${encodeURIComponent(threadId)}/comments`, { body: String(body ?? "").trim() }).then((r) => {
      const comment = parseComment(r.data);
      if (!comment) throw new Error("The comment didn't come back");
      return comment;
    }),

  /** Removes one of the signed-in person's own comments (403 for anyone else's). */
  deleteComment: (threadId, commentId) =>
    apiClient.delete(`/api/v1/threads/${encodeURIComponent(threadId)}/comments/${encodeURIComponent(commentId)}`).then(() => true),
};
