import apiClient from "./client";
import { apiFailure } from "@/utils/ticketing";
import { parseHelpAnswers, parseRequestDetail, parseRequestList, parseTopics } from "@/utils/help";

/**
 * The support desk, from the browser (feature-register/support-leads-contract.md,
 * prefix /api/v1/support). Each call throws apiFailure()'s shape ({status,
 * code, errors, message, network, retryAfter, trackId}); utils/help.js says
 * what a refusal means, and a 404 or 405 there means the API has no desk yet
 * (the page then says "email us", as the site did before).
 *
 * Which token goes along: the account's when signed in (the request is then
 * linked to the account, and "My requests" lists it), never a guest's
 * (`userOnly`): a guest gives their email instead. The survey link's token
 * is its only credential (`skipAuth`).
 */

const at = (v) => encodeURIComponent(String(v));

const fail = (error) => {
  throw apiFailure(error);
};

/** A read that a server without the desk answers 404 / 405: null, which means "no desk yet". */
const orNull = (parse) => [
  (r) => parse(r.data),
  (error) => {
    const f = apiFailure(error);
    if (f.status === 404 || f.status === 405) return null;
    throw f;
  },
];

export const supportApi = {
  /** The published answers, [{id, topic, question, answer}]; null without a desk. */
  help: () => apiClient.get("/api/v1/support/help", { skipAuth: true }).then(...orNull(parseHelpAnswers)),

  /** The topics a request can be about, [{key, label}]; null without a desk. */
  topics: () => apiClient.get("/api/v1/support/topics", { skipAuth: true }).then(...orNull(parseTopics)),

  /**
   * One screenshot (or PDF) for a request or a reply, kept privately until the
   * request is sent: {key, name, size}. Multipart, the file as `file`.
   */
  upload: (file) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient
      .post("/api/v1/support/uploads", form, { userOnly: true, headers: { "Content-Type": "multipart/form-data" } })
      .then((r) => {
        const o = Array.isArray(r.data) ? r.data[0] : r.data;
        if (!o || typeof o.key !== "string" || !o.key) throw apiFailure({ response: { status: 502, data: { message: "The upload didn't come back" } } });
        return { key: o.key, name: typeof o.name === "string" && o.name ? o.name : file.name, size: Number(o.size) || file.size || 0 };
      }, fail);
  },

  /**
   * A new request: {topic, subject?, message, attachments?: [key], email?, name?, context}.
   * {id, number, status} back.
   */
  send: (body) =>
    apiClient.post("/api/v1/support/requests", body, { userOnly: true }).then((r) => {
      const o = r.data && typeof r.data === "object" ? r.data : {};
      return { id: o.id ?? null, number: o.number ?? null, status: typeof o.status === "string" ? o.status : "new" };
    }, fail),

  /** The signed-in reader's requests; null without a desk. */
  mine: () => apiClient.get("/api/v1/support/requests", { userOnly: true }).then(...orNull(parseRequestList)),

  /** One of them, with its thread. 404 when it isn't theirs (or isn't there). */
  request: (id) =>
    apiClient.get(`/api/v1/support/requests/${at(id)}`, { userOnly: true }).then((r) => {
      const req = parseRequestDetail(r.data);
      if (!req) throw apiFailure({ response: { status: 404, data: {} } });
      return req;
    }, fail),

  /** A reply in the thread: {message, attachments?: [key]}. */
  reply: (id, body) => apiClient.post(`/api/v1/support/requests/${at(id)}/replies`, body, { userOnly: true }).then((r) => r.data, fail),

  /** "Did we solve it?" from the request's own page, signed in. */
  surveyMine: (id, body) => apiClient.post(`/api/v1/support/requests/${at(id)}/survey`, body, { userOnly: true }).then((r) => r.data, fail),

  /** "Did we solve it?" from the email's link: the token is its only credential. */
  survey: (token, body) => apiClient.post(`/api/v1/support/survey/${at(token)}`, body, { skipAuth: true }).then((r) => r.data, fail),
};

/** The For-clubs page's "Talk to us": a lead for the sales team. {ok: true} back. */
export const leadsApi = {
  talkToUs: (body) => apiClient.post("/api/v1/leads/talk-to-us", body, { skipAuth: true }).then((r) => r.data || { ok: true }, fail),
};
