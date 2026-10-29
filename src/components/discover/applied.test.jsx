import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { fullEvent } from "@/test/eventFixture";
import { seatsInfo } from "@/utils/cover";
import { appliedCount, peopleLine, registerState, seatsLeft } from "@/utils/eventpage";

vi.mock("@/api/client", () => ({ default: { get: vi.fn(() => Promise.reject(new Error("offline"))), post: vi.fn() } }));
vi.mock("@/api/live", () => ({ liveApi: { fetchFeed: vi.fn(() => Promise.reject(new Error("no room"))), fetchBanner: vi.fn(() => Promise.reject(new Error("no room"))) } }));
vi.mock("@/api/competition", () => ({ competitionApi: { leaderboard: vi.fn(() => Promise.reject(new Error("none"))) } }));

const { parseEvent, parseEventPage } = await import("@/api/discover");
const { EventCard } = await import("./eventcard.jsx");
const { EventView } = await import("./eventpage.jsx");

/*
 * An event whose club reviews every registration says how many applied
 * ("108 applied": every registration ever made for it, `applied_count`),
 * never how many are going or how many seats are left: the club decides
 * who gets in. A normal event, and any event from an older API without
 * `applied_count`, read exactly as before.
 */

const card = {
  id: 68,
  slug: "devfest-26",
  name: "DevFest 26",
  poster: null,
  starts_at: "2099-10-17T12:30:00Z",
  location_name: "COEP, Pune",
  is_online: false,
  has_fee: false,
  fee: null,
  club: { id: 3, name: "Circuit Society", slug: "circuit-society", logo: null },
  going: 1,
  capacity: 200,
  status: "upcoming",
};
const review = { requires_approval: true, applied_count: 108 };

describe("reading applied_count", () => {
  it("keeps it on an event that reviews registrations, as a whole number", () => {
    expect(parseEvent({ ...card, ...review }).applied_count).toBe(108);
    expect(parseEvent({ ...card, requires_approval: true, applied_count: 0 }).applied_count).toBe(0);
    expect(parseEvent({ ...card, requires_approval: true, applied_count: "12" }).applied_count).toBe(12);
  });

  it("leaves it out anywhere else: a normal event, null, nonsense, an older API", () => {
    for (const over of [{ applied_count: 108 }, { requires_approval: true, applied_count: null }, { requires_approval: true, applied_count: -3 }, { requires_approval: true, applied_count: "lots" }, { requires_approval: true }]) {
      expect(parseEvent({ ...card, ...over })).not.toHaveProperty("applied_count");
    }
  });

  it("reads it on the event's own page too", () => {
    const base = fullEvent();
    const page = parseEventPage({ ...base, event: { ...base.event, requires_approval: true, applied_count: 108 } });
    expect(page.event.applied_count).toBe(108);
  });
});

describe("the rules", () => {
  const parsed = (over) => parseEvent({ ...card, ...over });

  it("says how many applied and keeps no seats on a review event", () => {
    const e = parsed(review);
    expect(appliedCount(e)).toBe(108);
    expect(peopleLine(e)).toBe("108 applied");
    expect(peopleLine(parsed({ requires_approval: true, applied_count: 1 }))).toBe("1 applied");
    expect(peopleLine(parsed({ requires_approval: true, applied_count: 1200 }))).toBe("1.2k applied");
    expect(peopleLine(parsed({ requires_approval: true, applied_count: 0 }))).toBeNull();
    expect(seatsLeft({ ...e, seats_left: 199 })).toBeNull();
    expect(seatsInfo(e)).toBeNull();
  });

  it("says how many are going, and the seats, everywhere else", () => {
    for (const e of [parsed({}), parsed({ requires_approval: true })]) {
      expect(appliedCount(e)).toBeNull();
      expect(peopleLine(e)).toBe("1 going");
      expect(seatsLeft({ ...e, seats_left: 199 })).toBe(199);
      expect(seatsInfo(e)).toMatchObject({ kind: "bar", left: 199 });
    }
    expect(peopleLine(parsed({ going: 0 }))).toBeNull();
  });

  it("keeps Registration closes …, never Only N seats left, on a review event", () => {
    const event = { ...parsed({ ...review }), registration_open: true, seats_left: 3, reg_closes_at: "2099-10-16T23:59:00+05:30" };
    expect(registerState(event)).toMatchObject({ kind: "open", label: "Register", note: expect.stringMatching(/^Registration closes /) });
    const { applied_count: _, ...older } = event;
    expect(registerState(older)).toMatchObject({ kind: "open", note: "Only 3 seats left", tone: "warn" });
  });
});

describe("an event card", () => {
  const show = (over) => {
    const view = render(
      <MemoryRouter>
        <EventCard event={parseEvent({ ...card, ...over })} />
      </MemoryRouter>,
    );
    return view.container.querySelector("article");
  };

  it("says how many applied, with no seats left and no bar, on a review event", () => {
    const article = show(review);
    expect(within(article).getByText("108 applied")).toHaveClass("dc-going");
    expect(article).not.toHaveTextContent(/going|seats|left/);
    expect(article.querySelector(".dc-evcard-bar")).toBeNull();
    expect(article.querySelector(".dc-evcard-seats")).toBeNull();
  });

  it("says nothing of people on a review event nobody applied to yet", () => {
    const article = show({ requires_approval: true, applied_count: 0, going: 0 });
    expect(article.querySelector(".dc-going")).toBeNull();
    expect(article.querySelector(".dc-evcard-seats")).toBeNull();
  });

  it("is as before on a normal event, and on a review event from an older API", () => {
    for (const over of [{}, { requires_approval: true }]) {
      const article = show({ ...over, going: 150 });
      expect(within(article).getByText("150 going")).toBeInTheDocument();
      expect(within(article).getByText("50 left")).toBeInTheDocument();
      expect(article.querySelector(".dc-evcard-bar")).not.toBeNull();
      expect(article).not.toHaveTextContent(/applied/);
    }
  });

  it("says applied in a row too", () => {
    const view = render(
      <MemoryRouter>
        <EventCard event={parseEvent({ ...card, ...review })} variant="row" />
      </MemoryRouter>,
    );
    expect(within(view.container).getByText("108 applied")).toBeInTheDocument();
  });
});

describe("the event's page", () => {
  const show = (event = {}) => {
    const base = fullEvent();
    const page = parseEventPage({ ...base, event: { ...base.event, status: "upcoming", registration_open: true, reg_closes_at: "2099-01-01T00:00:00+05:30", ...event } });
    return render(
      <MemoryRouter initialEntries={[`/events/${page.event.slug}`]}>
        <EventView page={page} />
      </MemoryRouter>,
    );
  };
  const facts = () => document.querySelector(".ep-facts");
  const cta = () => screen.getByRole("region", { name: "Registration" });
  const meter = () => document.querySelector(".ep-meter");

  it("says how many applied in the facts and on the register card, and no seats left", () => {
    show({ ...review, going: 1, capacity: 200, seats_left: 199 });
    expect(facts()).toHaveTextContent("108 applied");
    expect(facts()).not.toHaveTextContent(/going|seats? left/);
    expect(meter().querySelector(".ep-meter-text")).toHaveTextContent(/^108 applied$/);
    expect(meter().querySelector(".ep-meter-bar")).toBeNull();
    expect(cta()).not.toHaveTextContent(/seats? (left|taken)|going/);
    // The note by the button stays, and so does when registration closes.
    expect(within(cta()).getByText(/reviews every registration/)).toHaveTextContent("Circuit Society reviews every registration and emails tickets to the people it confirms.");
    expect(cta()).toHaveTextContent(/Registration closes /);
  });

  it("never says Only N seats left on a review event", () => {
    show({ ...review, going: 117, capacity: 120, seats_left: 3 });
    expect(cta()).not.toHaveTextContent(/Only 3 seats left/);
    expect(cta()).toHaveTextContent(/Registration closes /);
    expect(facts()).toHaveTextContent("108 applied");
  });

  it("says the club reviews every registration while nobody has applied", () => {
    show({ requires_approval: true, applied_count: 0, going: 0, capacity: 120, seats_left: 120 });
    expect(meter()).toHaveTextContent(/^Circuit Society reviews every registration$/);
    expect(facts()).toHaveTextContent("Circuit Society reviews every registration");
    expect(facts()).not.toHaveTextContent(/seats left/);
  });

  it("is as before from an older API without applied_count", () => {
    show({ requires_approval: true, going: 12, capacity: 120, seats_left: 100 });
    expect(meter()).toHaveTextContent("12 going · 100 seats left");
    expect(meter().querySelector(".ep-meter-bar")).not.toBeNull();
    expect(facts()).toHaveTextContent("12 going · 100 seats left");
  });

  it("is as before on a normal event", () => {
    show({ going: 102, capacity: 120, seats_left: 18 });
    expect(meter()).toHaveTextContent("102 going · 18 seats left");
    expect(facts()).toHaveTextContent("102 going · 18 seats left");
    expect(document.body).not.toHaveTextContent(/applied/);
  });
});
