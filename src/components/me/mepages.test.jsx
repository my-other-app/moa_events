import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn(), delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

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

  it("keeps the page out of search results", async () => {
    answer();
    const { unmount } = show("/me/tickets");
    await screen.findByRole("region", { name: /Upcoming/ });
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    expect(document.title).toBe("My tickets · MyOtherApp");
    unmount();
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
