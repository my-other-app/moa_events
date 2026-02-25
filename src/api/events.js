import apiClient from "./client";

export const eventsApi = {
    fetchEvent: async (eventId) => {
        try {
            const response = await apiClient.get(`/api/v1/events/info/${eventId}`);
            return response.data;
        } catch (error) {
            console.error(`❌ Error fetching event ${eventId}:`, error);
            return null;
        }
    },

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
            // To mimic original behavior, throw the error message
            throw new Error(error.response?.data?.message || "Unknown error");
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
