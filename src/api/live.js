import apiClient from "./client";
import { liveKey } from "@/utils/live";

const keyed = () => ({ headers: { "X-Live-Key": liveKey() } });
const played = (playerKey) => ({ headers: { "X-Live-Player": playerKey } });
const base = (eventId) => `/api/v1/events/${eventId}/live`;

/** The room: the banner, the poll that is up, the questions, whether a quiz runs. */
export const liveApi = {
    fetchFeed: async (eventId) => (await apiClient.get(base(eventId), keyed())).data,

    ask: async (eventId, text, authorName) => (await apiClient.post(`${base(eventId)}/questions`, { text, author_name: authorName || null }, keyed())).data,

    vote: async (eventId, questionId) => (await apiClient.post(`${base(eventId)}/questions/${questionId}/vote`, {}, keyed())).data,

    respond: async (eventId, pollId, value) => (await apiClient.post(`${base(eventId)}/polls/${pollId}/respond`, { value }, keyed())).data,

    joinQuiz: async (code, name) => (await apiClient.post("/api/v1/live/quiz/join", { code, name })).data,

    playState: async (eventId, playerKey) => (await apiClient.get(`${base(eventId)}/quiz/play`, played(playerKey))).data,

    answer: async (eventId, playerKey, optionKey) => (await apiClient.post(`${base(eventId)}/quiz/answer`, { option_key: optionKey }, played(playerKey))).data,

    fetchSurvey: async (eventId, registrationId, k) => (await apiClient.get(`/api/v1/events/${eventId}/feedback/${registrationId}`, { params: { k } })).data,

    submitSurvey: async (eventId, registrationId, k, answers) => (await apiClient.post(`/api/v1/events/${eventId}/feedback/${registrationId}`, { answers }, { params: { k } })).data,
};

/** What the API said, or a plain line. */
export const errorLine = (error, fallback) => error?.response?.data?.message || fallback;
