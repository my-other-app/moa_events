const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const fetchTicketDetails = async (ticketId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/events/tickets/${ticketId}`);
    if (!response.ok) {
      throw new Error("Failed to fetch ticket details");
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching ticket details:", error);
    return null;
  }
};
