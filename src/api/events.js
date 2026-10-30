import apiClient from "./client";
import { isSignedIn, storeGuestTokens } from "@/auth/session";

export const eventsApi = {
    /** What the event sells with its ticket; `{enabled:false, items:[]}` when nothing. */
    fetchStoreCatalog: async (eventId) => {
        try {
            const response = await apiClient.get(`/api/v1/events/${eventId}/store/catalog`);
            return response.data;
        } catch (error) {
            console.error(`Error fetching the store for event ${eventId}:`, error);
            return { enabled: false, items: [] };
        }
    },

    fetchEvent: async (eventId) => {
        try {
            const response = await apiClient.get(`/api/v1/events/info/${eventId}`);
            return response.data;
        } catch (error) {
            console.error(`❌ Error fetching event ${eventId}:`, error);
            return null;
        }
    },

    /**
     * Signed in, the account's token goes along and the registration is the
     * account's own: the server sends no token back, and none is stored.
     *
     * Signed out, a guest token left by an earlier registration goes along
     * when there is one. If the server no longer takes it (the guest was
     * folded into an app account), client.js drops it and sends this once
     * more without it; a new guest's token in the answer replaces whatever
     * was stored.
     */
    registerForEvent: async (eventId, data) => {
        try {
            const response = await apiClient.post(
                `/api/v1/events/registration/${eventId}/register`,
                data
            );

            const responseData = response.data;
            const asAccount = response.config?._as === "user" || isSignedIn();
            if (responseData.auth_token && !asAccount) storeGuestTokens(responseData.auth_token);
            return responseData;
        } catch (error) {
            console.error("Failed to submit form:", error);
            // The server's own words when it sent some, and what the form needs
            // to show them well: the status (409 = already registered), the
            // body (field errors), and whether it answered at all.
            const data = error.response?.data ?? null;
            const said = typeof data?.message === "string" ? data.message : typeof data?.detail === "string" ? data.detail : null;
            const e = new Error(said || (error.authExpired ? error.message : error.response ? "Registration failed" : "Network error"));
            e.status = error.response?.status ?? (error.authExpired ? 401 : 0);
            e.data = data;
            e.network = !error.response && !error.authExpired;
            e.authExpired = Boolean(error.authExpired);
            throw e;
        }
    },

    /** The run of show. Public; an empty list when the organiser has not written one. */
    fetchAgenda: async (eventId) => {
        try {
            const response = await apiClient.get(`/api/v1/events/${eventId}/agenda`);
            return response.data;
        } catch (error) {
            console.error(`Error fetching the agenda for ${eventId}:`, error);
            return null;
        }
    },

    fetchTicketDetails: async (ticketId) => {
        try {
            const response = await apiClient.get(`/api/v1/events/tickets/${ticketId}`);
            return response.data;
        } catch (error) {
            console.error("Error fetching ticket details:", error);
            return null;
        }
    },

    /**
     * The ticket as the club designed it: the server's own render of the
     * same template, payload and engine as the emailed PDF (GET
     * /events/tickets/{id}/image).
     *
     * It is read with the token, exactly as the ticket's details are — the
     * endpoint allows the ticket's holder, the owning club (or a co-host)
     * and an admin, and a QR is an entry pass, not a public picture. So it
     * cannot be an `<img src>`: that carries no Authorization header. It
     * comes back as a blob the caller shows from an object URL.
     *
     * The answer is `private, max-age=300` with an ETag, so the browser's
     * own cache does what the app does by hand: the same ticket opened
     * again costs a 304, or nothing at all.
     *
     * Null when the server won't draw it -- an older API, a failed render,
     * or a browser that may not read this ticket -- and the page falls back
     * to the ticket it draws itself rather than showing nothing.
     */
    fetchTicketImage: async (ticketId) => {
        try {
            const response = await apiClient.get(`/api/v1/events/tickets/${ticketId}/image`, { responseType: "blob" });
            const data = response?.data;
            return data && data.size !== 0 ? data : null;
        } catch (error) {
            console.error("Error fetching the rendered ticket:", error);
            return null;
        }
    },

    fetchCertificateStyle: async (ticketId) => {
        try {
            const response = await apiClient.get(`/api/v1/events/certificates/${ticketId}/style`);
            return response.data;
        } catch (error) {
            console.error("Error fetching certificate style:", error);
            return null;
        }
    },
};
