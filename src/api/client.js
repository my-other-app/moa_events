import axios from "axios";
import { clearSession, forgetGuestTokens, getSession, guestToken, isExpiring, updateSession } from "@/auth/session";
import { API_BASE_URL } from "@/config";

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
    },
});

/** Drops the guest token a registration left behind; every page here works without one. */
export const forgetSession = forgetGuestTokens;

/*
 * Which token goes with a request:
 *
 *   signed in    the account's, always (refreshed first when it is about to
 *                expire). A guest token is never sent alongside or instead.
 *   signed out   the guest token a registration left, if there is one —
 *                except on `userOnly` requests (public reads that only care
 *                whether a signed-in person is reading) and `skipAuth` ones.
 *
 * A request that set out as the signed-in person never quietly goes on as a
 * guest: if the session can't be kept alive, a write is refused with
 * `authExpired` (so a registration can't land on a fresh guest by accident),
 * and only a read carries on as a plain visitor.
 */

const isRead = (config) => !config?.method || String(config.method).toLowerCase() === "get";

const authExpired = (config) =>
    Object.assign(new Error("Your sign-in has expired. Sign in again."), { authExpired: true, config, response: undefined });

/* ---------- keeping the account's session alive ---------- */

let refreshing = null;

/** 401/403 (and a malformed request) mean the session is over; anything else may pass. */
const refused = (status) => status === 400 || status === 401 || status === 403 || status === 422;

async function refresh(session) {
    try {
        const res = await apiClient.post("/api/v1/auth/refresh", new URLSearchParams({ token: session.refresh_token }), {
            skipAuth: true,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        const access = res?.data?.access_token;
        if (!access) throw Object.assign(new Error("No token came back"), { response: { status: 401 } });
        // Only onto the session that asked: not one signed out or replaced meanwhile.
        if (getSession()?.refresh_token === session.refresh_token) {
            updateSession({ access_token: access, refresh_token: res.data.refresh_token || session.refresh_token });
        }
        return access;
    } catch (error) {
        const signedOut = refused(error?.response?.status);
        if (signedOut && getSession()?.refresh_token === session.refresh_token) clearSession();
        throw Object.assign(error instanceof Error ? error : new Error("Refresh failed"), { signedOut });
    }
}

/** A fresh access token for the signed-in session; one refresh at a time, shared. */
export function refreshAccess() {
    const session = getSession();
    if (!session) return Promise.reject(Object.assign(new Error("Not signed in"), { signedOut: true }));
    if (!refreshing) refreshing = refresh(session).finally(() => (refreshing = null));
    return refreshing;
}

apiClient.interceptors.request.use(
    async (config) => {
        config._as = null;
        if (config.skipAuth) return config;
        let session = getSession();
        if (session) {
            if (isExpiring(session.access_token)) {
                try {
                    await refreshAccess();
                } catch {
                    // Offline: send what there is and let the server say. Signed out: see below.
                }
                session = getSession();
            }
            if (session) {
                config.headers.Authorization = `Bearer ${session.access_token}`;
                config._as = "user";
                return config;
            }
            // The session ended just now. A read goes on as a visitor; a write stops here.
            if (!isRead(config)) throw authExpired(config);
            return config;
        }
        if (config.userOnly) return config;
        const token = guestToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
            config._as = "guest";
        }
        return config;
    },
    (error) => Promise.reject(error)
);

const asVisitor = (config) => {
    delete config.headers.Authorization;
    return apiClient.request({ ...config, skipAuth: true });
};

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const config = error?.config;
        if (error?.response?.status !== 401 || !config || config.skipAuth) return Promise.reject(error);

        // The account's token was refused: refresh once and send it again.
        if (config._as === "user") {
            if (!config._refreshed) {
                try {
                    await refreshAccess();
                    return apiClient.request({ ...config, _refreshed: true });
                } catch (e) {
                    if (!e?.signedOut) return Promise.reject(error);
                }
            } else {
                // Refused even fresh: the session was ended elsewhere.
                clearSession();
            }
            return isRead(config) ? asVisitor(config) : Promise.reject(authExpired(config));
        }

        // A registration stores the guest token it was handed, and tokens age
        // out. Once one has, every public page was failing with a 401 it never
        // needed: the event page, the agenda, the shelf. On a 401 the stale
        // token is forgotten and the same request goes once more as a plain visitor.
        if (config._as === "guest") {
            forgetGuestTokens();
            return asVisitor(config);
        }
        return Promise.reject(error);
    }
);

export default apiClient;
