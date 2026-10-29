import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { fullEvent } from "@/test/eventFixture";

vi.mock("@/api/client", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/api/live", () => ({ liveApi: { fetchFeed: vi.fn(() => Promise.reject(new Error("no room"))), fetchBanner: vi.fn(() => Promise.reject(new Error("no room"))) } }));
vi.mock("@/api/competition", () => ({ competitionApi: { leaderboard: vi.fn(() => Promise.reject(new Error("none"))) } }));
vi.mock("@/utils/visit", () => ({ countVisit: vi.fn() }));

const { parseClubPage, parseEvent, parseEventPage } = await import("@/api/discover");
const { stableCard, stableEventPage } = await import("@/seo/stabilize");
const { EventView } = await import("./eventpage.jsx");
const { EventCard } = await import("./eventcard.jsx");
const { ClubView } = await import("./clubpage.jsx");

/*
 * Co-hosted events (the API's docs/COHOSTS.md): a club (the host, which
 * stays the event's `club`) runs an event with other clubs, which the API
 * lists as `cohosts: [{club_id, name, slug, logo}]` (logo a URL string on
 * /discover). The event's page says "Hosted by A and B" with every logo, the
 * host's first, each name a link to its club; a card says "A and B" or
 * "A + 2". An API without `cohosts` shows exactly what it did before.
 */
const RC = { club_id: 9, name: "Robotics Club", slug: "robotics-club", logo: "https://cdn.example/rc.png" };
const CC = { club_id: 12, name: "Code Club", slug: "code-club", logo: null };
const QC = { club_id: 14, name: "Quiz Circle", slug: "quiz-circle", logo: null };

const showPage = (data, { stable = false } = {}) => {
  const page = parseEventPage(data);
  return render(
    <MemoryRouter initialEntries={[`/events/${page.event.slug}`]}>
      <EventView page={stable ? stableEventPage(page) : page} />
    </MemoryRouter>
  );
};
const intro = () => document.querySelector(".ep-intro");

describe("a co-hosted event's page", () => {
  it('says "Hosted by A and B", each name a link to its club, the host\'s logo first', () => {
    showPage(fullEvent({ cohosts: [RC] }));
    const row = intro().querySelector(".ep-hosts");
    expect(row).not.toBeNull();
    expect(row.querySelector(".ep-club-text").textContent).toBe("Hosted by Circuit Society and Robotics Club");
    const links = within(row).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Circuit Society", "/clubs/circuit-society"],
      ["Robotics Club", "/clubs/robotics-club"],
    ]);
    // The logos overlap, the host's first (its initial: it has no logo), then the co-host's picture.
    const faces = row.querySelectorAll(".dc-faces > .dc-avatar");
    expect(faces).toHaveLength(2);
    expect(faces[0].textContent).toBe("C");
    expect(faces[1].querySelector("img")).toHaveAttribute("src", RC.logo);
    expect(row.querySelector(".dc-faces")).toHaveAttribute("aria-hidden", "true");
    // One block for the hosts: not the host's single link with its followers.
    expect(intro().querySelector("a.ep-club")).toBeNull();
    expect(within(intro()).queryByText("1.2k followers")).toBeNull();
  });

  it('says "A, B and C" for more co-hosts, and shows three logos then +N', () => {
    showPage(fullEvent({ cohosts: [RC, CC, QC] }));
    const row = intro().querySelector(".ep-hosts");
    expect(row.querySelector(".ep-club-text").textContent).toBe("Hosted by Circuit Society, Robotics Club, Code Club and Quiz Circle");
    expect(within(row).getAllByRole("link").map((a) => a.textContent)).toEqual(["Circuit Society", "Robotics Club", "Code Club", "Quiz Circle"]);
    expect(row.querySelectorAll(".dc-faces > .dc-avatar:not(.dc-faces-more)")).toHaveLength(3);
    expect(row.querySelector(".dc-faces-more").textContent).toBe("+1");
  });

  it("names a co-host without an address as plain text", () => {
    showPage(fullEvent({ cohosts: [{ club_id: 30, name: "Old Club", slug: null, logo: null }] }));
    const row = intro().querySelector(".ep-hosts");
    expect(row.querySelector(".ep-club-text").textContent).toBe("Hosted by Circuit Society and Old Club");
    expect(within(row).getAllByRole("link")).toHaveLength(1);
  });

  it("shows the host alone, exactly as before, for an API without co-hosts (or none accepted)", () => {
    for (const data of [fullEvent(), fullEvent({ cohosts: [] }), fullEvent({ cohosts: null })]) {
      const { unmount } = showPage(data);
      expect(intro().querySelector(".ep-hosts")).toBeNull();
      const club = intro().querySelector("a.ep-club");
      expect(club).toHaveAttribute("href", "/clubs/circuit-society");
      expect(club.textContent).toBe("CHosted byCircuit Society1.2k followers");
      unmount();
    }
  });

  it("puts every co-host's logo on its club's stable address on a cached page", () => {
    const page = stableEventPage(parseEventPage(fullEvent({ cohosts: [RC, CC] })));
    expect(JSON.stringify(page.cohosts)).not.toMatch(/cdn\.example/);
    expect(page.cohosts.map((c) => [c.id, c.name, c.logo?.thumbnail || null])).toEqual([
      [9, "Robotics Club", "/media/clubs/robotics-club/logo?size=thumbnail"],
      [12, "Code Club", null],
    ]);
    showPage(fullEvent({ cohosts: [RC] }), { stable: true });
    expect(intro().querySelectorAll(".dc-faces img")[0]).toHaveAttribute("src", "/media/clubs/robotics-club/logo?size=thumbnail");
  });
});

describe("reading co-hosts from the API", () => {
  it("reads them beside the club (or on the event), in order, as clubs: {id, name, slug, logo}", () => {
    const page = parseEventPage(fullEvent({ cohosts: [RC, CC] }));
    expect(page.club.name).toBe("Circuit Society");
    expect(page.cohosts).toEqual([
      { id: 9, name: "Robotics Club", slug: "robotics-club", logo: RC.logo },
      { id: 12, name: "Code Club", slug: "code-club", logo: null },
    ]);
    const onEvent = parseEventPage(fullEvent({ event: { ...fullEvent().event, cohosts: [CC] } }));
    expect(onEvent.cohosts.map((c) => c.name)).toEqual(["Code Club"]);
  });

  it("drops the host itself, repeats and nameless rows", () => {
    const page = parseEventPage(fullEvent({ cohosts: [{ club_id: 3, name: "Circuit Society", slug: "circuit-society" }, RC, { ...RC, name: "Robotics again" }, { club_id: 40, name: "  " }, "x", null] }));
    expect(page.cohosts.map((c) => c.name)).toEqual(["Robotics Club"]);
  });

  it("adds nothing for an API without them, so the page and the cards read as before", () => {
    expect(parseEventPage(fullEvent())).not.toHaveProperty("cohosts");
    expect(parseEventPage(fullEvent({ cohosts: [] }))).not.toHaveProperty("cohosts");
    const card = { id: 5, name: "Solder Sprint", starts_at: "2026-10-25T12:30:00Z", club: { id: 3, name: "Circuit Society", slug: "circuit-society" } };
    expect(parseEvent(card)).not.toHaveProperty("cohosts");
    expect(stableCard(parseEvent(card))).not.toHaveProperty("cohosts");
    expect(parseEvent({ ...card, cohosts: [RC] }).cohosts).toEqual([{ id: 9, name: "Robotics Club", slug: "robotics-club", logo: RC.logo }]);
  });
});

/* ---------- cards ---------- */

const base = {
  id: 68,
  slug: "hack-night-04",
  name: "Hack Night 04",
  poster: null,
  starts_at: "2026-10-17T12:30:00Z",
  location_name: "Lab 3B, COEP",
  is_online: false,
  has_fee: false,
  club: { id: 3, name: "Circuit Society", slug: "circuit-society", logo: null },
  going: 42,
  status: "upcoming",
};

const showCard = (over = {}, props = {}) => {
  const view = render(
    <MemoryRouter>
      <EventCard event={parseEvent({ ...base, ...over })} {...props} />
    </MemoryRouter>
  );
  return view.container.querySelector("article");
};

describe("a co-hosted event's card", () => {
  it('names both clubs, "A and B", with both logos, and stays one link', () => {
    const card = showCard({ cohosts: [RC] });
    const row = card.querySelector(".dc-evcard-club");
    expect(row.className).toBe("dc-evcard-club dc-evcard-club--hosts");
    expect(row.querySelector(".dc-evcard-club > span:last-child").textContent).toBe("Circuit Society and Robotics Club");
    expect(row.querySelector(".dc-faces")).toHaveAttribute("aria-hidden", "true");
    expect(row.querySelectorAll(".dc-faces > .dc-avatar")).toHaveLength(2);
    expect(within(card).getAllByRole("link")).toHaveLength(1);
  });

  it('says "A + 2" for three or more, and every name to a screen reader', () => {
    const card = showCard({ cohosts: [RC, CC] });
    const label = card.querySelector(".dc-evcard-club > span:last-child");
    expect(label.querySelector('[aria-hidden="true"]').textContent).toBe("Circuit Society + 2");
    expect(label.querySelector(".dc-sr").textContent).toBe("Circuit Society, Robotics Club and Code Club");
    // Three logos at most, and no "+N" bubble: the words already count them.
    const four = showCard({ cohosts: [RC, CC, QC] });
    expect(four.querySelector(".dc-evcard-club > span:last-child [aria-hidden]").textContent).toBe("Circuit Society + 3");
    expect(four.querySelectorAll(".dc-faces > .dc-avatar")).toHaveLength(3);
    expect(four.querySelector(".dc-faces-more")).toBeNull();
  });

  it("is the club alone, as before, without co-hosts", () => {
    const card = showCard();
    const row = card.querySelector(".dc-evcard-club");
    expect(row.className).toBe("dc-evcard-club");
    expect(row.querySelector(".dc-faces")).toBeNull();
    expect(row.textContent).toBe("CCircuit Society");
  });

  it('on a club\'s own page (no club row), says "Hosted by Host and This club" under where', () => {
    const own = showCard({}, { showClub: false });
    expect(own.querySelector(".dc-evcard-club")).toBeNull();
    expect(own.querySelector(".dc-evcard-hosts")).toBeNull();
    // This club co-hosts it; another club hosts it: the card says who, the host first.
    const card = showCard({ club: { id: 1, name: "Design Society", slug: "design-society", logo: null }, cohosts: [{ club_id: 3, name: "Circuit Society", slug: "circuit-society" }] }, { showClub: false });
    expect(card.querySelector(".dc-evcard-club")).toBeNull();
    expect(card.querySelector(".dc-evcard-hosts").textContent).toBe("Hosted by Design Society and Circuit Society");
    // A card with its club row says it there, not twice.
    expect(showCard({ cohosts: [RC] }).querySelector(".dc-evcard-hosts")).toBeNull();
  });

  it('as a compact row, says "Hosted by A and B" under where', () => {
    const row = showCard({ status: "ended", cohosts: [RC] }, { variant: "row" });
    expect(row.querySelector(".dc-evcard-club")).toBeNull();
    expect(row.querySelector(".dc-evcard-hosts").textContent).toBe("Hosted by Circuit Society and Robotics Club");
    expect(showCard({ status: "ended" }, { variant: "row" }).querySelector(".dc-evcard-hosts")).toBeNull();
  });
});

/* ---------- a co-host's club page ---------- */

describe("a club page with an event it co-hosts", () => {
  const club = { id: 3, name: "Circuit Society", slug: "circuit-society", logo: null, followers: 12, upcoming_events: 2, socials: {} };
  const own = { id: 68, slug: "hack-night-04", name: "Hack Night 04", starts_at: "2026-11-17T12:30:00Z", status: "upcoming", has_fee: false, going: 0, club: { id: 3, name: "Circuit Society", slug: "circuit-society" } };
  const shared = {
    id: 70,
    slug: "design-jam",
    name: "Design Jam",
    starts_at: "2026-11-20T12:30:00Z",
    status: "upcoming",
    has_fee: false,
    going: 0,
    club: { id: 1, name: "Design Society", slug: "design-society", logo: "https://cdn.example/ds.png" },
    cohosts: [{ club_id: 3, name: "Circuit Society", slug: "circuit-society", logo: null }],
  };
  const pastShared = { ...shared, id: 50, slug: "old-jam", name: "Old Jam", starts_at: "2026-08-01T12:30:00Z", status: "ended" };

  it("lists it as hosted by the host and this club, not as this club's own", () => {
    render(
      <MemoryRouter initialEntries={["/clubs/circuit-society"]}>
        <ClubView data={parseClubPage({ club, upcoming: [own, shared], past: [pastShared], threads: [], team: [], partners: [] })} />
      </MemoryRouter>
    );
    const upcoming = document.getElementById("upcoming");
    const cards = upcoming.querySelectorAll("article");
    expect(cards).toHaveLength(2);
    // Its own event: no club row and nothing more, as before.
    expect(cards[0].querySelector(".dc-evcard-club")).toBeNull();
    expect(cards[0].querySelector(".dc-evcard-hosts")).toBeNull();
    // The one it co-hosts: hosted by the host, then this club.
    expect(cards[1].querySelector(".dc-evcard-club")).toBeNull();
    expect(cards[1].querySelector(".dc-evcard-hosts").textContent).toBe("Hosted by Design Society and Circuit Society");
    // A past one says so in its row.
    expect(document.getElementById("past").querySelector(".dc-evcard-hosts").textContent).toBe("Hosted by Design Society and Circuit Society");
    expect(screen.getByRole("link", { name: "Design Jam" })).toHaveAttribute("href", "/events/design-jam");
  });
});
