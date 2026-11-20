import apiClient from "./client";
import { apiFailure } from "@/utils/ticketing";
import { parseClaim, parseLeaderboard, parseQuestCard } from "@/utils/quests";

/**
 * A guest's quest (feature-register/quests/CONTRACT.md §8), from the
 * browser, with the token that opens the ticket: the account's, or the
 * guest token the registration left (client.js decides, as for the ticket
 * page). With no token the API answers the overview (no `me`).
 *
 * `card` is null for "nothing to show" (no quest, switched off, an API
 * without quests: a 404) and throws for anything else (no connection, a
 * server error), so a card already on the page stays while it can't be
 * read again. Every call throws apiFailure()'s shape; utils/quests.js says
 * what each refusal means.
 */

const at = (v) => encodeURIComponent(String(v));
const base = (eventId) => `/api/v1/events/${at(eventId)}/quest`;
const fail = (error) => {
  throw apiFailure(error);
};

export const questsApi = {
  /** GET /events/{id}/quest: the card, or null for none. */
  card: (eventId) =>
    apiClient.get(base(eventId)).then(
      (r) => parseQuestCard(r?.data),
      (error) => {
        if (error?.response?.status === 404) return null;
        return fail(error);
      },
    ),

  /** POST /events/{id}/quest/code: `{result, task, card}` (card parsed; null if the answer had none). */
  code: (eventId, code) =>
    apiClient.post(`${base(eventId)}/code`, { code }).then((r) => {
      const d = r?.data && typeof r.data === "object" ? r.data : {};
      return { result: d.result === "ALREADY_DONE" ? "ALREADY_DONE" : "DONE", task: d.task || null, card: parseQuestCard(d.card) };
    }, fail),

  /** POST /events/{id}/quest/claims/{claim}/size: the claim as it stands now. */
  size: (eventId, claimId, label) =>
    apiClient.post(`${base(eventId)}/claims/${at(claimId)}/size`, { variant_label: label }).then((r) => {
      const claim = parseClaim(r?.data);
      if (!claim) throw apiFailure({ response: { status: 502, data: null } });
      return claim;
    }, fail),

  /** GET /events/{id}/quest/leaderboard?limit=: `{rows, me}`. */
  leaderboard: (eventId, limit = 20) => apiClient.get(`${base(eventId)}/leaderboard`, { params: { limit } }).then((r) => parseLeaderboard(r?.data), fail),
};
