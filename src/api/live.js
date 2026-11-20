import apiClient from "./client";
import { LIVE_VERSION, liveKey } from "@/utils/live";

/**
 * This site reads the live room as a client of the customisable room
 * (CONTRACT.md 0.3): every live call says so with `X-Live-Version: 2`, and
 * the API then answers with the question and poll kinds, the round's state
 * and the theme. An API from before ignores the header and answers as it
 * always did; every new field is optional here, so the room and the quiz
 * still work on it exactly as before.
 */
export { LIVE_VERSION };
const V2 = { "X-Live-Version": LIVE_VERSION };

const keyed = () => ({ headers: { "X-Live-Key": liveKey(), ...V2 } });
const played = (playerKey) => ({ headers: { "X-Live-Player": playerKey, ...V2 } });
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
 * What a player sends for the question's kind (CONTRACT 5.3): a key alone
 * (single, true/false, a poll question, and every client from before), or
 * the kind's own field (`option_keys`, `text`, `order`).
 */
const answerBody = (response) => {
    if (typeof response === "string") return { option_key: response };
    if (response && typeof response === "object") {
        for (const field of ["option_key", "option_keys", "text", "order"]) {
            if (response[field] != null) return { [field]: response[field] };
        }
    }
    return { option_key: response };
};

/** A poll answer: today's `{value}`, or a multiple choice's `values`, a ranking's `order`, an open text's `name` beside its value. */
const respondBody = (answer) => {
    if (answer && typeof answer === "object" && !Array.isArray(answer)) {
        const out = {};
        for (const field of ["value", "values", "order", "name"]) if (answer[field] != null && answer[field] !== "") out[field] = answer[field];
        return out;
    }
    return { value: answer };
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

    respond: async (eventId, pollId, answer) => (await apiClient.post(`${base(eventId)}/polls/${pollId}/respond`, respondBody(answer), keyed())).data,

    /**
     * With this browser's key: joining again from it (a reload, a second tab,
     * the next round) is the same person. `team`: a round whose players pick
     * their team; left out, the API assigns one.
     */
    joinQuiz: async (code, name, team) =>
        (await apiClient.post("/api/v1/live/quiz/join", { code, name, player_key: liveKey(), ...(team ? { team } : {}) }, { headers: V2 })).data,

    playState: async (eventId, playerKey) => (await apiClient.get(`${base(eventId)}/quiz/play`, played(playerKey))).data,

    answer: async (eventId, playerKey, response) => (await apiClient.post(`${base(eventId)}/quiz/answer`, answerBody(response), played(playerKey))).data,

    /**
     * The room's theme, the same for everyone (CONTRACT 1.4): what the quiz
     * page draws in. null where the API has none to give (an API from before
     * themes answers 404).
     */
    fetchTheme: async (eventId) => {
        try {
            return (await apiClient.get(`${base(eventId)}/theme/public`, { skipAuth: true, headers: V2 })).data;
        } catch (error) {
            const status = error?.response?.status;
            if (status === 404 || status === 405) return null;
            throw error;
        }
    },

    fetchSurvey: async (eventId, registrationId, k) => (await apiClient.get(`/api/v1/events/${eventId}/feedback/${registrationId}`, { params: { k } })).data,

    submitSurvey: async (eventId, registrationId, k, answers) => (await apiClient.post(`/api/v1/events/${eventId}/feedback/${registrationId}`, { answers }, { params: { k } })).data,
};

/** What the API said, or a plain line. */
export const errorLine = (error, fallback) => error?.response?.data?.message || fallback;
