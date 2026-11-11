import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { fullEvent } from "@/test/eventFixture";

/*
 * The signed-in and transactional pages are server-rendered now (their
 * client components draw a first paint on the server), so the HTML and the
 * browser's first render must agree, whoever is signed in and whatever is
 * in storage. Each page here is rendered to HTML, then hydrated, and React
 * must have nothing to say.
 */
vi.mock("@/api/events", () => ({
  eventsApi: {
    fetchEvent: vi.fn(() => Promise.resolve({ id: 123, additional_details: [], reg_fee: 250, is_registered: false })),
    fetchStoreCatalog: vi.fn(() => Promise.resolve({ enabled: false, items: [] })),
    registerForEvent: vi.fn(),
    fetchTicketDetails: vi.fn(() => new Promise(() => {})),
    fetchTicket: vi.fn(() => new Promise(() => {})),
  },
}));
vi.mock("@/api/live", () => ({
  errorLine: (e, f) => f,
  liveApi: { fetchFeed: vi.fn(() => new Promise(() => {})), playState: vi.fn(() => new Promise(() => {})), fetchSurvey: vi.fn(() => new Promise(() => {})) },
}));
vi.mock("@/api/speakers", () => ({ speakersApi: { claimPreview: vi.fn(() => new Promise(() => {})), me: vi.fn(() => new Promise(() => {})), page: vi.fn(() => new Promise(() => {})) } }));
vi.mock("@/api/support", () => ({
  supportApi: { topics: vi.fn(() => new Promise(() => {})), mine: vi.fn(() => new Promise(() => {})), request: vi.fn(() => new Promise(() => {})) },
  leadsApi: { talkToUs: vi.fn() },
}));
vi.mock("@/api/competition", () => ({ competitionApi: { leaderboard: vi.fn(() => new Promise(() => {})), me: vi.fn(() => new Promise(() => {})) } }));
const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn(), delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

const { hydrate } = await import("@/test/hydrate");
const { parseEventPage } = await import("@/api/discover");
const { AuthProvider } = await import("@/auth/AuthProvider");
const Register = (await import("./register/register.jsx")).default;
const { MyTicketsPage, FollowingPage } = await import("./me/mepages.jsx");
const Live = (await import("./live.jsx")).default;
const Compete = (await import("./compete.jsx")).default;
const Play = (await import("./play.jsx")).default;
const Feedback = (await import("./feedback.jsx")).default;
const Ticket = (await import("./ticket.jsx")).default;
const Claim = (await import("./claim.jsx")).default;
const RequestStatus = (await import("./request.jsx")).default;
const Answers = (await import("./answers.jsx")).default;
const { default: Certificate, OldCertificateAddress } = await import("./certificate.jsx");
const SpeakerClaim = (await import("./speakers/claim.jsx")).default;
const MySpeakerProfile = (await import("./speakers/myprofile.jsx")).default;
const { SpeakerFollow } = await import("./speakers/speakerislands.jsx");
const { HelpForm } = await import("./help/helpform.jsx");
const { MyRequests } = await import("./help/myrequests.jsx");
const RequestThread = (await import("./help/thread.jsx")).default;
const SurveyPage = (await import("./help/survey.jsx")).default;
const { PROFILE, enableSignIn, resetAuth, signInAs } = await import("@/test/auth");

const page = parseEventPage(fullEvent());
const at = (path, children) => (
  <MemoryRouter initialEntries={[path]}>
    <AuthProvider>{children}</AuthProvider>
  </MemoryRouter>
);

let mounted = null;
beforeEach(() => {
  resetAuth();
  enableSignIn();
  window.scrollTo = vi.fn();
  get.mockImplementation(async (url, config) => {
    if (url === "/api/v1/user/profile/me") return { data: PROFILE };
    if (url === "/api/v1/events/list") return { data: { items: [], next: null, offset: config?.params?.offset ?? 0 } };
    return { data: {} };
  });
});
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});
afterAll(() => {
  resetAuth();
  vi.unstubAllEnvs();
});

describe("the registration form", () => {
  it("hydrates signed out with a draft in storage, and shows it once the questions come", async () => {
    sessionStorage.setItem("moa.register.123", JSON.stringify({ values: { name: "Asha Rao", email: "asha@example.org", phone: "98765 43210" }, answers: {}, picks: {} }));
    mounted = await hydrate(at("/events/hack-night-04/register", <Register event={page.event} club={page.club} />));
    expect(mounted.html).toContain("Loading the form");
    expect(mounted.problems).toEqual([]);
    await waitFor(() => expect(within(mounted.host).getByLabelText(/^Full name/)).toHaveValue("Asha Rao"));
  });

  it("hydrates signed in (the server knows nobody), then fills in the account", async () => {
    signInAs();
    mounted = await hydrate(at("/events/hack-night-04/register", <Register event={page.event} club={page.club} />));
    expect(mounted.problems).toEqual([]);
    await waitFor(() => expect(within(mounted.host).getByLabelText(/^Email/)).toHaveValue("asha@example.org"));
  });

  it("hydrates with a ticket kept from before a reload, then shows it", async () => {
    sessionStorage.setItem("moa.register.done.123", JSON.stringify({ eventId: "123", ticket_id: "MOA77", name: "Asha Rao", email: "asha@example.org", paid: false, amount: 0 }));
    mounted = await hydrate(at("/events/hack-night-04/register", <Register event={page.event} club={page.club} />));
    expect(mounted.problems).toEqual([]);
    expect(await within(mounted.host).findByText("MOA77")).toBeInTheDocument();
  });
});

describe("My tickets and Following", () => {
  it("hydrate signed out, then ask to sign in", async () => {
    mounted = await hydrate(at("/me/tickets", <MyTicketsPage />));
    expect(mounted.html).toContain("Loading your tickets");
    expect(mounted.html).not.toContain("Your tickets, in one place");
    expect(mounted.problems).toEqual([]);
    expect(within(mounted.host).getByRole("heading", { level: 1, name: "Your tickets, in one place" })).toBeInTheDocument();
  });

  it("hydrate signed in without first saying 'sign in'", async () => {
    signInAs();
    mounted = await hydrate(at("/me/tickets", <MyTicketsPage />));
    expect(mounted.html).not.toContain("Your tickets, in one place");
    expect(mounted.problems).toEqual([]);
    expect(within(mounted.host).getByRole("heading", { level: 1, name: "My tickets" })).toBeInTheDocument();
    mounted.unmount();
    mounted = await hydrate(at("/me/following", <FollowingPage />));
    expect(mounted.problems).toEqual([]);
    expect(within(mounted.host).getByRole("heading", { level: 1, name: "Following" })).toBeInTheDocument();
  });
});

describe("the event's live room, competition, quiz, survey, ticket and certificate", () => {
  it.each([
    ["/events/hack-night-04/live", () => <Live eventId="123" eventSlug="hack-night-04" eventName="Hack Night 04" />, "Hack Night 04"],
    ["/events/hack-night-04/compete", () => <Compete eventId="123" eventSlug="hack-night-04" />, "Competition"],
    ["/play/123", () => <Play eventId="123" />, null],
    ["/feedback/123/reg-1?k=tok", () => <Feedback eventId="123" registrationId="reg-1" k="tok" />, null],
    ["/tickets/MOA-1", () => <Ticket ticketid="MOA-1" />, "Loading ticket details"],
    // A certificate's page, as the server checked it; and an older address, read in the browser.
    [
      "/certificates/q7Hb2_kLm9Zx-41PwT0aReXy",
      () => <Certificate id="q7Hb2_kLm9Zx-41PwT0aReXy" result={{ state: "valid", number: "CERT-7K3QF-X9PWM", attendeeName: "Ananya Iyer", eventName: "LAN Night", orgName: "Respawn Room", orgSlug: null, issuedAt: "2026-09-12T13:00:00Z" }} />,
      "CERT-7K3QF-X9PWM",
    ],
    ["/certificates/MOA-1", () => <OldCertificateAddress ticketId="MOA-1" />, "Opening your certificate"],
    // A waiting list's offer: who is signed in and the offer are the browser's to read.
    ["/claim/Xy3abcdefghijklmnopqrstuvwxyz012", () => <Claim token="Xy3abcdefghijklmnopqrstuvwxyz012" />, "Loading your offer"],
    // A request for a place: where it stands is the browser's to read.
    ["/requests/Rq7abcdefghijklmnopqrstuvwxyz012", () => <RequestStatus token="Rq7abcdefghijklmnopqrstuvwxyz012" />, "Loading your registration"],
    [
      "/answers/123/0b6e1f9a-4c1d-4d7e-9a51-1f2b3c4d5e6f?k=3f2a9c0d4e5b6a7f8091a2b3c4d5e6f7",
      () => <Answers eventId="123" answerRef="0b6e1f9a-4c1d-4d7e-9a51-1f2b3c4d5e6f" k="3f2a9c0d4e5b6a7f8091a2b3c4d5e6f7" />,
      "Loading your details",
    ],
  ])("%s hydrates without a mismatch", async (path, make, text) => {
    // The quiz's player is in storage: read once the page is up, never in the first paint.
    localStorage.setItem("moa.live.player.123", JSON.stringify({ player_key: "k", name: "Sneha" }));
    mounted = await hydrate(at(path, make()));
    expect(mounted.problems).toEqual([]);
    if (text) expect(mounted.html).toContain(text);
  });
});

describe("speakers", () => {
  it.each([
    ["/speakers/claim/Sp3abcdefghijklmnopqrstuv", () => <SpeakerClaim token="Sp3abcdefghijklmnopqrstuv" />, "Loading your invite"],
    ["/speakers/me", () => <MySpeakerProfile />, "Loading your speaker profile"],
    ["/speakers/asha-rao", () => <SpeakerFollow slug="asha-rao" name="Asha Rao" followers={4} />, "Follow"],
  ])("%s hydrates without a mismatch, signed out and in", async (path, make, text) => {
    mounted = await hydrate(at(path, make()));
    expect(mounted.problems).toEqual([]);
    expect(mounted.html).toContain(text);
    mounted.unmount();
    signInAs();
    mounted = await hydrate(at(path, make()));
    expect(mounted.problems).toEqual([]);
  });
});

describe("help", () => {
  it.each([
    // The form: the guest's boxes for everyone in the first paint; signed in, they give way after.
    ["/help?topic=payments&error_code=PAYMENT_ORDER_MISMATCH", () => (
      <>
        <HelpForm topics={[{ key: "payments", label: "Payments and refunds" }]} />
        <MyRequests />
      </>
    ), "Your email"],
    ["/help/requests/1042", () => <RequestThread id="1042" />, "Loading your request"],
    ["/help/survey/tok-abcdefghijklmnop?solved=yes", () => <SurveyPage token="tok-abcdefghijklmnop" solved />, "How did we do?"],
  ])("%s hydrates without a mismatch, signed out and in", async (path, make, text) => {
    mounted = await hydrate(at(path, make()));
    expect(mounted.problems).toEqual([]);
    expect(mounted.html).toContain(text);
    mounted.unmount();
    signInAs();
    mounted = await hydrate(at(path, make()));
    expect(mounted.problems).toEqual([]);
  });
});

describe("the head is the server's", () => {
  it("the pages set no title or robots tag of their own", async () => {
    document.title = "From the server";
    mounted = await hydrate(at("/me/tickets", <MyTicketsPage />));
    await screen.findByRole("heading", { level: 1, name: "Your tickets, in one place" });
    expect(document.title).toBe("From the server");
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});
