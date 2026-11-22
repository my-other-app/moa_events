import axios from "axios";
import apiClient from "./client";
import { API_BASE_URL } from "@/config";
import { apiFailure } from "@/utils/ticketing";
import {
  parseBoard,
  parseCollect,
  parseDeck,
  parseHunt,
  parseMe,
  parseNames,
  parseReveal,
  parseScan,
  parseScreen,
  parseSession,
} from "@/utils/games";

/**
 * The games API (feature-register/games/CONTRACT.md section 3), from the
 * browser.
 *
 * Player calls carry `Authorization: Game <session token>`. They go through
 * a plain axios instance, not apiClient: the site's client puts the
 * account's or the guest's bearer token on every call (and, in cookie mode,
 * strips the header), which would hide the game session. Making a session
 * from a signed-in browser (`openSession`) is the one call that does use
 * apiClient, so the normal auth goes along.
 *
 * Every call throws apiFailure()'s shape plus `data` (the answer's body,
 * where PIN_WRONG's attempts_left and PIN_LOCKED's locked_until are) and,
 * for a refusal that says so, `retryAfter` from `retry_after`.
 */
const plain = axios.create({ baseURL: API_BASE_URL, headers: { "Content-Type": "application/json" } });

const at = (v) => encodeURIComponent(String(v));
const base = (eventId) => `/api/v1/games/${at(eventId)}`;
const auth = (token) => (token ? { headers: { Authorization: `Game ${token}` } } : {});

export function gameFailure(error) {
  const f = apiFailure(error);
  const data = error?.response?.data;
  const ra = Number(data?.retry_after);
  return { ...f, data: data && typeof data === "object" ? data : null, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : f.retryAfter };
}

const fail = (error) => {
  throw gameFailure(error);
};
const body = (r) => r?.data;

export const gamesApi = {
  /** GET /{event}/public: what the landing pages need; null when the event has no games (404). */
  names: (eventId) =>
    plain.get(`${base(eventId)}/public`).then(
      (r) => parseNames(body(r)),
      (e) => (e?.response?.status === 404 ? null : fail(e)),
    ),

  /** POST /session/badge {token}: the event and the games' names, or NOT_CHECKED_IN. */
  badge: (token) => plain.post("/api/v1/games/session/badge", { token }).then((r) => parseNames(body(r)), fail),

  /** POST /session/pin {token, pin}: a session, or PIN_WRONG / PIN_LOCKED. */
  pin: (token, pin) => plain.post("/api/v1/games/session/pin", { token, pin }).then((r) => parseSession(body(r)), fail),

  /** POST /{event}/session with the normal auth (an account, or the web guest token). */
  openSession: (eventId) => apiClient.post(`${base(eventId)}/session`, {}).then((r) => parseSession(body(r)), fail),

  me: (eventId, token) => plain.get(`${base(eventId)}/me`, auth(token)).then((r) => parseMe(body(r)), fail),
  setPublic: (eventId, token, isPublic) => plain.patch(`${base(eventId)}/me`, { public: isPublic }, auth(token)).then(() => true, fail),
  /** GET /{event}/me/code: my badge URL + PIN, to show for others to scan. */
  code: (eventId, token) =>
    plain.get(`${base(eventId)}/me/code`, auth(token)).then((r) => {
      const d = body(r) || {};
      return { url: d.url || d.qr_url || d.badge_url || null, pin: d.pin != null ? String(d.pin) : null };
    }, fail),

  reveal: (eventId, token) => plain.post(`${base(eventId)}/cards/reveal`, {}, auth(token)).then((r) => parseReveal(body(r)), fail),
  deck: (eventId, token) => plain.get(`${base(eventId)}/cards/deck`, auth(token)).then((r) => parseDeck(body(r)), fail),
  collect: (eventId, token, code) => plain.post(`${base(eventId)}/cards/collect`, { token: code }, auth(token)).then((r) => parseCollect(body(r)), fail),

  hunt: (eventId, token) => plain.get(`${base(eventId)}/hunt`, auth(token)).then((r) => parseHunt(body(r)), fail),
  scan: (eventId, token, code) => plain.post(`${base(eventId)}/hunt/scan`, { token: code }, auth(token)).then((r) => parseScan(body(r)), fail),
  hint: (eventId, token, pointId) => plain.post(`${base(eventId)}/hunt/hint`, pointId ? { point_id: pointId } : {}, auth(token)).then((r) => body(r) || {}, fail),

  board: (eventId, token, game, limit = 10) =>
    plain.get(`${base(eventId)}/board`, { params: { game, limit }, ...auth(token) }).then((r) => parseBoard(body(r)), fail),

  /** GET /screen/{token}: the venue screen's whole state. */
  screen: (screenToken) => plain.get(`/api/v1/games/screen/${at(screenToken)}`).then((r) => parseScreen(body(r)), fail),
};

/** The venue screen's server-sent events address. */
export const screenStreamUrl = (screenToken) => `${API_BASE_URL}/api/v1/games/screen/${at(screenToken)}/stream`;
