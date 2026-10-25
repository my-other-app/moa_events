import apiClient from "./client";
import { isSignedIn, storeGuestTokens } from "@/auth/session";
import { apiFailure, parseOffer, parseTicketing, parseWaitlistEntry } from "@/utils/ticketing";

/**
 * Ticket types, discount codes and the waiting list (the API's
 * docs/TICKETING.md), from the browser. Each call throws apiFailure()'s
 * shape ({status, code, errors, message, network, retryAfter}) so the pages
 * can say what went wrong; the shapes they answer with are read in
 * utils/ticketing.js.
 *
 * Which token goes along:
 *   ticket types, the waiting list   the account's when signed in (it says
 *                                    the viewer's own places in line), never a guest's
 *   checking a code, an offer        none: public, the code or the link is enough
 *   claiming                         the account's, else the guest token a
 *                                    registration left (the server registers
 *                                    the offer's address either way)
 */

const at = (id) => encodeURIComponent(String(id));

const fail = (error) => {
  throw apiFailure(error);
};

export const ticketingApi = {
  /** The event's tickets: `ticketing` as parseTicketing reads it (null from an older server). `ticketType` lists a hidden type a link names. */
  types: (eventId, { ticketType = null } = {}) =>
    apiClient
      .get(`/api/v1/events/${at(eventId)}/ticket-types`, { userOnly: true, params: ticketType ? { ticket_type: ticketType } : undefined })
      .then((r) => parseTicketing(r.data), fail),

  /** What a code does to a ticket's price: {code, ticket_type_id, price, discount, amount, free}. Limited to 10 a minute. */
  checkCode: (eventId, { code, ticketTypeId = null, email = null, phone = null }) =>
    apiClient
      .post(
        `/api/v1/events/${at(eventId)}/discount-codes/check`,
        {
          code,
          ...(ticketTypeId ? { ticket_type_id: ticketTypeId } : {}),
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
        },
        { skipAuth: true },
      )
      .then((r) => r.data, fail),

  /** Joins the line for a sold-out type: the place, {id, ticketTypeId, status, position, created, …}. */
  joinWaitlist: (eventId, { ticketTypeId = null, name, email = null, phone = null, whatsapp = false }) =>
    apiClient
      .post(
        `/api/v1/events/${at(eventId)}/waitlist`,
        {
          ...(ticketTypeId ? { ticket_type_id: ticketTypeId } : {}),
          full_name: name,
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          whatsapp_opt_in: Boolean(whatsapp && phone),
        },
        { userOnly: true },
      )
      .then((r) => parseWaitlistEntry(r.data), fail),

  /** The signed-in person's places in line for the event. */
  myWaitlist: (eventId) =>
    apiClient
      .get(`/api/v1/events/${at(eventId)}/waitlist/me`, { userOnly: true })
      .then((r) => (Array.isArray(r.data) ? r.data.map(parseWaitlistEntry).filter(Boolean) : []), fail),

  /** Leaves every place in line the signed-in person has for the event: {left: n}. */
  leaveWaitlist: (eventId) => apiClient.delete(`/api/v1/events/${at(eventId)}/waitlist/me`, { userOnly: true }).then((r) => r.data, fail),

  /** A claim link's offer, as parseOffer reads it. */
  offer: (token) =>
    apiClient.get(`/api/v1/waitlist/offers/${at(token)}`, { skipAuth: true }).then((r) => {
      const offer = parseOffer(r.data);
      if (!offer) throw apiFailure({ response: { status: 404, data: { error_code: "OFFER_NOT_FOUND" } } });
      return offer;
    }, fail),

  /**
   * Claims the offered place: the registration's answer, as registering's
   * (pay_amount, event_registration_id, ticket_id, ticket_type, …). A guest's
   * session comes back as `auth_token`: kept as the guest token (as the
   * public form keeps it) when nobody is signed in here; for someone signed
   * in as another address it is handed back to pay with, never stored.
   */
  claim: (token, body) =>
    apiClient.post(`/api/v1/waitlist/offers/${at(token)}/claim`, body).then((r) => {
      const data = r.data || {};
      const asAccount = r.config?._as === "user" || isSignedIn();
      if (data.auth_token && !asAccount) storeGuestTokens(data.auth_token);
      return data;
    }, fail),

  /** Gives the place to the next person in line. */
  decline: (token) => apiClient.post(`/api/v1/waitlist/offers/${at(token)}/decline`, {}, { skipAuth: true }).then((r) => r.data, fail),
};
