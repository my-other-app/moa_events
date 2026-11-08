import apiClient from "./client";
import { apiFailure } from "@/utils/ticketing";
import { parseAnswersPage } from "@/utils/answers";

/**
 * The missing-answers page's calls (feature-register/missing-answers-contract.md
 * §2.3), from the browser:
 *
 *   GET  /api/v1/events/{eventId}/answers/{ref}?k=   what the club asks, and
 *                                                    what the person has
 *   POST the same, {answers: {key: value}}           the answers; the page as
 *                                                    it stands after
 *
 * With the link's key (`k`) nothing else goes along (skipAuth): the key is
 * the link's credential, whoever is signed in here. Without one, the
 * holder's own token does (the account's, or the guest token a registration
 * left: client.js).
 *
 * Each call throws apiFailure()'s shape, with the API's body as `data` (its
 * field errors); utils/answers.js says what a refusal means.
 */

const at = (v) => encodeURIComponent(String(v));
const path = (eventId, ref) => `/api/v1/events/${at(eventId)}/answers/${at(ref)}`;
const options = (k) => (k ? { params: { k }, skipAuth: true } : {});

const fail = (error) => {
  throw { ...apiFailure(error), data: error?.response?.data ?? null };
};

const notFound = () => ({ ...apiFailure({ response: { status: 404, data: null } }), data: null });

export const answersApi = {
  /** The page, as parseAnswersPage reads it. A 404 when the answer is no page at all. */
  read: (eventId, ref, k = "") =>
    apiClient.get(path(eventId, ref), options(k)).then((r) => {
      const page = parseAnswersPage(r.data);
      if (!page) throw notFound();
      return page;
    }, fail),

  /** The answers; the page as it stands now (null when the answer doesn't read as one: they were still saved). */
  save: (eventId, ref, k = "", answers = {}) => apiClient.post(path(eventId, ref), { answers }, options(k)).then((r) => parseAnswersPage(r.data), fail),
};
