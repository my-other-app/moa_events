import apiClient from "./client";
import { apiFailure } from "@/utils/ticketing";
import { parseClaimPreview, parseMyProfile, parseSpeakerPage } from "@/utils/speakers";

/**
 * Speakers from the browser (feature-register/speakers-contract.md, prefix
 * /api/v1/speakers). Each call throws apiFailure()'s shape; utils/speakers.js
 * says what a refusal means.
 *
 * Which token goes along: the account's for following, claiming and the
 * speaker's own profile; the page itself is read with it too (`userOnly`),
 * so the API can say whether the reader follows them; a claim link is
 * looked at with none (the link is what it is about).
 */
const at = (v) => encodeURIComponent(String(v));

const fail = (error) => {
  throw apiFailure(error);
};

/** {following, followers} from a follow or unfollow, whatever the API sends back. */
const followState = (want) => (r) => {
  const o = r?.data && typeof r.data === "object" ? r.data : {};
  return {
    following: typeof o.following === "boolean" ? o.following : want,
    followers: typeof o.followers_count === "number" ? o.followers_count : null,
  };
};

export const speakersApi = {
  /** The public page as the signed-in reader sees it (with `following`). */
  page: (slug) =>
    apiClient.get(`/api/v1/speakers/${at(slug)}`, { userOnly: true }).then((r) => {
      const page = parseSpeakerPage(r.data);
      if (!page) throw apiFailure({ response: { status: 404, data: {} } });
      return page;
    }, fail),

  follow: (slug) => apiClient.post(`/api/v1/speakers/${at(slug)}/follow`, {}, { userOnly: true }).then(followState(true), fail),
  unfollow: (slug) => apiClient.delete(`/api/v1/speakers/${at(slug)}/follow`, { userOnly: true }).then(followState(false), fail),

  /** What a claim link is for: {profile, emailMasked, valid, reason, message}. */
  claimPreview: (token) =>
    apiClient.get(`/api/v1/speakers/claim/${at(token)}`, { skipAuth: true }).then((r) => {
      const preview = parseClaimPreview(r.data);
      if (!preview) throw apiFailure({ response: { status: 404, data: { error_code: "CLAIM_INVALID" } } });
      return preview;
    }, fail),

  /** Claims it for the signed-in account: {claimed, slug}. */
  claim: (token) => apiClient.post(`/api/v1/speakers/claim/${at(token)}`, {}, { userOnly: true }).then((r) => r.data || { claimed: true }, fail),

  /** The profile the signed-in account claimed. */
  me: () =>
    apiClient.get("/api/v1/speakers/me", { userOnly: true }).then((r) => {
      const p = parseMyProfile(r.data);
      if (!p) throw apiFailure({ response: { status: 404, data: { error_code: "NO_SPEAKER_PROFILE" } } });
      return p;
    }, fail),

  /** Changes it: {name?, headline?, bio?, links?, city?}; the profile as it stands back. */
  updateMe: (patch) => apiClient.patch("/api/v1/speakers/me", patch, { userOnly: true }).then((r) => parseMyProfile(r.data), fail),

  /** A new photo (multipart, the file as `photo`). */
  setMyPhoto: (file) => {
    const form = new FormData();
    form.append("photo", file);
    return apiClient.put("/api/v1/speakers/me/photo", form, { userOnly: true, headers: { "Content-Type": "multipart/form-data" } }).then((r) => parseMyProfile(r.data), fail);
  },
};
