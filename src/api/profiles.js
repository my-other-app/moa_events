import apiClient from "./client";
import { API_BASE_URL } from "@/config";
import { apiFailure } from "@/utils/ticketing";
import { parsePublicProfile, parseSaveResult } from "@/utils/profiles";

/**
 * Profiles and the network from the browser
 * (feature-register/profiles-networking-contract.md). Each call throws
 * apiFailure()'s shape; utils/profiles.js says what a refusal means.
 *
 * The page's HTML is the profile as nobody sees it; these are what the
 * signed-in reader adds, each with their own token (`userOnly`: never a
 * guest's).
 */
const at = (v) => encodeURIComponent(String(v));

const fail = (error) => {
  throw apiFailure(error);
};

/** The vCard's address on the API: what "Save contact" opens for someone signed out. */
export const vcardUrl = (handle) => `${API_BASE_URL}/api/v1/profiles/${at(handle)}/vcard`;

export const profilesApi = {
  /** The profile as the signed-in reader sees it: their relation, and any section they may see. */
  page: (handle) =>
    apiClient.get(`/api/v1/profiles/${at(handle)}`, { userOnly: true }).then((r) => {
      const p = parsePublicProfile(r.data);
      if (!p) throw apiFailure({ response: { status: 404, data: {} } });
      return p;
    }, fail),

  /** Saves them to the reader's network, from their page: {saved, created, mutual, profile}. */
  save: (handle) => apiClient.post("/api/v1/network", { handle, method: "link" }, { userOnly: true }).then((r) => parseSaveResult(r.data), fail),

  /** The vCard as the reader may have it (email and phone only if they may see them), as a Blob. */
  vcard: (handle) =>
    apiClient.get(`/api/v1/profiles/${at(handle)}/vcard`, { userOnly: true, responseType: "blob", headers: { Accept: "text/vcard" } }).then((r) => r.data, fail),
};
