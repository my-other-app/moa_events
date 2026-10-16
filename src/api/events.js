import apiClient from "./client";

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
     * A guest token left by an earlier registration goes along when there is
     * one. If the server no longer takes it (the guest was folded into an app
     * account), client.js drops it and sends this once more without it; a
     * new guest's token in the answer replaces whatever was stored.
     */
    registerForEvent: async (eventId, data) => {
        try {
            const response = await apiClient.post(
                `/api/v1/events/registration/${eventId}/register`,
                data
            );

            const responseData = response.data;
            if (responseData.auth_token) {
                try {
                    localStorage.setItem("access_token", responseData.auth_token.access_token);
                    localStorage.setItem("refresh_token", responseData.auth_token.refresh_token);
                } catch (e) {
                    console.error("Error storing tokens:", e);
                }
            }
            return responseData;
        } catch (error) {
            console.error("Failed to submit form:", error);
            // The server's own words when it sent some, and what the form needs
            // to show them well: the status (409 = already registered), the
            // body (field errors), and whether it answered at all.
            const data = error.response?.data ?? null;
            const said = typeof data?.message === "string" ? data.message : typeof data?.detail === "string" ? data.detail : null;
            const e = new Error(said || (error.response ? "Registration failed" : "Network error"));
            e.status = error.response?.status ?? 0;
            e.data = data;
            e.network = !error.response;
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
