import apiClient from "./client";
import { apiFailure } from "@/utils/ticketing";
import { parseCancelInfo } from "@/utils/ticketcancel";

/**
 * Giving a ticket back by the email's link (feature-register/ticket-self-cancel-contract.md).
 * The link's token is its only credential: no sign-in goes along
 * (`skipAuth`). Throws apiFailure()'s shape.
 */
const at = (v) => encodeURIComponent(String(v));

export const ticketCancelApi = {
  /** What the link is for, and whether it can be used. */
  info: (token) =>
    apiClient.get(`/api/v1/tickets/cancel/${at(token)}`, { skipAuth: true }).then(
      (r) => {
        const info = parseCancelInfo(r.data);
        if (!info) throw apiFailure({ response: { status: 404, data: {} } });
        return info;
      },
      (error) => {
        throw apiFailure(error);
      },
    ),

  /** Gives it back, with the person's reason if they gave one. */
  cancel: (token, reason = "") =>
    apiClient.post(`/api/v1/tickets/cancel/${at(token)}`, reason ? { reason } : {}, { skipAuth: true }).then(
      (r) => r.data || { cancelled: true },
      (error) => {
        throw apiFailure(error);
      },
    ),
};
