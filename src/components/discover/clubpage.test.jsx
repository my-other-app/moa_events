import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn() } }));
vi.mock("@/utils/visit", () => ({ countVisit: vi.fn() }));

const { countVisit } = await import("@/utils/visit");
const ClubPage = (await import("./clubpage.jsx")).default;

const page = {
  club: {
    id: 3,
    name: "Circuit Society",
    slug: "circuit-society",
    logo: { thumbnail: "https://cdn.example/logo-t.png", medium: "https://cdn.example/logo-m.png" },
    cover: "https://cdn.example/cover.jpg",
    tagline: "We build things that blink",
    location_name: "COEP, Pune",
    followers: 1240,
    upcoming_events: 1,
    interests: ["Robotics", "Embedded"],
    website_url: "https://circuit.myotherapp.in",
    about: "A student club for hardware people.",
    contact_email: "hello@circuit.club",
    socials: { instagram: "https://instagram.com/circuit", linkedin: null, youtube: "javascript:alert(1)" },
    events_held: 18,
  },
  upcoming: [{ id: 68, name: "Hack Night 04", starts_at: "2026-10-17T12:30:00Z", status: "closing_soon", has_fee: false, going: 40 }],
  past: [{ id: 50, name: "Solder Sprint", starts_at: "2026-08-01T12:30:00Z", status: "ended", has_fee: false, going: 80 }],
  threads: [{ id: "t1", club: { id: 3, name: "Circuit Society", slug: "circuit-society" }, body: "Kits are in!", kind: "post", likes: 4, comments: 1, created_at: "2026-10-15T10:00:00Z" }],
  team: [{ name: "Asha Rao", role: "Lead", photo: null, links: { linkedin: "https://linkedin.com/in/asha" } }],
  partners: [{ name: "Acme Labs", role: "Venue partner", logo: null }],
};

const show = (path) =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/clubs/:slug" element={<ClubPage />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>
  );

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
});

describe("a club's page", () => {
  it("counts one visit with the link it came by, and shows every section", async () => {
    get.mockResolvedValue({ data: page });
    show("/clubs/circuit-society?ref=x7k2m9pq&follow=1");

    expect(await screen.findByRole("heading", { level: 1, name: "Circuit Society" }, { timeout: 5000 })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/api/v1/discover/clubs/circuit-society", { params: undefined, skipAuth: true });
    expect(countVisit).toHaveBeenCalledTimes(1);
    const [slug, params] = countVisit.mock.calls[0];
    expect(slug).toBe("circuit-society");
    expect(params.get("ref")).toBe("x7k2m9pq");

    for (const name of ["Upcoming events", "About", "Threads", "Past events", "Team", "Partners"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByText("Following happens in the MyOtherApp app — open the club there and tap Follow.")).toBeInTheDocument();
    expect(screen.getByText("We build things that blink")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hack Night 04" })).toHaveAttribute("href", "/68");
    // On the club's own page its cards don't repeat its name; past events are the compact rows.
    expect(screen.getByRole("link", { name: "Hack Night 04" }).closest("article").querySelector(".dc-evcard-club")).toBeNull();
    expect(screen.getByRole("link", { name: "Solder Sprint" }).closest("article")).toHaveClass("dc-evcard--row", "is-ended");
    expect(screen.getByText("Closing soon")).toBeInTheDocument();
    expect(screen.getByText("Kits are in!")).toBeInTheDocument();
    expect(screen.getByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Asha Rao on LinkedIn" })).toHaveAttribute("href", "https://linkedin.com/in/asha");
    expect(screen.getByText("Acme Labs")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Visit website/ })).toHaveAttribute("href", "https://circuit.myotherapp.in/");
    expect(screen.getByRole("link", { name: /hello@circuit.club/ })).toHaveAttribute("href", "mailto:hello@circuit.club");
    expect(screen.getByRole("link", { name: /Instagram/ })).toHaveAttribute("href", "https://instagram.com/circuit");
    // A link that is not http(s) is never offered.
    expect(screen.queryByRole("link", { name: /YouTube/ })).toBeNull();
    // The title is set in an effect, which can land a beat after the page paints.
    await waitFor(() => expect(document.title).toBe("Circuit Society · MyOtherApp"));

    fireEvent.click(screen.getByRole("button", { name: "Follow in the app" }));
    const dialog = screen.getByRole("dialog", { name: "Follow Circuit Society" });
    expect(within(dialog).getByRole("link", { name: "Get it on Google Play" })).toHaveAttribute("href", expect.stringContaining("play.google.com"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the team with only the links that are safe to follow, and the partners as a logo wall", async () => {
    get.mockResolvedValue({
      data: {
        ...page,
        team: [
          {
            name: "Asha Rao",
            role: "President",
            photo: "https://cdn.example/asha.jpg",
            links: { instagram: "javascript:alert(1)", linkedin: "https://linkedin.com/in/asha", x: "ftp://x.com/asha", website: "asha.dev" },
          },
          { name: "Rahul Menon", role: null, photo: null, links: { instagram: "data:text/html,hi", x: "javascript://%0aalert(1)" } },
          { name: "", role: "Ghost", links: {} },
        ],
        partners: [
          { name: "Acme Labs", role: "Venue partner", logo: "https://cdn.example/acme.png" },
          { name: "Kerala Startup Mission", role: null, logo: null },
        ],
      },
    });
    show("/clubs/circuit-society");
    const team = await screen.findByRole("region", { name: "Team" }, { timeout: 5000 });
    const people = within(team).getAllByRole("listitem");
    expect(people).toHaveLength(2); // a member without a name is dropped
    const asha = within(people[0]);
    expect(asha.getByText("Asha Rao")).toBeInTheDocument();
    expect(asha.getByText("President")).toBeInTheDocument();
    expect(people[0].querySelector("img")).toHaveAttribute("src", "https://cdn.example/asha.jpg");
    const links = asha.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://linkedin.com/in/asha", "https://asha.dev/"]);
    for (const a of links) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(asha.getByRole("link", { name: "Asha Rao on Website" })).toBeInTheDocument();
    // No photo: their initials. No safe links: no link row at all.
    expect(within(people[1]).getByText("RM")).toBeInTheDocument();
    expect(within(people[1]).queryAllByRole("link")).toHaveLength(0);
    expect(people[1].querySelector(".dc-member-links")).toBeNull();

    const partners = within(screen.getByRole("region", { name: "Partners" })).getAllByRole("listitem");
    // The logo is decoration next to the name, so screen readers hear the name once.
    expect(partners[0].querySelector("img")).toHaveAttribute("src", "https://cdn.example/acme.png");
    expect(partners[0].querySelector("img")).toHaveAttribute("alt", "");
    expect(within(partners[0]).getByText("Venue partner")).toBeInTheDocument();
    expect(within(partners[1]).getByText("KM")).toBeInTheDocument();
    expect(within(partners[1]).getByText("Kerala Startup Mission")).toBeInTheDocument();
  });

  it("hides the team and partners when there are none", async () => {
    get.mockResolvedValue({ data: { ...page, team: [], partners: [] } });
    show("/clubs/circuit-society");
    expect(await screen.findByRole("heading", { level: 1, name: "Circuit Society" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Team" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "Partners" })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Team/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Partners/ })).toBeNull();
    expect(screen.getByRole("link", { name: /^Past events/ })).toHaveAttribute("href", "#past");
  });

  it("leaves out empty sections and the website button when there is no site", async () => {
    get.mockResolvedValue({ data: { club: { id: 4, slug: "quiet", name: "Quiet Club" }, upcoming: [] } });
    show("/clubs/quiet");
    expect(await screen.findByRole("heading", { level: 1, name: "Quiet Club" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nothing scheduled yet" })).toBeInTheDocument();
    for (const name of ["About", "Threads", "Past events", "Team", "Partners"]) {
      expect(screen.queryByRole("heading", { level: 2, name })).toBeNull();
    }
    expect(screen.queryByRole("link", { name: /Visit website/ })).toBeNull();
    expect(screen.queryByText(/tap Follow\./)).toBeNull();
  });

  it("shows more past events twelve at a time, saying how far along it is, until there are no more", async () => {
    const past = (from, to) => Array.from({ length: to - from }, (_, i) => ({ id: 100 + from + i, slug: `past-${from + i}`, name: `Past ${from + i}`, starts_at: "2026-08-01T12:30:00Z", status: "ended" }));
    get.mockImplementation(async (url, config) => {
      if (url === "/api/v1/discover/clubs/circuit-society") return { data: { ...page, club: { ...page.club, events_held: 20 }, past: past(0, 6) } };
      const { offset, limit } = config.params;
      return { data: { items: past(offset, Math.min(20, offset + limit)), total: 20, offset, limit } };
    });
    show("/clubs/circuit-society");
    const region = await screen.findByRole("region", { name: "Past events" }, { timeout: 5000 });
    const rows = () => within(region).getAllByRole("article");
    expect(rows()).toHaveLength(6);
    // Still the compact rows.
    expect(rows()[0]).toHaveClass("dc-evcard--row");
    expect(within(region).getByText("Showing 6 of 20")).toBeInTheDocument();
    // The tab counts every past event, not just the ones on the page.
    expect(screen.getByRole("link", { name: /^Past events/ })).toHaveTextContent("20");

    fireEvent.click(within(region).getByRole("button", { name: "Show more" }));
    expect(await within(region).findByText("Showing 18 of 20")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/api/v1/discover/clubs/circuit-society/events", { params: { when: "past", offset: 6, limit: 12 }, skipAuth: true });
    expect(rows()).toHaveLength(18);
    expect(within(region).getByRole("link", { name: "Past 17" })).toHaveAttribute("href", "/events/past-17");

    fireEvent.click(within(region).getByRole("button", { name: "Show more" }));
    expect(await within(region).findByText("That's all 20 past events.")).toBeInTheDocument();
    expect(get).toHaveBeenLastCalledWith("/api/v1/discover/clubs/circuit-society/events", { params: { when: "past", offset: 18, limit: 12 }, skipAuth: true });
    expect(rows()).toHaveLength(20);
    expect(within(region).queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("drops Show more where the API has no list of a club's events", async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ id: 200 + i, name: `Old ${i}`, starts_at: "2026-08-01T12:30:00Z", status: "ended" }));
    get.mockImplementation(async (url) => {
      if (url === "/api/v1/discover/clubs/circuit-society") return { data: { ...page, club: { ...page.club, events_held: 9 }, past: six } };
      throw Object.assign(new Error("404"), { response: { status: 404 } });
    });
    show("/clubs/circuit-society");
    const region = await screen.findByRole("region", { name: "Past events" }, { timeout: 5000 });
    fireEvent.click(within(region).getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(within(region).queryByRole("button", { name: "Show more" })).toBeNull());
    expect(within(region).queryByText(/Showing/)).toBeNull();
    expect(within(region).queryByRole("alert")).toBeNull();
    expect(within(region).getAllByRole("article")).toHaveLength(6);
  });

  it("offers more upcoming events too, when the club has more than its page carries", async () => {
    const up = (from, to) => Array.from({ length: to - from }, (_, i) => ({ id: 300 + from + i, name: `Soon ${from + i}`, starts_at: "2026-11-01T12:30:00Z", status: "upcoming" }));
    get.mockImplementation(async (url, config) => {
      if (url === "/api/v1/discover/clubs/circuit-society") return { data: { ...page, club: { ...page.club, upcoming_events: 62 }, upcoming: up(0, 60) } };
      const { offset } = config.params;
      return { data: { items: up(offset, 62), total: 62 } };
    });
    show("/clubs/circuit-society");
    const region = await screen.findByRole("region", { name: "Upcoming events" }, { timeout: 5000 });
    expect(within(region).getByText("Showing 60 of 62")).toBeInTheDocument();
    fireEvent.click(within(region).getByRole("button", { name: "Show more" }));
    expect(await within(region).findByRole("link", { name: "Soon 61" })).toBeInTheDocument();
    expect(get).toHaveBeenLastCalledWith("/api/v1/discover/clubs/circuit-society/events", { params: { when: "upcoming", offset: 60, limit: 12 }, skipAuth: true });
  });

  it("says when the club does not exist, without counting a visit", async () => {
    get.mockRejectedValue(Object.assign(new Error("404"), { response: { status: 404 } }));
    show("/clubs/nobody");
    expect(await screen.findByRole("heading", { name: "We couldn't find that club" })).toBeInTheDocument();
    expect(countVisit).not.toHaveBeenCalled();
    expect(document.title).toBe("Club not found · MyOtherApp");
  });
});
