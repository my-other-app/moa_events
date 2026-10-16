import apiClient from "./client";
import { parseClub, parseClubRef, parsePoll } from "./discover";

/**
 * The signed-in person's side of the API: signing in with Google, their
 * profile, their tickets, the clubs they follow, and liking and voting on
 * posts. Every call but the sign-in itself goes with the account's token
 * (client.js adds it, and refreshes it once when it is refused).
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
  return {
    ticket_id: o.ticket_id,
    attended: Boolean(o.is_attended),
    certificate: Boolean(str(o.certificate_url)),
    event: {
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

export const accountApi = {
  /** Google's ID token for the account's tokens: {access_token, refresh_token, token_type}. */
  googleSignIn: (idToken) => apiClient.post("/api/v1/auth/google", { id_token: idToken, platform: "web" }, { skipAuth: true }).then((r) => r.data),

  /** The account (and, on the server, any website guest tickets folded into it). */
  profile: () => apiClient.get("/api/v1/user/profile/me").then((r) => r.data),

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
  isFollowing: (clubId) => apiClient.get(`/api/v1/clubs/info/${encodeURIComponent(clubId)}`).then((r) => Boolean(r.data?.user_data?.is_following)),

  /** Resolves true when the follow is new, false when it was already there. `ref` credits a tracking link. */
  follow: (clubId, ref = null) => settled(apiClient.post(`/api/v1/clubs/follow/${encodeURIComponent(clubId)}`, null, ref ? { params: { ref } } : undefined)),

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
};
