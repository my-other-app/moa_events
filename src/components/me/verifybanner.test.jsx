import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post, delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

const { AuthProvider } = await import("@/auth/AuthProvider");
const { MyTicketsPage } = await import("./mepages.jsx");
const { PROFILE, enableSignIn, resetAuth, signInAs, stubGoogle } = await import("@/test/auth");

/*
 * My tickets for a password account whose address isn't verified yet: a
 * quiet line offering the code, never a wall in front of the tickets.
 */

const UNVERIFIED = { ...PROFILE, id: 9, full_name: "Ravi Kumar", email: "ravi@example.org", provider: "email", email_verified: false };
const TICKET = {
  id: 901,
  name: "Hack Night 04",
  slug: "hack-night-04",
  poster: null,
  event_datetime: "2026-10-24T18:00:00+05:30",
  duration: 19,
  location_name: "Lab 3B",
  has_fee: false,
  is_online: false,
  club: { id: 3, name: "Circuit Society", slug: "circuit-society", logo: null },
  category: null,
  is_attended: false,
  ticket_id: "MOA7Q4K2X",
  certificate_url: null,
};
const GUEST_TICKET = { ...TICKET, id: 902, name: "CTF Night", slug: "ctf-night", ticket_id: "MOA8CTF01" };

let profile;
let upcoming;
const pageOf = (items) => ({ data: { limit: 20, offset: 0, total: null, next: null, items } });

const show = () =>
  render(
    <MemoryRouter initialEntries={["/me/tickets"]}>
      <AuthProvider>
        <Routes>
          <Route path="/me/tickets" element={<MyTicketsPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

const listCalls = () => get.mock.calls.filter(([url]) => url === "/api/v1/events/list").length;

beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  enableSignIn();
  stubGoogle();
  window.scrollTo = vi.fn();
  profile = UNVERIFIED;
  upcoming = [TICKET];
  get.mockImplementation(async (url, config) => {
    if (url === "/api/v1/user/profile/me") return { data: profile };
    if (url === "/api/v1/events/list") return pageOf(config.params.is_ended ? [] : upcoming);
    throw new Error(`unexpected GET ${url}`);
  });
  post.mockImplementation(async (url, body) => {
    if (url === "/api/v1/auth/email/send-code") return { data: { sent: true, email: "ravi@example.org", expires_in: 900, retry_after: 60 } };
    if (url === "/api/v1/auth/email/verify") {
      expect(body).toEqual({ code: "482913" });
      profile = { ...UNVERIFIED, email_verified: true };
      upcoming = [TICKET, GUEST_TICKET];
      return { data: { email_verified: true, email_verified_at: "2026-10-17T12:00:00+05:30", merged: true, registrations_transferred: 1 } };
    }
    throw new Error(`unexpected POST ${url}`);
  });
});
afterAll(() => {
  resetAuth();
  vi.unstubAllEnvs();
});

describe("My tickets, signed in with an unverified email", () => {
  it("offers verifying beside the tickets, and brings in the guest's tickets once verified", async () => {
    signInAs({ profile: UNVERIFIED });
    show();
    const line = await screen.findByText(/Verify your email to bring in tickets you booked here as a guest\./);
    // Never in the way: the tickets are there too.
    expect(await screen.findByRole("link", { name: "Hack Night 04" })).toBeInTheDocument();
    const before = listCalls();

    fireEvent.click(within(line.closest("div")).getByRole("button", { name: "Verify email" }));
    const sheet = await screen.findByRole("dialog", { name: "Check your email" });
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/auth/email/send-code"));
    expect(await within(sheet).findByText(/Enter the 6.digit code we sent to/)).toHaveTextContent("ravi@example.org");

    const boxes = within(sheet).getAllByRole("textbox", { name: /^Digit \d of 6$/ });
    fireEvent.paste(boxes[2], { clipboardData: { getData: () => "482913" } });
    expect(await within(sheet).findByRole("heading", { name: "Email verified" })).toBeInTheDocument();
    expect(within(sheet).getByText("We brought in 1 ticket you booked here as a guest.")).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("link", { name: "See my tickets" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.queryByText(/Verify your email to bring in/)).toBeNull());
    // Read again now the guest's tickets are the account's.
    expect(await screen.findByRole("link", { name: "CTF Night" })).toBeInTheDocument();
    expect(listCalls()).toBeGreaterThan(before);
  });

  it("can be left for later: the line stays, the tickets stay", async () => {
    signInAs({ profile: UNVERIFIED });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Verify email" }));
    const sheet = await screen.findByRole("dialog", { name: "Check your email" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Verify later" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/Verify your email to bring in/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hack Night 04" })).toBeInTheDocument();
  });
});

describe("My tickets, signed in otherwise", () => {
  it("says nothing about verifying to a Google account", async () => {
    profile = PROFILE;
    signInAs({ profile: { ...PROFILE, email_verified: true } });
    show();
    expect(await screen.findByRole("link", { name: "Hack Night 04" })).toBeInTheDocument();
    expect(screen.queryByText(/Verify your email/)).toBeNull();
  });

  it("asks a signed-out visitor to sign in with Google or email", async () => {
    show();
    expect(await screen.findByText(/Sign in with the Google account or email you use in the MyOtherApp app/)).toBeInTheDocument();
  });
});
