import axios from "axios";
import { withRefreshLock } from "@/auth/refreshlock";
import { clearSession, forgetGuestTokens, getSession, guestToken, isExpiring, sameSession, syncSession, updateSession } from "@/auth/session";
import { API_BASE_URL } from "@/config";

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
    },
});

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

/*
 * The API rotates the refresh token: every refresh answers with a new one
 * (kept; it expires when the old one would have) and spends the one sent.
 * A spent token shown again within 30 seconds gets the same new pair; after
 * that the API takes it as stolen, answers 401 SESSION_REUSED and ends the
 * session in every tab. So:
 *
 *   - one refresh at a time in a tab (`refreshing`, shared by every request
 *     that needs it), and one at a time across tabs (auth/refreshlock.js);
 *   - inside the lock the session is read again from storage: a tab that
 *     waited (or slept in the background) while another refreshed takes the
 *     tokens that tab stored, and sends nothing;
 *   - a request refused with a token another tab has since replaced is sent
 *     again with the stored one, without a refresh.
 */

let refreshing = null;

/** 401/403 (and a malformed request) mean the session is over; anything else may pass. */
const refused = (status) => status === 400 || status === 401 || status === 403 || status === 422;

/** A refresh that hangs would hold every tab's refresh behind the lock: it gives up and counts as offline. */
export const REFRESH_TIMEOUT_MS = 20 * 1000;

const errorCode = (error) => {
    const code = error?.response?.data?.error_code;
    return typeof code === "string" ? code : null;
};

/**
 * Refusals that end the session with something to tell the person:
 * SESSION_REUSED (the API saw this session's refresh token used twice and
 * ended it everywhere) and CLUB_NOT_VERIFIED (a club's account, which isn't
 * an attendee's and doesn't sign in here).
 */
const NOTICE_FOR = { SESSION_REUSED: "reused", CLUB_NOT_VERIFIED: "club" };

const notSignedIn = () => Object.assign(new Error("Not signed in"), { signedOut: true });

async function refresh(session) {
    try {
        const res = await apiClient.post("/api/v1/auth/refresh", new URLSearchParams({ token: session.refresh_token }), {
            skipAuth: true,
            timeout: REFRESH_TIMEOUT_MS,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        const access = res?.data?.access_token;
        if (!access) throw Object.assign(new Error("No token came back"), { response: { status: 401 } });
        // Only onto the session that asked: not one signed out or replaced meanwhile.
        // The refresh token that came back replaces the one sent, which is spent now.
        if (getSession()?.refresh_token === session.refresh_token) {
            updateSession({ access_token: access, refresh_token: res.data.refresh_token || session.refresh_token });
        }
        return access;
    } catch (error) {
        const signedOut = refused(error?.response?.status);
        const reason = signedOut ? NOTICE_FOR[errorCode(error)] || null : null;
        const now = getSession();
        // A reused token ends the whole session on the server, whichever of its tokens this tab holds now;
        // any other refusal ends only the tokens it was sent with.
        const ours = reason ? sameSession(now, session) : now?.refresh_token === session.refresh_token;
        if (signedOut && ours) clearSession(reason);
        throw Object.assign(error instanceof Error ? error : new Error("Refresh failed"), { signedOut, reason });
    }
}

/** Inside the lock every tab shares: storage first, the network only if no other tab has refreshed meanwhile. */
function refreshShared(started) {
    return withRefreshLock(async () => {
        const now = syncSession();
        // Signed out in another tab while this one waited.
        if (!now) throw notSignedIn();
        // Another tab refreshed (or signed in afresh) since this one set out: its tokens, and no refresh.
        const moved = now.refresh_token !== started.refresh_token || now.access_token !== started.access_token;
        if (moved && !isExpiring(now.access_token)) return now.access_token;
        return refresh(now);
    });
}

/** A fresh access token for the signed-in session; one refresh at a time in this tab, shared, and one at a time across tabs. */
export function refreshAccess() {
    const session = getSession();
    if (!session) return Promise.reject(notSignedIn());
    if (!refreshing) refreshing = refreshShared(session).finally(() => (refreshing = null));
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
                config._sentWith = session.access_token;
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
        const status = error?.response?.status;
        if (!config || config.skipAuth) return Promise.reject(error);

        // A club's account is signed in here (an older site let one in): clubs
        // sign in on their dashboard, never as an attendee. Signed out, with a
        // word why; a read goes on as a visitor.
        if (status === 403 && config._as === "user" && errorCode(error) === "CLUB_NOT_VERIFIED") {
            if (getSession()?.access_token === config._sentWith) clearSession("club");
            return isRead(config) ? asVisitor(config) : Promise.reject(Object.assign(error, { clubAccount: true }));
        }
        if (status !== 401) return Promise.reject(error);

        // The account's token was refused.
        if (config._as === "user") {
            const now = syncSession();
            // Another tab refreshed after this was sent, so the token it went
            // with was an old one: once more with the token stored now, and no
            // refresh (this tab's refresh token may be the spent one).
            if (now && now.access_token !== config._sentWith && !config._retried) {
                return apiClient.request({ ...config, _retried: true });
            }
            // The token stored now was refused: refresh once and send it again.
            if (now && !config._refreshed) {
                try {
                    await refreshAccess();
                    return apiClient.request({ ...config, _refreshed: true, _retried: true });
                } catch (e) {
                    if (!e?.signedOut) return Promise.reject(error);
                }
            } else if (now && now.access_token === config._sentWith) {
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
