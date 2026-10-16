import apiClient from "./client";

const base = (eventId) => `/api/v1/events/${eventId}/competition`;

/** A registered guest's side of the competition: their team, the open ones, what to submit, the mentors' hours. */
export const competitionApi = {
    me: async (eventId) => (await apiClient.get(`${base(eventId)}/me`)).data,

    makeTeam: async (eventId, name, trackId) => (await apiClient.post(`${base(eventId)}/me/team`, { name, track_id: trackId ?? null })).data,

    joinTeam: async (eventId, teamId) => (await apiClient.post(`${base(eventId)}/me/team/join/${teamId}`)).data,

    leaveTeam: async (eventId) => (await apiClient.post(`${base(eventId)}/me/team/leave`)).data,

    renameTeam: async (eventId, patch) => (await apiClient.patch(`${base(eventId)}/me/team`, patch)).data,

    seeking: async (eventId, on, skills, note) => (await apiClient.put(`${base(eventId)}/me/seeking`, { on, skills, note: note || null })).data,

    submit: async (eventId, fields) => (await apiClient.put(`${base(eventId)}/me/submission`, { fields })).data,

    book: async (eventId, slotId) => (await apiClient.post(`${base(eventId)}/me/slots/${slotId}`)).data,

    free: async (eventId, slotId) => (await apiClient.delete(`${base(eventId)}/me/slots/${slotId}`)).data,

    leaderboard: async (eventId) => (await apiClient.get(`${base(eventId)}/leaderboard`, { skipAuth: true })).data,
};

export const errorLine = (error, fallback) => error?.response?.data?.message || fallback;
