import apiClient from "./client";
import { liveKey } from "@/utils/live";

const keyed = () => ({ headers: { "X-Live-Key": liveKey() } });
const played = (playerKey) => ({ headers: { "X-Live-Player": playerKey } });
const base = (eventId) => `/api/v1/events/${eventId}/live`;

/** Set once the API was found to have no strip of its own (one from before it): the strip is read from the feed. */
let noBanner = false;

const fetchFeed = async (eventId) => (await apiClient.get(base(eventId), keyed())).data;

/**
 * The event page's strip: the event's status, the banner, the poll that is
 * up, whether the quiz runs and whether the floor has questions — a few
 * hundred bytes, the same for everyone (no key, no sign-in), where the feed
 * is ~30 KB. An API from before it answers 404: the feed then, for the rest
 * of the visit (it has the same fields).
 */
const fetchBanner = async (eventId) => {
    if (!noBanner) {
        try {
            return (await apiClient.get(`${base(eventId)}/banner`, { skipAuth: true })).data;
        } catch (error) {
            const status = error?.response?.status;
            if (status !== 404 && status !== 405) throw error;
        }
    }
    const feed = await fetchFeed(eventId);
    noBanner = true;
    return feed;
};

/** For tests: forget that the strip was found missing. */
export const resetBannerForTests = () => {
    noBanner = false;
};

/**
 * The room: the banner, the poll that is up, the questions, whether a quiz
 * runs. A visitor signed in (or holding a registration's guest token) is sent
 * as that person: their vote, question and poll answer are theirs on every
 * device.
 */
export const liveApi = {
    fetchFeed,

    fetchBanner,

    ask: async (eventId, text, authorName) => (await apiClient.post(`${base(eventId)}/questions`, { text, author_name: authorName || null }, keyed())).data,

    vote: async (eventId, questionId) => (await apiClient.post(`${base(eventId)}/questions/${questionId}/vote`, {}, keyed())).data,

    respond: async (eventId, pollId, value) => (await apiClient.post(`${base(eventId)}/polls/${pollId}/respond`, { value }, keyed())).data,

    /** With this browser's key: joining again from it (a reload, a second tab) is the same player. */
    joinQuiz: async (code, name) => (await apiClient.post("/api/v1/live/quiz/join", { code, name, player_key: liveKey() })).data,

    playState: async (eventId, playerKey) => (await apiClient.get(`${base(eventId)}/quiz/play`, played(playerKey))).data,

    answer: async (eventId, playerKey, optionKey) => (await apiClient.post(`${base(eventId)}/quiz/answer`, { option_key: optionKey }, played(playerKey))).data,

    fetchSurvey: async (eventId, registrationId, k) => (await apiClient.get(`/api/v1/events/${eventId}/feedback/${registrationId}`, { params: { k } })).data,

    submitSurvey: async (eventId, registrationId, k, answers) => (await apiClient.post(`/api/v1/events/${eventId}/feedback/${registrationId}`, { answers }, { params: { k } })).data,
};

/** What the API said, or a plain line. */
export const errorLine = (error, fallback) => error?.response?.data?.message || fallback;
