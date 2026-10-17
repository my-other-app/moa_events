import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import apiClient from "@/api/client";
import { accountApi } from "@/api/account";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./context";
import { resetPasswordResetForTests } from "./email";
import { getSession } from "./session";
import { PROFILE, accessToken, enableSignIn, resetAuth, signInAs, stubGoogle } from "@/test/auth";

/*
 * Signing in with an email and password, end to end through the real API
 * client: only the network is made up (axios's adapter), so which token goes
 * with each request, how the form is encoded and where the session is kept
 * are the site's own.
 */

const EMAIL_PROFILE = { ...PROFILE, id: 9, full_name: "Ravi Kumar", email: "ravi@example.org", username: "ravi", provider: "email", email_verified: false };
const VERIFIED_PROFILE = { ...EMAIL_PROFILE, email_verified: true };

let seen;
let routes;
let profile;
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
const form = (c) => Object.fromEntries(new URLSearchParams(c.data));
const json = (c) => JSON.parse(c.data);
const calls = (url) => seen.filter((r) => r.url === url);
const refused = (status, message, error_code = null, errors = null) => (c) => reply(c, status, { message, errors, error_code, track_id: null });

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <output data-testid="status">{auth.status}</output>
      <output data-testid="who">{auth.user ? `${auth.user.name} <${auth.user.email}>` : ""}</output>
      <output data-testid="verified">{auth.user ? String(auth.user.emailVerified) : ""}</output>
      <button type="button" onClick={() => auth.openSignIn({ reason: "tickets" })}>
        Open sign-in
      </button>
      <button type="button" onClick={() => auth.openVerify()}>
        Open verify
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
  resetPasswordResetForTests();
  enableSignIn();
  stubGoogle();
  window.scrollTo = vi.fn();
  seen = [];
  routes = [];
  profile = EMAIL_PROFILE;
  apiClient.defaults.adapter = vi.fn(async (config) => {
    const auth = config.headers.Authorization;
    seen.push({ method: config.method, url: config.url, auth, data: config.data, type: config.headers["Content-Type"] });
    for (const [match, answer] of routes) if (match(config)) return answer(config, auth);
    return reply(config, 404, { message: "Not Found" });
  });
  on("get", "/api/v1/user/profile/me", (c) => reply(c, 200, profile));
});
afterEach(() => {
  vi.useRealTimers();
  delete apiClient.defaults.adapter;
  resetAuth();
  resetPasswordResetForTests();
});
afterAll(() => vi.unstubAllEnvs());

/** Opens the sheet and the email form in it. */
async function openEmail() {
  fireEvent.click(screen.getByRole("button", { name: "Open sign-in" }));
  const sheet = await screen.findByRole("dialog", { name: "Sign in to see your tickets" });
  // Google first: its button, then "or", then email.
  expect(await within(sheet).findByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
  fireEvent.click(within(sheet).getByRole("button", { name: "Continue with email" }));
  await waitFor(() => expect(within(sheet).getByLabelText("Email")).toHaveFocus());
  return sheet;
}

const type = (sheet, label, value) => fireEvent.change(within(sheet).getByLabelText(label), { target: { value } });

describe("signing in with email", () => {
  it("trades the email and password for the account's tokens, once however many taps, and closes the sheet", async () => {
    const access = accessToken({ sid: "sess-9", user_id: 9 });
    let finish;
    on("post", "/api/v1/auth/token", (c, auth) => {
      expect(auth).toBeUndefined();
      expect(c.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(form(c)).toEqual({ username: "ravi@example.org", password: "hunter22" });
      return new Promise((resolve) => {
        finish = () => resolve(reply(c, 200, { access_token: access, refresh_token: "refresh-9", token_type: "Bearer" }));
      });
    });
    show();
    const sheet = await openEmail();
    expect(within(sheet).getByLabelText("Email")).toHaveAttribute("autocomplete", "username");
    expect(within(sheet).getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    type(sheet, "Email", "  ravi@example.org ");
    type(sheet, "Password", "hunter22");

    // The show-password toggle.
    const toggle = within(sheet).getByRole("button", { name: "Show password" });
    fireEvent.click(toggle);
    expect(within(sheet).getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(within(sheet).getByLabelText("Password")).toHaveAttribute("type", "password");

    const submit = within(sheet).getByRole("button", { name: "Sign in" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.submit(submit.closest("form"));
    await waitFor(() => expect(calls("/api/v1/auth/token")).toHaveLength(1));
    expect(await within(sheet).findByText("Signing you in…")).toBeInTheDocument();
    await act(async () => finish());

    await waitFor(() => expect(status()).toBe("signed-in"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls("/api/v1/auth/token")).toHaveLength(1);
    expect(screen.getByTestId("who").textContent).toBe("Ravi Kumar <ravi@example.org>");
    // The profile was asked for with the new token, before the session was kept: it arrives whole.
    expect(calls("/api/v1/user/profile/me")[0].auth).toBe(`Bearer ${access}`);
    expect(getSession()).toMatchObject({ access_token: access, refresh_token: "refresh-9", profile: { id: 9, provider: "email" } });
  });

  it("says a wrong password beside the password, and stays signed out", async () => {
    on("post", "/api/v1/auth/token", refused(401, "Incorrect username or password"));
    show();
    const sheet = await openEmail();
    type(sheet, "Email", "ravi@example.org");
    type(sheet, "Password", "wrong-one");
    fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));

    const password = within(sheet).getByLabelText("Password");
    await waitFor(() => expect(password).toHaveAttribute("aria-invalid", "true"));
    expect(password).toHaveFocus();
    const error = document.getElementById(password.getAttribute("aria-describedby").split(" ")[0]);
    expect(error).toHaveTextContent("That email and password don't match. If you joined with Google, use Continue with Google instead.");
    expect(error).toHaveAttribute("aria-live", "polite");
    expect(status()).toBe("signed-out");
    expect(localStorage.getItem("moa.session")).toBeNull();

    // Typing again clears it.
    type(sheet, "Password", "another");
    expect(password).not.toHaveAttribute("aria-invalid");
  });

  it("checks the email before sending anything", async () => {
    show();
    const sheet = await openEmail();
    type(sheet, "Email", "ravi@");
    fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));
    expect(await within(sheet).findByText("Enter a valid email address, like name@example.com.")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Email")).toHaveFocus();
    expect(within(sheet).getByText("Enter your password.")).toBeInTheDocument();
    expect(calls("/api/v1/auth/token")).toHaveLength(0);
  });

  it("says when there have been too many tries, in the server's words when it has any", async () => {
    on("post", "/api/v1/auth/token", (c) => reply(c, 429, { error: "Rate limit exceeded: 5 per 1 minute" }));
    show();
    const sheet = await openEmail();
    type(sheet, "Email", "ravi@example.org");
    type(sheet, "Password", "hunter22");
    fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Too many tries just now. Wait a minute, then try again.");

    on("post", "/api/v1/auth/token", refused(429, "Too many wrong passwords. Try again in 14 min.", "LOGIN_LOCKED"));
    fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(within(sheet).getByRole("alert")).toHaveTextContent("Too many wrong passwords. Try again in 14 min."));
  });

  it("won't sign in a club's dashboard login here, and ends the session it was handed", async () => {
    const access = accessToken({ sid: "sess-club" });
    on("post", "/api/v1/auth/token", (c) => reply(c, 200, { access_token: access, refresh_token: "refresh-club", token_type: "Bearer" }));
    on("get", "/api/v1/user/profile/me", refused(403, "Not Authorized"));
    on("delete", "/api/v1/auth/sessions/sess-club", (c) => reply(c, 200, { message: "Session signed out" }));
    show();
    const sheet = await openEmail();
    type(sheet, "Email", "club@example.org");
    type(sheet, "Password", "club-pass");
    fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));
    const alert = await within(sheet).findByRole("alert");
    expect(alert).toHaveTextContent("This email signs in to a club's dashboard, not to a MyOtherApp account.");
    expect(within(alert).getByRole("link", { name: "Open the clubs dashboard" })).toHaveAttribute("href", expect.stringContaining("myotherapp.in"));
    expect(status()).toBe("signed-out");
    expect(localStorage.getItem("moa.session")).toBeNull();
    await waitFor(() => expect(calls("/api/v1/auth/sessions/sess-club")).toHaveLength(1));
    expect(calls("/api/v1/auth/sessions/sess-club")[0].auth).toBe(`Bearer ${access}`);
  });
});

describe("an account with a second factor", () => {
  it("asks for the authenticator's code, then sends it with the same email and password", async () => {
    const access = accessToken();
    profile = { ...VERIFIED_PROFILE, user_type: "admin" };
    on("post", "/api/v1/auth/token", (c) => {
      const f = form(c);
      if (!f.totp_code) return refused(401, "Enter the code from your authenticator app", "TOTP_REQUIRED")(c);
      if (f.totp_code !== "246810") return refused(401, "That code is not valid", "TOTP_INVALID")(c);
      expect(f).toEqual({ username: "ravi@example.org", password: "hunter22", totp_code: "246810" });
      return reply(c, 200, { access_token: access, refresh_token: "refresh-2fa", token_type: "Bearer" });
    });
    show();
    const sheet = await openEmail();
    type(sheet, "Email", "ravi@example.org");
    type(sheet, "Password", "hunter22");
    fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));

    expect(await within(sheet).findByRole("heading", { name: "Two-step verification" })).toBeInTheDocument();
    expect(within(sheet).getByText("Enter the code from your authenticator app.")).toBeInTheDocument();
    const code = within(sheet).getByLabelText("Code");
    await waitFor(() => expect(code).toHaveFocus());
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    // Google steps aside for a one-task view, with a way back.
    expect(within(sheet).queryByRole("button", { name: "Sign in with Google" })).toBeNull();
    expect(within(sheet).getByRole("button", { name: "Back" })).toBeInTheDocument();

    fireEvent.change(code, { target: { value: "111111" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(code).toHaveAttribute("aria-invalid", "true"));
    expect(within(sheet).getByText("That code is not valid.")).toBeInTheDocument();

    fireEvent.change(code, { target: { value: "246810" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(status()).toBe("signed-in"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls("/api/v1/auth/token")).toHaveLength(3);
  });
});

describe("making an account", () => {
  it("shows the password rule live, signs in, then takes the mailed code — pasted, and sent on its own", async () => {
    const access = accessToken({ user_id: 9 });
    localStorage.setItem("access_token", "guest-token");
    localStorage.setItem("refresh_token", "guest-refresh");
    on("post", "/api/v1/user/register", (c, auth) => {
      expect(auth).toBeUndefined();
      expect(json(c)).toEqual({ full_name: "Ravi Kumar", email: "ravi@example.org", password: "hunter22" });
      return reply(c, 200, { username: "ravi", access_token: access, refresh_token: "refresh-new", token_type: "Bearer" });
    });
    on("post", "/api/v1/auth/email/verify", (c, auth) => {
      expect(auth).toBe(`Bearer ${access}`);
      if (json(c).code !== "482913") return refused(400, "That code isn't right. 4 tries left.", "CODE_INVALID", { attempts_left: 4 })(c);
      profile = VERIFIED_PROFILE;
      return reply(c, 200, { email_verified: true, email_verified_at: "2026-10-17T12:00:00+05:30", merged: true, registrations_transferred: 2 });
    });
    show();
    const sheet = await openEmail();
    fireEvent.click(within(sheet).getByRole("button", { name: "Create an account" }));
    expect(await within(sheet).findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByLabelText("Full name")).toHaveFocus());
    expect(within(sheet).getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    const password = within(sheet).getByLabelText("Password");
    expect(password).toHaveAttribute("autocomplete", "new-password");

    const rule = within(sheet).getByText("At least 6 characters").closest("li");
    expect(rule).toHaveTextContent("not yet");
    type(sheet, "Full name", "Ravi Kumar");
    type(sheet, "Email", "ravi@example.org");
    type(sheet, "Password", "hunt");
    expect(rule).not.toHaveClass("is-met");
    fireEvent.click(within(sheet).getByRole("button", { name: "Create account" }));
    expect(await within(sheet).findByText("Your password needs at least 6 characters.")).toBeInTheDocument();
    expect(password).toHaveFocus();
    expect(calls("/api/v1/user/register")).toHaveLength(0);
    type(sheet, "Password", "hunter22");
    expect(rule).toHaveClass("is-met");
    expect(rule).toHaveTextContent("done");

    fireEvent.click(within(sheet).getByRole("button", { name: "Create account" }));
    expect(await within(sheet).findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(status()).toBe("signed-in");
    expect(screen.getByTestId("verified").textContent).toBe("false");
    // The server mailed the code with the sign-up: none asked for here, and the next one waits its minute.
    expect(calls("/api/v1/auth/email/send-code")).toHaveLength(0);
    expect(within(sheet).getByText(/send another in 1:00/)).toBeInTheDocument();
    expect(within(sheet).getByText(/Enter the 6.digit code we sent to/)).toHaveTextContent("ravi@example.org");
    // Unverified, the guest's tickets aren't the account's yet: its token waits (never sent while signed in).
    expect(localStorage.getItem("access_token")).toBe("guest-token");

    const boxes = within(sheet).getAllByRole("textbox", { name: /^Digit \d of 6$/ });
    expect(boxes).toHaveLength(6);
    await waitFor(() => expect(boxes[0]).toHaveFocus());
    expect(boxes[0]).toHaveAttribute("autocomplete", "one-time-code");

    // A wrong code: said, the boxes cleared for another go.
    fireEvent.paste(boxes[0], { clipboardData: { getData: () => "111 111" } });
    await waitFor(() => expect(within(sheet).getByText("That code isn't right. 4 tries left.")).toBeInTheDocument());
    expect(boxes.map((b) => b.value).join("")).toBe("");
    expect(boxes[0]).toHaveFocus();

    // Typed digit by digit, the last one sends it.
    "482913".split("").forEach((d, i) => fireEvent.change(boxes[i], { target: { value: d } }));
    expect(await within(sheet).findByRole("heading", { name: "Email verified" })).toBeInTheDocument();
    expect(within(sheet).getByText("We brought in 2 tickets you booked here as a guest.")).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "See my tickets" })).toHaveFocus();
    expect(calls("/api/v1/auth/email/verify").map((r) => json(r))).toEqual([{ code: "111111" }, { code: "482913" }]);
    await waitFor(() => expect(screen.getByTestId("verified").textContent).toBe("true"));
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("points an email that already has an account to signing in", async () => {
    on("post", "/api/v1/user/register", refused(400, "Invalid Request", null, { email: "email already exists" }));
    show();
    const sheet = await openEmail();
    fireEvent.click(within(sheet).getByRole("button", { name: "Create an account" }));
    await within(sheet).findByRole("heading", { name: "Create your account" });
    type(sheet, "Full name", "Ravi Kumar");
    type(sheet, "Email", "ravi@example.org");
    type(sheet, "Password", "hunter22");
    fireEvent.click(within(sheet).getByRole("button", { name: "Create account" }));
    expect(await within(sheet).findByText("There's already an account with this email.")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Email")).toHaveFocus();
    fireEvent.click(within(sheet).getByRole("button", { name: "Sign in instead" }));
    expect(await within(sheet).findByRole("heading", { name: "Sign in to see your tickets" })).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Email")).toHaveValue("ravi@example.org");
    await waitFor(() => expect(within(sheet).getByLabelText("Password")).toHaveFocus());
  });

  it("can verify later: the sheet closes and the account works as it is", async () => {
    on("post", "/api/v1/user/register", (c) => reply(c, 200, { username: "ravi", access_token: accessToken(), refresh_token: "r", token_type: "Bearer" }));
    show();
    const sheet = await openEmail();
    fireEvent.click(within(sheet).getByRole("button", { name: "Create an account" }));
    await within(sheet).findByRole("heading", { name: "Create your account" });
    type(sheet, "Full name", "Ravi Kumar");
    type(sheet, "Email", "ravi@example.org");
    type(sheet, "Password", "hunter22");
    fireEvent.click(within(sheet).getByRole("button", { name: "Create account" }));
    await within(sheet).findByRole("heading", { name: "Check your email" });

    fireEvent.click(within(sheet).getByRole("button", { name: "Verify later" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(status()).toBe("signed-in");
    expect(screen.getByTestId("verified").textContent).toBe("false");
    expect(calls("/api/v1/auth/email/verify")).toHaveLength(0);
  });
});

describe("verifying an existing account's email", () => {
  it("asks for a code as it opens, and waits out the server's resend throttle", async () => {
    signInAs({ profile: EMAIL_PROFILE });
    let sends = 0;
    on("post", "/api/v1/auth/email/send-code", (c) => {
      sends += 1;
      if (sends === 1) {
        return refused(429, "We just sent you a code. You can ask for another in 42 seconds.", "CODE_RECENTLY_SENT", { retry_after: 42 })(c);
      }
      return reply(c, 200, { sent: true, email: "ravi@example.org", expires_in: 900, retry_after: 60 });
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Open verify" }));
    const sheet = await screen.findByRole("dialog", { name: "Check your email" });
    expect(await within(sheet).findByText("We just sent you a code. You can ask for another in 42 seconds.")).toBeInTheDocument();
    expect(within(sheet).getByText(/send another in 0:4[12]/)).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /send another code/ })).toBeNull();
    expect(within(sheet).getByRole("textbox", { name: "Digit 1 of 6" })).toHaveFocus();
    // No Google here: it's for someone already signed in.
    expect(within(sheet).queryByRole("button", { name: "Sign in with Google" })).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(43 * 1000);
    });
    const again = within(sheet).getByRole("button", { name: "send another code" });
    fireEvent.click(again);
    fireEvent.click(again);
    expect(await within(sheet).findByText("We sent a new code. Only the newest one works.")).toBeInTheDocument();
    expect(within(sheet).getByText(/send another in 1:00/)).toBeInTheDocument();
    expect(sends).toBe(2);
    expect(calls("/api/v1/auth/email/send-code").every((r) => r.auth === `Bearer ${getSession().access_token}`)).toBe(true);
  });

  it("knows an address verified elsewhere meanwhile", async () => {
    signInAs({ profile: EMAIL_PROFILE });
    on("post", "/api/v1/auth/email/send-code", (c) => {
      // Verified in the app meanwhile: the server's profile says so too.
      profile = VERIFIED_PROFILE;
      return refused(409, "Your email is already verified.", "ALREADY_VERIFIED")(c);
    });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Open verify" }));
    const sheet = await screen.findByRole("dialog", { name: "Check your email" });
    expect(await within(sheet).findByRole("heading", { name: "Email verified" })).toBeInTheDocument();
    expect(within(sheet).getByText("Your email was already verified. You're all set.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("verified").textContent).toBe("true"));
  });
});

describe("forgetting a password", () => {
  it("sends a code, then the code and a new password sign in", async () => {
    const access = accessToken({ user_id: 9 });
    profile = VERIFIED_PROFILE;
    on("post", "/api/v1/auth/password/forgot", (c, auth) => {
      expect(auth).toBeUndefined();
      expect(json(c)).toEqual({ email: "ravi@example.org" });
      return reply(c, 200, { sent: true });
    });
    on("post", "/api/v1/auth/password/reset", (c) => {
      const body = json(c);
      if (body.code !== "135790") return refused(400, "That code has expired. Ask for a new one.", "CODE_EXPIRED", { attempts_left: 0 })(c);
      expect(body).toEqual({ email: "ravi@example.org", code: "135790", new_password: "brand-new-pw" });
      return reply(c, 200, { access_token: access, refresh_token: "refresh-reset", token_type: "Bearer" });
    });
    show();
    const sheet = await openEmail();
    type(sheet, "Email", "ravi@example.org");
    fireEvent.click(within(sheet).getByRole("button", { name: "Forgot password?" }));
    expect(await within(sheet).findByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    const email = within(sheet).getByLabelText("Email");
    expect(email).toHaveValue("ravi@example.org");
    await waitFor(() => expect(email).toHaveFocus());
    fireEvent.click(within(sheet).getByRole("button", { name: "Send code" }));

    expect(await within(sheet).findByRole("heading", { name: "Choose a new password" })).toBeInTheDocument();
    expect(within(sheet).getByText(/a 6.digit code is on its way/)).toHaveTextContent("ravi@example.org");
    expect(within(sheet).getByText(/Send another in 1:00/)).toBeInTheDocument();
    const boxes = within(sheet).getAllByRole("textbox", { name: /^Digit \d of 6$/ });
    await waitFor(() => expect(boxes[0]).toHaveFocus());
    const password = within(sheet).getByLabelText("New password");
    expect(password).toHaveAttribute("autocomplete", "new-password");

    // An old code: said beside the boxes, which clear.
    fireEvent.paste(boxes[0], { clipboardData: { getData: () => "000000" } });
    // A full code moves on to the password rather than sending without one.
    await waitFor(() => expect(password).toHaveFocus());
    type(sheet, "New password", "brand-new-pw");
    fireEvent.click(within(sheet).getByRole("button", { name: "Reset and sign in" }));
    expect(await within(sheet).findByText("That code has expired. Ask for a new one.")).toBeInTheDocument();
    expect(boxes.map((b) => b.value).join("")).toBe("");

    fireEvent.paste(boxes[0], { clipboardData: { getData: () => "Your code: 135790" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Reset and sign in" }));
    await waitFor(() => expect(status()).toBe("signed-in"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(getSession()).toMatchObject({ access_token: access, refresh_token: "refresh-reset" });
  });

  it("stops offering it when this server can't reset passwords (404)", async () => {
    // Nothing answers /auth/password/forgot: the adapter's 404.
    show();
    const sheet = await openEmail();
    type(sheet, "Email", "ravi@example.org");
    fireEvent.click(within(sheet).getByRole("button", { name: "Forgot password?" }));
    await within(sheet).findByRole("heading", { name: "Reset your password" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Send code" }));

    expect(await within(sheet).findByRole("heading", { name: "Sign in to see your tickets" })).toBeInTheDocument();
    expect(within(sheet).getByRole("status")).toHaveTextContent("You can't reset a password on the website just yet.");
    expect(within(sheet).queryByRole("button", { name: "Forgot password?" })).toBeNull();
    expect(calls("/api/v1/auth/password/forgot")).toHaveLength(1);

    // Still hidden the next time the sheet opens on this visit.
    fireEvent.click(within(sheet).getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const again = await openEmail();
    expect(within(again).queryByRole("button", { name: "Forgot password?" })).toBeNull();
  });
});

describe("one session, whichever way in", () => {
  it("keeps the email sign-in where Google's goes, refreshes it the same way, and signs out the same way", async () => {
    const soon = accessToken({ sid: "sess-mail", exp: Math.floor(Date.now() / 1000) + 5 });
    const fresh = accessToken({ sid: "sess-mail" });
    profile = VERIFIED_PROFILE;
    on("post", "/api/v1/auth/token", (c) => reply(c, 200, { access_token: soon, refresh_token: "refresh-mail", token_type: "Bearer" }));
    on("post", "/api/v1/auth/refresh", (c) => {
      expect(form(c)).toEqual({ token: "refresh-mail" });
      return reply(c, 200, { access_token: fresh, refresh_token: "refresh-mail", token_type: "Bearer" });
    });
    on("get", "/api/v1/user/following", (c) => reply(c, 200, { items: [], next: null }));
    on("delete", "/api/v1/auth/sessions/sess-mail", (c) => reply(c, 200, { message: "Session signed out" }));
    localStorage.setItem("access_token", "guest-token");
    show();
    const sheet = await openEmail();
    type(sheet, "Email", "ravi@example.org");
    type(sheet, "Password", "hunter22");
    fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(status()).toBe("signed-in"));

    // The same key Sign in with Google uses, read back as a fresh page load would.
    expect(JSON.parse(localStorage.getItem("moa.session"))).toMatchObject({ access_token: soon, refresh_token: "refresh-mail", profile: { email: "ravi@example.org" } });
    // A verified account: the guest's tickets are its own now.
    expect(localStorage.getItem("access_token")).toBeNull();

    // About to expire: refreshed first, then sent as the account (never as a guest).
    await accountApi.following();
    expect(calls("/api/v1/auth/refresh")).toHaveLength(1);
    expect(calls("/api/v1/user/following")[0].auth).toBe(`Bearer ${fresh}`);
    expect(getSession().access_token).toBe(fresh);

    fireEvent.click(screen.getByRole("button", { name: "Sign me out" }));
    expect(status()).toBe("signed-out");
    expect(localStorage.getItem("moa.session")).toBeNull();
    await waitFor(() => expect(calls("/api/v1/auth/sessions/sess-mail")).toHaveLength(1));
  });
});
