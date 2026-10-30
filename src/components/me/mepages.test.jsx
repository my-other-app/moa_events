import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post, delete: vi.fn(() => Promise.resolve({ data: {} })) } }));
// The checkout script is never fetched; window.Razorpay is ours.
vi.mock("@/utils/loadScript", () => ({ loadScript: vi.fn(() => Promise.resolve(true)) }));

const { AuthProvider } = await import("@/auth/AuthProvider");
const { FollowingPage, MyTicketsPage } = await import("./mepages.jsx");
const { PROFILE, enableSignIn, resetAuth, signInAs, stubGoogle } = await import("@/test/auth");

/** A row of GET /events/list?is_registered=true, as the API sends it. */
const row = (over = {}) => ({
  id: 901,
  name: "Hack Night 04",
  slug: "hack-night-04",
  poster: null,
  event_datetime: "2026-10-24T18:00:00+05:30",
  duration: 19,
  location_name: "Lab 3B, College of Engineering Pune",
  has_fee: true,
  has_prize: true,
  prize_amount: 50000,
  is_online: false,
  reg_startdate: "2026-09-20T10:00:00+05:30",
  reg_enddate: null,
  club: { id: 3, name: "Circuit Society", slug: "circuit-society", logo: null },
  category: { id: 9, name: "Hackathon", icon: null, icon_type: null },
  page_views: 120,
  is_attended: false,
  ticket_id: "MOA7Q4K2X",
  ticket_url: "https://myotherapp.in/tickets/MOA7Q4K2X",
  certificate_url: null,
  ...over,
});

const UPCOMING = [
  row(),
  row({
    id: 902,
    name: "CTF Night",
    slug: "ctf-night",
    is_online: true,
    location_name: null,
    event_datetime: "2026-11-02T20:00:00+05:30",
    ticket_id: "MOA8CTF01",
    club: { id: 4, name: "DOTSLASH", slug: "dotslash", logo: null },
  }),
];
const PAST = [
  row({
    id: 850,
    name: "Solder Sprint",
    slug: "solder-sprint",
    event_datetime: "2026-08-01T10:00:00+05:30",
    duration: 4,
    ticket_id: "MOA5OLD99",
    is_attended: true,
    certificate_url: "https://myotherapp.in/certificates/MOA5OLD99",
  }),
];
const pageOf = (items, next = null) => ({ data: { limit: 20, offset: 0, total: null, next, items } });

function answer({ upcoming = UPCOMING, past = PAST, clubs = [] } = {}) {
  get.mockImplementation(async (url, config) => {
    if (url === "/api/v1/user/profile/me") return { data: PROFILE };
    if (url === "/api/v1/events/list") return pageOf(config.params.is_ended ? past : upcoming);
    if (url === "/api/v1/user/following") return pageOf(clubs);
    throw new Error(`unexpected GET ${url}`);
  });
}

const show = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/me/tickets" element={<MyTicketsPage />} />
          <Route path="/me/following" element={<FollowingPage />} />
          <Route path="/events/:slug/register" element={<p>the registration form</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  window.scrollTo = vi.fn();
});
afterAll(() => {
  resetAuth();
  vi.unstubAllEnvs();
});

describe("My tickets, signed in", () => {
  beforeEach(() => {
    enableSignIn();
    signInAs();
  });

  it("shows a paid event still waiting for payment as that, not as a ticket", async () => {
    answer({
      upcoming: [row({ is_paid: false })],
      past: [row({ id: 851, name: "Old Unpaid", slug: "old-unpaid", event_datetime: "2026-08-02T10:00:00+05:30", ticket_id: "MOA5UNP01", is_paid: false })],
    });
    show("/me/tickets");
    const upcoming = await screen.findByRole("region", { name: /Upcoming/ });
    const pending = within(upcoming).getByRole("listitem");
    expect(within(pending).getByText("Awaiting payment")).toBeInTheDocument();
    expect(within(pending).getByRole("button", { name: "Finish payment for Hack Night 04" })).toBeInTheDocument();
    expect(within(pending).queryByRole("link", { name: /View ticket/ })).toBeNull();

    const old = within(screen.getByRole("region", { name: /Past/ })).getByRole("listitem");
    expect(within(old).getByText("Payment not completed")).toBeInTheDocument();
    expect(within(old).queryByRole("link", { name: /View ticket/ })).toBeNull();
    expect(within(old).queryByRole("button", { name: /Finish payment/ })).toBeNull();
  });

  it("lists upcoming and past tickets, each linking to its ticket and its event", async () => {
    answer();
    show("/me/tickets");
    expect(screen.getByRole("heading", { level: 1, name: "My tickets" })).toBeInTheDocument();
    expect(screen.getByText("asha@example.org")).toBeInTheDocument();

    const upcoming = await screen.findByRole("region", { name: /Upcoming/ });
    const rows = within(upcoming).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole("link", { name: "Hack Night 04" })).toHaveAttribute("href", "/events/hack-night-04");
    expect(within(rows[0]).getByRole("link", { name: "View ticket for Hack Night 04" })).toHaveAttribute("href", "/tickets/MOA7Q4K2X");
    expect(within(rows[0]).getByText("MOA7Q4K2X")).toBeInTheDocument();
    expect(within(rows[0]).getByText("by Circuit Society")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Lab 3B, College of Engineering Pune")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Online")).toBeInTheDocument();
    expect(within(rows[1]).getByRole("link", { name: "View ticket for CTF Night" })).toHaveAttribute("href", "/tickets/MOA8CTF01");

    const past = screen.getByRole("region", { name: /Past/ });
    const old = within(past).getByRole("listitem");
    expect(within(old).getByText("Attended")).toBeInTheDocument();
    expect(within(old).getByRole("link", { name: "Certificate for Solder Sprint" })).toHaveAttribute("href", "/certificates/MOA5OLD99");
    expect(within(old).getByRole("link", { name: "Solder Sprint" })).toHaveAttribute("href", "/events/solder-sprint");

    expect(get).toHaveBeenCalledWith("/api/v1/events/list", { params: { is_registered: true, is_ended: false, offset: 0, limit: 20 } });
    expect(get).toHaveBeenCalledWith("/api/v1/events/list", { params: { is_registered: true, is_ended: true, offset: 0, limit: 20 } });
  });

  it("leaves the head to the server (its title and noindex are the route's metadata)", async () => {
    answer();
    show("/me/tickets");
    await screen.findByRole("region", { name: /Upcoming/ });
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it("shows more when the API says there is more", async () => {
    get.mockImplementation(async (url, config) => {
      if (url === "/api/v1/user/profile/me") return { data: PROFILE };
      if (config.params.is_ended) return pageOf([]);
      return config.params.offset === 0 ? pageOf([UPCOMING[0]], "/api/v1/events/list?offset=20") : pageOf([UPCOMING[1]]);
    });
    show("/me/tickets");
    const upcoming = await screen.findByRole("region", { name: /Upcoming/ });
    expect(within(upcoming).getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(within(upcoming).getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(within(upcoming).getAllByRole("listitem")).toHaveLength(2));
    expect(get).toHaveBeenCalledWith("/api/v1/events/list", { params: { is_registered: true, is_ended: false, offset: 20, limit: 20 } });
    expect(within(upcoming).queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("with no tickets, says so and points to events", async () => {
    answer({ upcoming: [], past: [] });
    show("/me/tickets");
    expect(await screen.findByRole("heading", { name: "No tickets yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find events" })).toHaveAttribute("href", "/events");
    expect(screen.getByRole("link", { name: "Browse clubs" })).toHaveAttribute("href", "/clubs");
  });

  it("only past tickets: says nothing is coming up, with the way to find something", async () => {
    answer({ upcoming: [] });
    show("/me/tickets");
    const upcoming = await screen.findByRole("region", { name: /Upcoming/ });
    expect(within(upcoming).getByText(/Nothing coming up/)).toBeInTheDocument();
    expect(within(upcoming).getByRole("link", { name: "Find your next event" })).toHaveAttribute("href", "/events");
  });

  it("offers a retry when the tickets don't load", async () => {
    let fail = true;
    get.mockImplementation(async (url, config) => {
      if (url === "/api/v1/user/profile/me") return { data: PROFILE };
      if (fail) throw new Error("Network Error");
      return pageOf(config.params.is_ended ? PAST : UPCOMING);
    });
    show("/me/tickets");
    expect(await screen.findByText(/couldn't load your tickets/)).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: /Upcoming/ })).toBeInTheDocument();
  });
});

describe("Finish payment, from My tickets", () => {
  /** GET /events/info/901 for the signed-in person (backend#68): their unpaid registration's id. */
  const UNPAID = {
    id: 901,
    name: "Hack Night 04",
    has_fee: true,
    reg_fee: 250,
    // Registration closed a while ago: the form would refuse; paying the registration as it is doesn't.
    reg_enddate: "2026-10-01T23:59:00+05:30",
    is_registered: true,
    is_paid: false,
    registration_id: "reg-9",
    ticket_id: "MOA7Q4K2X",
  };
  const ORDER = { id: 5, razorpay_order_id: "order_9", amount: 25000, currency: "INR", status: "created", key_id: "rzp_test_club_not_real", gateway: "club" };
  const refusal = (status, message, error_code, errors = null) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { message, errors, error_code } } });

  let info;
  let paidNow;
  let razorpay;
  beforeEach(() => {
    enableSignIn();
    signInAs();
    info = UNPAID;
    paidNow = false;
    razorpay = null;
    window.Razorpay = vi.fn(function (options) {
      razorpay = options;
      this.open = vi.fn();
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    get.mockImplementation(async (url, config) => {
      if (url === "/api/v1/user/profile/me") return { data: PROFILE };
      if (url === "/api/v1/events/list") return pageOf(config.params.is_ended ? [] : [row({ is_paid: paidNow })]);
      if (url === "/api/v1/events/info/901") return { data: info };
      throw new Error(`unexpected GET ${url}`);
    });
  });
  afterEach(() => {
    delete window.Razorpay;
    vi.restoreAllMocks();
  });

  const button = async () => screen.findByRole("button", { name: "Finish payment for Hack Night 04" });
  const posted = () => post.mock.calls.map((c) => c[0]);

  it("pays the registration as it stands, past the deadline: its id and checkout=2, the order's own key, the check, then the list again", async () => {
    post.mockImplementation(async (url) => {
      if (url === "/api/v1/payments/orders") return { data: ORDER };
      if (url === "/api/v1/payments/verify") {
        paidNow = true;
        return { data: { payment_status: "captured" } };
      }
      throw new Error(`unexpected POST ${url}`);
    });
    show("/me/tickets");
    fireEvent.click(await button());
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));

    expect(get).toHaveBeenCalledWith("/api/v1/events/info/901");
    expect(post).toHaveBeenCalledWith(
      "/api/v1/payments/orders",
      { source: "event_registration", payload: { event_id: "901", event_registration_id: "reg-9" } },
      { params: { checkout: 2 } },
    );
    expect(razorpay).toMatchObject({ key: "rzp_test_club_not_real", order_id: "order_9", amount: 25000, prefill: { name: "Asha Rao", email: "asha@example.org", contact: "98765 43210" } });
    expect(window.Razorpay.mock.instances[0].open).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Opening payment/ })).toBeDisabled();

    await act(() => razorpay.handler({ razorpay_order_id: "order_9", razorpay_payment_id: "pay_9" }));
    expect(post).toHaveBeenCalledWith("/api/v1/payments/verify", { razorpay_order_id: "order_9", razorpay_payment_id: "pay_9" });
    expect(await screen.findByText("Payment received — your ticket for Hack Night 04 is ready.")).toBeInTheDocument();
    // Read again: the row is a ticket now.
    expect(await screen.findByRole("link", { name: "View ticket for Hack Night 04" })).toHaveAttribute("href", "/tickets/MOA7Q4K2X");
    expect(screen.queryByRole("button", { name: /Finish payment/ })).toBeNull();
    // The form was never sent again (it would be refused past the deadline).
    expect(posted()).toEqual(["/api/v1/payments/orders", "/api/v1/payments/verify"]);
  });

  it("counts 409 ALREADY_PAID from the order as paid: no checkout, the list again", async () => {
    post.mockImplementation(async () => {
      paidNow = true;
      throw refusal(409, "This registration is already paid for.", "ALREADY_PAID", { event_registration_id: "already paid" });
    });
    show("/me/tickets");
    fireEvent.click(await button());
    expect(await screen.findByText("Payment received — your ticket for Hack Night 04 is ready.")).toBeInTheDocument();
    expect(window.Razorpay).not.toHaveBeenCalled();
    expect(await screen.findByRole("link", { name: "View ticket for Hack Night 04" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("counts 409 ALREADY_PAID from the check as paid too", async () => {
    post.mockImplementation(async (url) => {
      if (url === "/api/v1/payments/orders") return { data: ORDER };
      paidNow = true;
      throw refusal(409, "This order is already paid.", "ALREADY_PAID");
    });
    show("/me/tickets");
    fireEvent.click(await button());
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));
    await act(() => razorpay.handler({ razorpay_order_id: "order_9", razorpay_payment_id: "pay_9" }));
    expect(await screen.findByText("Payment received — your ticket for Hack Night 04 is ready.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("counts 422 NOTHING_TO_PAY as nothing due", async () => {
    post.mockImplementation(async () => {
      paidNow = true;
      throw refusal(422, "There is nothing to pay for this registration.", "NOTHING_TO_PAY");
    });
    show("/me/tickets");
    fireEvent.click(await button());
    expect(await screen.findByRole("link", { name: "View ticket for Hack Night 04" })).toBeInTheDocument();
    expect(window.Razorpay).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("takes the form's old way when the server doesn't say which registration it is (before registration_id)", async () => {
    info = { id: 901, has_fee: true, is_registered: true, ticket_id: "MOA7Q4K2X" };
    show("/me/tickets");
    fireEvent.click(await button());
    expect(await screen.findByText("the registration form")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("says plainly when the event is over (EVENT_ENDED), and charges nothing", async () => {
    post.mockRejectedValue(refusal(409, "This event is over; it can no longer be paid for.", "EVENT_ENDED"));
    show("/me/tickets");
    fireEvent.click(await button());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This event is over");
    expect(alert).toHaveTextContent("It can't be paid for any more, so nothing was charged.");
    expect(window.Razorpay).not.toHaveBeenCalled();
    expect(await button()).not.toBeDisabled();
  });

  it.each([
    ["REGISTRATION_NOT_FOUND", 404, "We couldn't find your registration"],
    ["EVENT_NOT_FOUND", 404, "This event isn't available any more"],
    ["EVENT_FULL", 400, "This event filled up"],
  ])("says %s in words", async (code, status, title) => {
    post.mockRejectedValue(refusal(status, "refused", code));
    show("/me/tickets");
    fireEvent.click(await button());
    expect(await screen.findByRole("alert")).toHaveTextContent(title);
  });

  it("after a closed checkout, says the registration is kept and nothing was charged", async () => {
    post.mockResolvedValue({ data: ORDER });
    show("/me/tickets");
    fireEvent.click(await button());
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));
    act(() => razorpay.modal.ondismiss());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Payment not completed");
    expect(alert).toHaveTextContent("nothing was charged. Your registration is kept");
  });

  it.each([
    ["PAYMENT_ORDER_MISMATCH", 400, "That payment was for a different order", /write to support@myotherapp\.in before paying again/],
    ["UNSUPPORTED_PAYMENT_METHOD", 400, "That payment method isn't accepted here", /Pay with UPI, a card, netbanking or a wallet/],
    ["PAYMENT_NOT_FOUND", 404, "Razorpay hasn't confirmed your payment yet", /don't pay again/],
    ["ORDER_NOT_FOUND", 404, "We couldn't match your payment to its order", /your ticket will reach asha@example\.org/],
  ])("says a refused check (%s) in words", async (code, status, title, text) => {
    post.mockImplementation(async (url) => {
      if (url === "/api/v1/payments/orders") return { data: ORDER };
      throw refusal(status, "refused", code);
    });
    show("/me/tickets");
    fireEvent.click(await button());
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));
    await act(() => razorpay.handler({ razorpay_order_id: "order_9", razorpay_payment_id: "pay_9" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(title);
    expect(alert.textContent).toMatch(text);
  });
});

describe("My tickets, signed out", () => {
  it("asks to sign in, and the button opens the sign-in sheet", async () => {
    enableSignIn();
    stubGoogle();
    show("/me/tickets");
    expect(screen.getByRole("heading", { level: 1, name: "Your tickets, in one place" })).toBeInTheDocument();
    // The page's own button (the header has one too).
    fireEvent.click(within(screen.getByRole("main")).getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("dialog", { name: "Sign in to see your tickets" })).toBeInTheDocument();
    expect(get).not.toHaveBeenCalledWith("/api/v1/events/list", expect.anything());
  });

  it("points to the app in a build without sign-in", () => {
    show("/me/tickets");
    expect(screen.getByRole("heading", { level: 1, name: "Your tickets are in the app" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Google Play/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("Following", () => {
  it("lists the clubs the person follows as club cards", async () => {
    enableSignIn();
    signInAs();
    answer({
      clubs: [
        {
          id: 3,
          name: "Circuit Society",
          slug: "circuit-society",
          logo: null,
          location_name: "COEP, Pune",
          user_data: null,
          followers_count: 1241,
          is_following: true,
          interests: [{ id: 1, name: "Robotics" }],
        },
        { id: 7, name: "Yukthi", slug: "yukthi", logo: null, location_name: "Kochi", user_data: null, followers_count: 1, is_following: true, interests: [] },
      ],
    });
    show("/me/following");
    expect(screen.getByRole("heading", { level: 1, name: "Following" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Circuit Society" })).toHaveAttribute("href", "/clubs/circuit-society");
    expect(screen.getByRole("link", { name: "Yukthi" })).toHaveAttribute("href", "/clubs/yukthi");
    expect(screen.getByText("1.2K", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Robotics")).toBeInTheDocument();
    // The list doesn't say what's coming up, so the card doesn't guess "0 upcoming".
    expect(screen.queryByText(/upcoming/)).toBeNull();
    expect(get).toHaveBeenCalledWith("/api/v1/user/following", { params: { offset: 0, limit: 24 } });
  });

  it("with none followed, points to the clubs", async () => {
    enableSignIn();
    signInAs();
    answer({ clubs: [] });
    show("/me/following");
    expect(await screen.findByRole("heading", { name: "You're not following any clubs yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse clubs" })).toHaveAttribute("href", "/clubs");
  });
});

const { forgetEvents } = await import("@/api/discover");

describe("My tickets: ticket types and cancelled events", () => {
  const cancelledPage = { event: { id: 901, slug: "hack-night-04", name: "Hack Night 04", starts_at: "2026-10-24T18:00:00+05:30", status: "cancelled", cancellation: { reason: "The venue flooded.", cancelled_at: "2026-10-12T10:00:00+05:30" } } };

  /** The lists as before, and each event's page: Hack Night 04 cancelled, the rest on. */
  function answerWithPages({ upcoming = UPCOMING, past = PAST } = {}) {
    get.mockImplementation(async (url, config) => {
      if (url === "/api/v1/user/profile/me") return { data: PROFILE };
      if (url === "/api/v1/events/list") return pageOf(config.params.is_ended ? past : upcoming);
      if (url === "/api/v1/discover/events/hack-night-04") return { data: cancelledPage };
      if (url.startsWith("/api/v1/discover/events/")) return { data: { event: { id: 1, slug: url.split("/").pop(), name: "On", status: "upcoming" } } };
      throw new Error(`unexpected GET ${url}`);
    });
  }

  beforeEach(() => {
    forgetEvents();
    enableSignIn();
    signInAs();
  });

  it("marks an upcoming event that was cancelled, with the reason and the refund for a paid ticket", async () => {
    answerWithPages({ upcoming: [row({ is_paid: true })], past: [] });
    show("/me/tickets");
    const upcoming = await screen.findByRole("region", { name: /Upcoming/ });
    const item = within(upcoming).getByRole("listitem");
    expect(await within(item).findByText("Cancelled")).toBeInTheDocument();
    expect(within(item).getByText("This event was cancelled")).toBeInTheDocument();
    expect(within(item).getByText("The venue flooded.", { exact: false })).toBeInTheDocument();
    expect(within(item).getByText("Your payment is being refunded.")).toBeInTheDocument();
    // The ticket's own page says the rest.
    expect(within(item).getByRole("link", { name: "View ticket for Hack Night 04" })).toBeInTheDocument();
    // Asked by slug, as nobody.
    expect(get).toHaveBeenCalledWith("/api/v1/discover/events/hack-night-04", { params: undefined, skipAuth: true });
  });

  it("a cancelled event's registration waiting for payment has nothing left to pay", async () => {
    answerWithPages({ upcoming: [row({ is_paid: false })], past: [] });
    show("/me/tickets");
    const upcoming = await screen.findByRole("region", { name: /Upcoming/ });
    const item = within(upcoming).getByRole("listitem");
    expect(await within(item).findByText("Nothing to pay")).toBeInTheDocument();
    expect(within(item).queryByRole("button", { name: /Finish payment/ })).toBeNull();
    expect(within(item).queryByText("Awaiting payment")).toBeNull();
    expect(within(item).queryByText("Your payment is being refunded.")).toBeNull();
  });

  it("leaves events that are on as they were, and names a ticket's type when the list says it", async () => {
    answerWithPages({ upcoming: [UPCOMING[1]], past: [row({ ...PAST[0], ticket_type_name: "Early bird" })] });
    show("/me/tickets");
    const upcoming = await screen.findByRole("region", { name: /Upcoming/ });
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/discover/events/ctf-night", expect.anything()));
    expect(within(upcoming).queryByText("Cancelled")).toBeNull();
    expect(within(screen.getByRole("region", { name: /Past/ })).getByText("Early bird")).toBeInTheDocument();
  });
});

/*
 * A ticket the organiser revoked: GET /events/list?is_registered=true has
 * said `ticket_revoked` all along, and the row used to read exactly like a
 * working ticket.
 */
describe("My tickets: a revoked ticket", () => {
  beforeEach(() => {
    forgetEvents();
    enableSignIn();
    signInAs();
  });

  it("marks the row, says what to do, and offers no ticket to show at a door", async () => {
    answer({ upcoming: [row({ ticket_revoked: true, is_paid: true })], past: [] });
    show("/me/tickets");
    const upcoming = await screen.findByRole("region", { name: /Upcoming/ });
    const item = within(upcoming).getByRole("listitem");
    expect(await within(item).findByText("Revoked")).toBeInTheDocument();
    expect(within(item).getByText("This ticket was revoked by the organiser")).toBeInTheDocument();
    expect(within(item).getByText("The organiser revoked this ticket. Contact them if you think this is a mistake.")).toBeInTheDocument();
    expect(within(item).queryByRole("link", { name: "View ticket for Hack Night 04" })).toBeNull();
    expect(within(item).getByRole("link", { name: "See the revoked ticket for Hack Night 04" })).toHaveAttribute("href", "/tickets/MOA7Q4K2X");
  });

  it("has nothing left to pay when its payment never went through", async () => {
    answer({ upcoming: [row({ ticket_revoked: true, is_paid: false })], past: [] });
    show("/me/tickets");
    const upcoming = await screen.findByRole("region", { name: /Upcoming/ });
    const item = within(upcoming).getByRole("listitem");
    expect(await within(item).findByText("Nothing to pay")).toBeInTheDocument();
    expect(within(item).queryByRole("button", { name: /Finish payment/ })).toBeNull();
    expect(within(item).queryByText("Awaiting payment")).toBeNull();
  });

  it("leaves a working ticket as it was", async () => {
    answer({ upcoming: [row({ ticket_revoked: false, is_paid: true })], past: [] });
    show("/me/tickets");
    const upcoming = await screen.findByRole("region", { name: /Upcoming/ });
    const item = within(upcoming).getByRole("listitem");
    expect(await within(item).findByRole("link", { name: "View ticket for Hack Night 04" })).toBeInTheDocument();
    expect(within(item).queryByText("Revoked")).toBeNull();
    expect(within(item).queryByText("This ticket was revoked by the organiser")).toBeNull();
  });
});

describe("My tickets: registrations under review (registration approval)", () => {
  const T1 = "Rq7abcdefghijklmnopqrstuvwxyz001";
  const T2 = "Rq7abcdefghijklmnopqrstuvwxyz002";
  const CLAIM = "Cl4im-token-abcdefghijklmnop";
  const req = (over = {}) => ({
    id: "r1",
    token: T1,
    status: "pending",
    event: { id: 903, slug: "maker-night", name: "Maker Night", event_datetime: "2026-11-08T18:00:00+05:30", poster: null, club: { name: "Circuit Society", slug: "circuit-society" } },
    ticket_type: { id: 3, name: "Student" },
    full_name: "Asha Rao",
    submitted_at: "2026-10-26T10:15:00+05:30",
    decided_at: null,
    decline_note: null,
    ticket_id: null,
    pay: null,
    ...over,
  });
  const MINE = [
    req(),
    req({ id: "r2", token: T2, status: "approved", event: { ...req().event, id: 904, slug: "solder-lab", name: "Solder Lab" }, pay: { amount: 199, pay_by: "2026-10-27T10:15:00+05:30", claim_token: CLAIM } }),
    // Registered already: it is a ticket now, in the list below.
    req({ id: "r3", status: "approved", ticket_id: "MOA9", event: { ...req().event, id: 905, slug: "old", name: "Registered Already" } }),
    req({ id: "r4", status: "declined", event: { ...req().event, id: 906, slug: "no", name: "Declined One" } }),
  ];

  /** The account's lists, and /registration-requests/mine as `mine` says (a function: its answer, or a throw). */
  function answerWith(mine) {
    get.mockImplementation(async (url, config) => {
      if (url === "/api/v1/user/profile/me") return { data: PROFILE };
      if (url === "/api/v1/events/list") return pageOf(config.params.is_ended ? PAST : UPCOMING);
      if (url === "/api/v1/registration-requests/mine") return mine();
      throw new Error(`unexpected GET ${url}`);
    });
  }
  const notFound = () => {
    throw Object.assign(new Error("Request failed with status code 404"), { response: { status: 404, data: { detail: "Not Found" } } });
  };
  const asked = () => get.mock.calls.filter(([url]) => url === "/api/v1/registration-requests/mine").length;

  it("signed in: the open registrations under review, each with its page, and paying a confirmed one", async () => {
    enableSignIn();
    signInAs();
    answerWith(() => ({ data: { items: MINE } }));
    show("/me/tickets");
    const group = await screen.findByRole("region", { name: /Under review/ });
    const rows = within(group).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(group).getByRole("heading", { level: 2 })).toHaveTextContent("Under review 2");

    expect(within(rows[0]).getByRole("link", { name: "Maker Night" })).toHaveAttribute("href", "/events/maker-night");
    expect(rows[0].querySelector(".me-pill")).toHaveTextContent(/^Under review$/);
    expect(within(rows[0]).getByText("Student")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/reviews every registration/)).toHaveTextContent(
      "Circuit Society reviews every registration. If yours is confirmed, your ticket will come by email.",
    );
    expect(within(rows[0]).getByRole("link", { name: "See your registration for Maker Night" })).toHaveAttribute("href", `/requests/${T1}`);
    expect(within(rows[0]).getByRole("link", { name: "See your registration for Maker Night" })).toHaveTextContent("See your registration");

    expect(rows[1].querySelector(".me-pill")).toHaveTextContent("Confirmed · pay by Tue, 27 Oct · 10:15 AM IST to get your ticket");
    expect(within(rows[1]).getByText(/confirmed your registration/)).toHaveTextContent("Circuit Society confirmed your registration. Your ticket is held for you until then.");
    expect(within(rows[1]).getByRole("link", { name: "Pay ₹199 for Solder Lab" })).toHaveTextContent("Pay ₹199");
    expect(within(rows[1]).getByRole("link", { name: "Pay ₹199 for Solder Lab" })).toHaveAttribute("href", `/claim/${CLAIM}`);
    expect(within(rows[1]).getByRole("link", { name: "See your registration for Solder Lab" })).toHaveAttribute("href", `/requests/${T2}`);

    expect(within(group).queryByText("Registered Already")).toBeNull();
    expect(within(group).queryByText("Declined One")).toBeNull();
    expect(group).not.toHaveTextContent(/request|waiting|confirms each place|your place/i);
    // The tickets are there as ever.
    expect(await screen.findByRole("region", { name: /Upcoming/ })).toBeInTheDocument();
  });

  it("shows nothing from a server without requests (404), and the tickets as ever", async () => {
    enableSignIn();
    signInAs();
    answerWith(notFound);
    show("/me/tickets");
    expect(await screen.findByRole("region", { name: /Upcoming/ })).toBeInTheDocument();
    await waitFor(() => expect(asked()).toBe(1));
    expect(screen.queryByRole("region", { name: /Under review/ })).toBeNull();
  });

  it("shows nothing when there are none open", async () => {
    enableSignIn();
    signInAs();
    answerWith(() => ({ data: { items: [MINE[2], MINE[3]] } }));
    show("/me/tickets");
    expect(await screen.findByRole("region", { name: /Upcoming/ })).toBeInTheDocument();
    await waitFor(() => expect(asked()).toBe(1));
    expect(screen.queryByRole("region", { name: /Under review/ })).toBeNull();
  });

  it("signed out, with the guest token a registration here left: that guest's registrations, under the way in", async () => {
    enableSignIn();
    localStorage.setItem("access_token", "guest-a");
    answerWith(() => ({ data: { items: [MINE[0]] } }));
    show("/me/tickets");
    expect(await screen.findByRole("heading", { name: "Your tickets, in one place" })).toBeInTheDocument();
    const group = await screen.findByRole("region", { name: /Under review/ });
    expect(within(group).getByRole("link", { name: "See your registration for Maker Night" })).toHaveAttribute("href", `/requests/${T1}`);
    localStorage.removeItem("access_token");
  });

  it("signed out with no guest token: nothing asked", async () => {
    enableSignIn();
    answerWith(() => ({ data: { items: MINE } }));
    show("/me/tickets");
    expect(await screen.findByRole("heading", { name: "Your tickets, in one place" })).toBeInTheDocument();
    expect(asked()).toBe(0);
    expect(screen.queryByRole("region", { name: /Under review/ })).toBeNull();
  });
});
