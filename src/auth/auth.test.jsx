import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import apiClient, { refreshAccess } from "@/api/client";
import { accountApi } from "@/api/account";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./context";
import { GSI_SRC } from "./google";
import { getNotice, getSession, reloadSessionForTests as reloadForTests } from "./session";
import { PROFILE, accessToken, enableSignIn, resetAuth, signInAs, stubGoogle } from "@/test/auth";

let seen;
let routes;
const reply = (config, status, data) => {
  if (status >= 400) {
    const error = new Error(`Request failed with status code ${status}`);
    error.config = config;
    error.response = { status, data, config };
    throw error;
  }
  return { data, status, statusText: "OK", headers: {}, config };
};
const on = (method, url, answer) => routes.unshift([(c) => c.method === method && c.url === url, answer]);

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <output data-testid="status">{auth.status}</output>
      <output data-testid="who">{auth.user ? `${auth.user.name} <${auth.user.email}>` : ""}</output>
      <button type="button" onClick={() => auth.openSignIn({ reason: "tickets" })}>
        Open sign-in
      </button>
      <button type="button" onClick={auth.signOut}>
        Sign me out
      </button>
    </div>
  );
}

const show = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );

const status = () => screen.getByTestId("status").textContent;

beforeEach(() => {
  resetAuth();
  enableSignIn();
  window.scrollTo = vi.fn();
  seen = [];
  routes = [];
  apiClient.defaults.adapter = vi.fn(async (config) => {
    const auth = config.headers.Authorization;
    seen.push({ method: config.method, url: config.url, auth, data: config.data });
    for (const [match, answer] of routes) if (match(config)) return answer(config, auth);
    return reply(config, 404, { message: "Not found" });
  });
  on("get", "/api/v1/user/profile/me", (c) => reply(c, 200, PROFILE));
});
afterEach(() => {
  delete apiClient.defaults.adapter;
  resetAuth();
});
afterAll(() => vi.unstubAllEnvs());

async function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: "Open sign-in" }));
  const sheet = await screen.findByRole("dialog", { name: "Sign in to see your tickets" });
  return sheet;
}

describe("signing in with Google", () => {
  it("trades Google's credential for the account's tokens, loads the profile and drops the guest token", async () => {
    const google = stubGoogle();
    const access = accessToken();
    localStorage.setItem("access_token", "guest-token");
    localStorage.setItem("refresh_token", "guest-refresh");
    on("post", "/api/v1/auth/google", (c, auth) => {
      expect(auth).toBeUndefined();
      expect(JSON.parse(c.data)).toEqual({ id_token: google.credential, platform: "web" });
      return reply(c, 200, { access_token: access, refresh_token: "refresh-1", token_type: "Bearer" });
    });
    show();
    expect(status()).toBe("signed-out");

    const sheet = await openSheet();
    expect(within(sheet).getByText("Your tickets in one place, on the web and in the app.")).toBeInTheDocument();
    // Google's own button, drawn by Google's script into the sheet.
    const button = await within(sheet).findByRole("button", { name: "Sign in with Google" });
    expect(google.id.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "000000000000-notarealclient.apps.googleusercontent.com", ux_mode: "popup", auto_select: false }),
    );
    expect(google.id.renderButton).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ type: "standard", text: "signin_with" }));

    fireEvent.click(button);
    await waitFor(() => expect(status()).toBe("signed-in"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("who").textContent).toBe("Asha Rao <asha@example.org>");
    expect(getSession()).toMatchObject({ access_token: access, refresh_token: "refresh-1", profile: { id: 7 } });
    // Stored for the next page load…
    expect(JSON.parse(localStorage.getItem("moa.session")).access_token).toBe(access);
    // …and the guest token is gone: its tickets are the account's now.
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    // The profile went with the new token.
    expect(seen.find((r) => r.url === "/api/v1/user/profile/me").auth).toBe(`Bearer ${access}`);
  });

  it("shows the server's words when it refuses, and stays signed out", async () => {
    stubGoogle();
    on("post", "/api/v1/auth/google", (c) => reply(c, 401, { message: "Invalid authentication credentials", error_code: null }));
    show();
    const sheet = await openSheet();
    fireEvent.click(await within(sheet).findByRole("button", { name: "Sign in with Google" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Invalid authentication credentials. Try again, or use another Google account.");
    expect(status()).toBe("signed-out");
    expect(getSession()).toBeNull();
  });

  it.each([
    [403, "This account has been suspended", "ACCOUNT_SUSPENDED", "This account has been suspended. If you think that's a mistake, write to support@myotherapp.in."],
    [401, "Invalid authentication credentials", "INVALID_GOOGLE_TOKEN", "Google's sign-in didn't go through — it may have timed out. Try again."],
    [
      401,
      "Google account email is not verified",
      "EMAIL_NOT_VERIFIED",
      "Google hasn't verified this account's email address yet. Verify it with Google first, or use another Google account.",
    ],
    [403, "Club is not verified", "CLUB_NOT_VERIFIED", "This email signs in to a club's dashboard, not to a MyOtherApp account."],
  ])("says a %i %s refusal (%s) in plain words, and stays signed out", async (code, message, errorCode, said) => {
    stubGoogle();
    on("post", "/api/v1/auth/google", (c) => reply(c, code, { message, errors: null, error_code: errorCode, track_id: null }));
    show();
    const sheet = await openSheet();
    fireEvent.click(await within(sheet).findByRole("button", { name: "Sign in with Google" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent(said);
    expect(status()).toBe("signed-out");
    expect(getSession()).toBeNull();
  });

  it("says when MyOtherApp can't be reached", async () => {
    stubGoogle();
    on("post", "/api/v1/auth/google", (c) => {
      const e = new Error("Network Error");
      e.config = c;
      throw e;
    });
    show();
    const sheet = await openSheet();
    fireEvent.click(await within(sheet).findByRole("button", { name: "Sign in with Google" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("We couldn't reach MyOtherApp. Check your connection and try again.");
  });

  it("says a server failure plainly, not as 'Internal Server Error'", async () => {
    stubGoogle();
    on("post", "/api/v1/auth/google", (c) => reply(c, 500, { message: "Internal Server Error" }));
    show();
    const sheet = await openSheet();
    fireEvent.click(await within(sheet).findByRole("button", { name: "Sign in with Google" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Something went wrong on our side. Try again in a moment.");
  });

  it("notices Google's window closing before a sign-in", async () => {
    const google = stubGoogle();
    // Google's real button is an iframe; focus moving into it is the click.
    google.id.renderButton.mockImplementation((el) => {
      const frame = document.createElement("iframe");
      frame.title = "Sign in with Google Button";
      el.appendChild(frame);
    });
    // The sheet starts listening for the page's focus in an effect that runs
    // after the button is ready, which can be a moment after the iframe shows.
    const listens = vi.spyOn(window, "addEventListener");
    show();
    const sheet = await openSheet();
    const frame = await waitFor(() => {
      const f = sheet.querySelector("iframe");
      expect(f).not.toBeNull();
      return f;
    });
    await waitFor(() => expect(listens).toHaveBeenCalledWith("focus", expect.any(Function)));
    listens.mockRestore();
    vi.useFakeTimers();
    try {
      frame.focus();
      act(() => {
        window.dispatchEvent(new Event("blur"));
        window.dispatchEvent(new Event("focus"));
      });
      act(() => vi.advanceTimersByTime(2000));
    } finally {
      vi.useRealTimers();
    }
    expect(within(sheet).getByRole("alert")).toHaveTextContent("The Google window closed before you finished signing in.");
  });

  it("offers to try again when Google's script can't load", async () => {
    show();
    const sheet = await openSheet();
    const script = await waitFor(() => {
      const s = document.head.querySelector(`script[src="${GSI_SRC}"]`);
      expect(s).not.toBeNull();
      return s;
    });
    act(() => {
      script.dispatchEvent(new Event("error"));
    });
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Google sign-in didn't load.");
    stubGoogle();
    fireEvent.click(within(sheet).getByRole("button", { name: "Try again" }));
    expect(await within(sheet).findByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
  });
});

describe("a session from an earlier visit", () => {
  it("is signed in straight away and refreshes the profile once", async () => {
    signInAs({ profile: { ...PROFILE, full_name: "Old Name" } });
    show();
    expect(status()).toBe("signed-in");
    expect(screen.getByTestId("who").textContent).toBe("Old Name <asha@example.org>");
    await waitFor(() => expect(screen.getByTestId("who").textContent).toBe("Asha Rao <asha@example.org>"));
    expect(seen.filter((r) => r.url === "/api/v1/user/profile/me")).toHaveLength(1);
  });

  it("falls back to signed out when the session can't be refreshed", async () => {
    signInAs({ access: "dead", refresh: "dead-refresh" });
    on("get", "/api/v1/user/profile/me", (c) => reply(c, 401, { message: "Token has expired" }));
    on("post", "/api/v1/auth/refresh", (c) => reply(c, 401, { message: "This session was signed out" }));
    show();
    await waitFor(() => expect(status()).toBe("signed-out"));
    expect(localStorage.getItem("moa.session")).toBeNull();
    expect(seen.filter((r) => r.url === "/api/v1/auth/refresh")).toHaveLength(1);
  });
});

describe("when the tokens rotate", () => {
  it("doesn't fetch the profile again: once per sign-in, not per refresh token", async () => {
    const soon = accessToken({ sid: "sess-1", exp: Math.floor(Date.now() / 1000) - 10 });
    signInAs({ access: accessToken({ sid: "sess-1" }), refresh: "refresh-1" });
    let n = 1;
    on("post", "/api/v1/auth/refresh", (c) => {
      n += 1;
      return reply(c, 200, { access_token: accessToken({ sid: "sess-1", exp: Math.floor(Date.now() / 1000) + 3600 + n }), refresh_token: `refresh-${n}` });
    });
    on("get", "/api/v1/user/following", (c) => reply(c, 200, { items: [], next: null }));
    show();
    await waitFor(() => expect(seen.filter((r) => r.url === "/api/v1/user/profile/me")).toHaveLength(1));

    // This tab refreshes: a new refresh token.
    await act(() => refreshAccess());
    expect(getSession().refresh_token).toBe("refresh-2");
    // Another tab refreshes: its new tokens arrive by the storage event.
    const next = { ...JSON.parse(localStorage.getItem("moa.session")), access_token: accessToken({ sid: "sess-1", exp: 9999999999 }), refresh_token: "refresh-9" };
    localStorage.setItem("moa.session", JSON.stringify(next));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "moa.session", newValue: JSON.stringify(next) }));
    });
    expect(getSession().refresh_token).toBe("refresh-9");
    // A request that refreshes first, on the way.
    signInAs({ access: soon, refresh: "refresh-9" });
    await act(() => accountApi.following());

    expect(seen.filter((r) => r.url === "/api/v1/auth/refresh")).toHaveLength(2);
    expect(status()).toBe("signed-in");
    expect(seen.filter((r) => r.url === "/api/v1/user/profile/me")).toHaveLength(1);
  });

  it("fetches it again for a different sign-in", async () => {
    signInAs({ access: accessToken({ sid: "sess-1" }) });
    show();
    await waitFor(() => expect(seen.filter((r) => r.url === "/api/v1/user/profile/me")).toHaveLength(1));
    const other = { access_token: accessToken({ sid: "sess-2" }), refresh_token: "refresh-x", profile: PROFILE, claims: null };
    localStorage.setItem("moa.session", JSON.stringify(other));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "moa.session", newValue: JSON.stringify(other) }));
    });
    await waitFor(() => expect(seen.filter((r) => r.url === "/api/v1/user/profile/me")).toHaveLength(2));
  });
});

describe("signed out for security (SESSION_REUSED)", () => {
  const SAID = "You were signed out for security — please sign in again.";

  it("signs out, says why once, and doesn't loop", async () => {
    stubGoogle();
    signInAs({ access: accessToken({ sid: "sess-1", exp: Math.floor(Date.now() / 1000) - 10 }), refresh: "refresh-1" });
    on("post", "/api/v1/auth/refresh", (c) =>
      reply(c, 401, { message: "This session was ended because its sign-in was used from two places. Sign in again.", error_code: "SESSION_REUSED" }),
    );
    on("get", "/api/v1/user/following", (c, auth) => (auth ? reply(c, 200, { items: [] }) : reply(c, 401, { message: "Not authenticated" })));
    on("get", "/api/v1/discover/home", (c) => reply(c, 200, { ok: true }));
    show();

    // The profile's refresh was refused as reused: signed out, here and in storage.
    await waitFor(() => expect(status()).toBe("signed-out"));
    expect(localStorage.getItem("moa.session")).toBeNull();
    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(SAID);

    // Nothing left to refresh with: more requests go as a visitor, and the notice stays the one.
    await act(() => apiClient.get("/api/v1/discover/home"));
    await act(() => accountApi.following().catch(() => null));
    expect(seen.filter((r) => r.url === "/api/v1/auth/refresh")).toHaveLength(1);
    expect(screen.getAllByRole("alert")).toHaveLength(1);

    // "Sign in" opens the sheet; dismissing it is for every tab.
    fireEvent.click(within(alerts[0]).getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("dialog", { name: "Sign in" })).toBeInTheDocument();
    fireEvent.click(within(alerts[0]).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(SAID)).toBeNull();
    expect(localStorage.getItem("moa.signedout")).toBeNull();
    expect(getNotice()).toBeNull();
  });

  it("goes when the person signs in again, and stays gone on the next page", async () => {
    const google = stubGoogle();
    signInAs({ access: accessToken({ sid: "sess-1", exp: Math.floor(Date.now() / 1000) - 10 }), refresh: "refresh-1" });
    on("post", "/api/v1/auth/refresh", (c) => reply(c, 401, { message: "Reused", error_code: "SESSION_REUSED" }));
    on("post", "/api/v1/auth/google", (c) => reply(c, 200, { access_token: accessToken({ sid: "sess-2" }), refresh_token: "refresh-new", token_type: "Bearer" }));
    show();
    await screen.findByText(SAID);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const sheet = await screen.findByRole("dialog", { name: "Sign in" });
    fireEvent.click(await within(sheet).findByRole("button", { name: "Sign in with Google" }));
    await waitFor(() => expect(status()).toBe("signed-in"));
    expect(google.id.initialize).toHaveBeenCalled();
    expect(screen.queryByText(SAID)).toBeNull();
    expect(localStorage.getItem("moa.signedout")).toBeNull();
  });

  it("is shown here too when another tab was signed out for it", async () => {
    signInAs({ access: accessToken({ sid: "sess-1" }) });
    show();
    expect(status()).toBe("signed-in");
    act(() => {
      localStorage.removeItem("moa.session");
      window.dispatchEvent(new StorageEvent("storage", { key: "moa.session", newValue: null }));
      localStorage.setItem("moa.signedout", JSON.stringify({ reason: "reused", at: Date.now() }));
      window.dispatchEvent(new StorageEvent("storage", { key: "moa.signedout", newValue: localStorage.getItem("moa.signedout") }));
    });
    expect(status()).toBe("signed-out");
    expect(screen.getByRole("alert")).toHaveTextContent(SAID);
  });

  it("isn't shown on a page loaded long after", async () => {
    localStorage.setItem("moa.signedout", JSON.stringify({ reason: "reused", at: Date.now() - 60 * 60 * 1000 }));
    resetAuthKeepingStorage();
    show();
    expect(screen.queryByText(SAID)).toBeNull();
  });
});

describe("a club's account", () => {
  it("is signed out with a word why when the API says CLUB_NOT_VERIFIED", async () => {
    signInAs({ access: accessToken({ sid: "sess-club", exp: Math.floor(Date.now() / 1000) - 10 }), refresh: "refresh-club" });
    on("post", "/api/v1/auth/refresh", (c) => reply(c, 403, { message: "Club is not verified", error_code: "CLUB_NOT_VERIFIED" }));
    show();
    await waitFor(() => expect(status()).toBe("signed-out"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("this is a club's account, and clubs sign in on the clubs dashboard, not here.");
    expect(within(alert).getByRole("link", { name: "Open the clubs dashboard" })).toHaveAttribute("href", expect.stringContaining("myotherapp.in"));
  });
});

/** A fresh page load over what storage holds now (resetAuth would clear it). */
function resetAuthKeepingStorage() {
  reloadForTests();
}

describe("signing out", () => {
  it("forgets the session here, ends it on the server and stops One Tap signing straight back in", async () => {
    const google = stubGoogle();
    const access = accessToken({ sid: "sess-42" });
    signInAs({ access });
    on("delete", "/api/v1/auth/sessions/sess-42", (c) => reply(c, 200, { message: "Session signed out" }));
    show();
    fireEvent.click(screen.getByRole("button", { name: "Sign me out" }));
    expect(status()).toBe("signed-out");
    expect(localStorage.getItem("moa.session")).toBeNull();
    expect(google.id.disableAutoSelect).toHaveBeenCalled();
    await waitFor(() => expect(seen.some((r) => r.method === "delete")).toBe(true));
    expect(seen.find((r) => r.method === "delete")).toMatchObject({ url: "/api/v1/auth/sessions/sess-42", auth: `Bearer ${access}` });
  });
});

describe("without a Google client id", () => {
  it("offers nothing and never loads Google's script", () => {
    resetAuth();
    signInAs();
    show();
    expect(status()).toBe("signed-out");
    fireEvent.click(screen.getByRole("button", { name: "Open sign-in" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.head.querySelector(`script[src="${GSI_SRC}"]`)).toBeNull();
  });
});
