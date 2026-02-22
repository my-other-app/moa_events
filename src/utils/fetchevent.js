import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const fetchEvent = async (eventId) => {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/api/v1/events/info/${eventId}`
    );
    return response.data;
  } catch (error) {
    console.error(`❌ Error fetching event ${eventId}:`, error);
    return null;
  }
};
