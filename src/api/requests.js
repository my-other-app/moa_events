import apiClient from "./client";
import { apiFailure } from "@/utils/ticketing";
import { parseRequest, parseRequestList } from "@/utils/requests";

/**
 * Registration requests (an event whose club confirms each place), from the
 * browser. Each call throws apiFailure()'s shape ({status, code, errors,
 * message, network, retryAfter}); utils/requests.js reads the answers and
 * says what a refusal means.
 *
 * Which token goes along:
 *   a request by its link    none: the link's token is its only credential
 *   withdrawing it           none, for the same reason
 *   mine                     the account's when signed in, else the guest
 *                            token a registration left (the API answers for both)
 */

const at = (v) => encodeURIComponent(String(v));

const fail = (error) => {
  throw apiFailure(error);
};

const notFound = () => apiFailure({ response: { status: 404, data: { error_code: "REQUEST_NOT_FOUND" } } });

export const requestsApi = {
  /** The request a status link names, as parseRequest reads it. 404 when there is none. */
  byToken: (token) =>
    apiClient.get(`/api/v1/registration-requests/${at(token)}`, { skipAuth: true }).then((r) => {
      const request = parseRequest(r.data);
      if (!request) throw notFound();
      return request;
    }, fail),

  /** Withdraws it (pending, or confirmed and not yet paid): the request as it stands now. */
  withdraw: (token) =>
    apiClient.post(`/api/v1/registration-requests/${at(token)}/withdraw`, {}, { skipAuth: true }).then((r) => parseRequest(r.data), fail),

  /**
   * The reader's own requests, open ones first. Null from a server without
   * requests (404, 405): there is then nothing to show.
   */
  mine: () =>
    apiClient.get("/api/v1/registration-requests/mine").then(
      (r) => parseRequestList(r.data),
      (error) => {
        const f = apiFailure(error);
        if (f.status === 404 || f.status === 405) return null;
        throw f;
      },
    ),
};
