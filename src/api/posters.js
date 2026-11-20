import apiClient from "./client";
import { apiFailure } from "@/utils/ticketing";
import { framingToApi, parsePoster, readRender } from "@/utils/poster";

/**
 * A guest's "I'm attending" poster (feature-register/posters/CONTRACT.md §6),
 * from the browser. Every call names the ticket and goes either:
 *
 *   with the link's key (`s`)   from the poster link in the ticket email, or
 *                               the `key` the first answer gives the holder:
 *                               nothing else goes along (skipAuth), whoever
 *                               is signed in here; or
 *   with the holder's token     the account's, or the guest token the
 *                               registration left (client.js): the ticket
 *                               page's own rule.
 *
 * The pictures (the guest's photo, the PNGs) are read as blobs and shown
 * from object URLs, never as <img src> on the API: the page's policy lets
 * pictures come from blob: and the API only as a connection, and a share
 * sheet needs the file itself anyway.
 *
 * Each call but `availability` and `note` throws apiFailure()'s shape, with
 * the API's body as `data`; utils/poster.js says what a refusal means.
 */

const at = (v) => encodeURIComponent(String(v));
const base = (ticket) => `/api/v1/posters/${at(ticket)}`;
const withKey = (s, extra = {}) => (s ? { ...extra, params: { ...(extra.params || {}), s }, skipAuth: true } : extra);

const fail = (error) => {
  throw { ...apiFailure(error), data: error?.response?.data ?? null, response: error?.response ?? undefined };
};

/** A poster body, or a refusal when the answer isn't one. */
const body = (r) => {
  const p = parsePoster(r?.data);
  if (!p) throw apiFailure({ response: { status: 502, data: null } });
  return p;
};

/** A render's state, with the HTTP status it came with (200 ready / 202 queued). */
const renderOf = (r) => ({ ...readRender(r?.data), http: r?.status ?? 200 });

const blobOf = (r) => {
  const b = r?.data;
  if (!b || typeof b !== "object" || !(b.size > 0)) throw apiFailure({ response: { status: 502, data: null } });
  return b;
};

export const postersApi = {
  /**
   * For the ticket page's button: the poster's state, or null for anything
   * but an answer (an older API, no connection, a ticket this browser may
   * not read). Never throws: the ticket shows no button then.
   */
  availability: (ticket) =>
    apiClient.get(base(ticket)).then(
      (r) => parsePoster(r?.data),
      () => null,
    ),

  /** GET /posters/{ticket}: the poster as it stands (§6.1). */
  read: (ticket, s = "") => apiClient.get(base(ticket), withKey(s)).then(body, fail),

  /** POST …/photo, multipart `file`: the cleaned photo replaces any before it; the framing starts again (§6.2). */
  upload: (ticket, s, blob, filename = "photo.jpg") => {
    const form = new FormData();
    form.append("file", blob, filename);
    return apiClient.post(`${base(ticket)}/photo`, form, withKey(s, { headers: { "Content-Type": "multipart/form-data" } })).then(body, fail);
  },

  /** GET …/photo: the guest's own photo, as the server keeps it (upright, cleaned). */
  photo: (ticket, s = "") => apiClient.get(`${base(ticket)}/photo`, withKey(s, { responseType: "blob" })).then(blobOf, fail),

  /** DELETE …/photo: gone now, with every poster made with it (§6.4). */
  removePhoto: (ticket, s = "") => apiClient.delete(`${base(ticket)}/photo`, withKey(s)).then(body, fail),

  /** PUT …/framing: where the photo sits in the frame; every format, unless one is named (§6.5). */
  frame: (ticket, s, framing, format = null) =>
    apiClient.put(`${base(ticket)}/framing`, { ...(format ? { format } : {}), ...framingToApi(framing) }, withKey(s)).then(body, fail),

  /** POST …/render: the PNG of a format, drawn or queued (§6.6). */
  render: (ticket, s, format) => apiClient.post(`${base(ticket)}/render`, { format }, withKey(s)).then(renderOf, fail),

  /** GET …/render/{format}: how the drawing is going (§6.7). */
  renderStatus: (ticket, s, format) => apiClient.get(`${base(ticket)}/render/${at(format)}`, withKey(s)).then(renderOf, fail),

  /** GET …/image/{format}: the PNG drawn for `fingerprint` (§6.8). */
  image: (ticket, s, format, fingerprint) =>
    apiClient.get(`${base(ticket)}/image/${at(format)}`, withKey(s, { responseType: "blob", params: fingerprint ? { v: fingerprint } : {} })).then(blobOf, fail),

  /** POST …/events: what the guest did with it, for the organiser's counts (§6.9). Never throws, never waited on. */
  note: (ticket, s, action, format = null) =>
    apiClient.post(`${base(ticket)}/events`, { action, ...(format ? { format } : {}) }, withKey(s)).then(
      () => true,
      () => false,
    ),
};
