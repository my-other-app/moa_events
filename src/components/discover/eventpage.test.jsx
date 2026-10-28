import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { fullEvent, sparseEvent } from "@/test/eventFixture";

vi.mock("@/api/client", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/api/live", () => ({ liveApi: { fetchFeed: vi.fn(() => Promise.reject(new Error("no room"))), fetchBanner: vi.fn(() => Promise.reject(new Error("no room"))) } }));
vi.mock("@/api/competition", () => ({ competitionApi: { leaderboard: vi.fn(() => Promise.reject(new Error("none"))) } }));

const { parseEventPage } = await import("@/api/discover");
const { stableEventPage } = await import("@/seo/stabilize");
const { liveApi } = await import("@/api/live");
const { EventView } = await import("./eventpage.jsx");

/*
 * The event page as the server renders it (src/app/events/[slug]/page.jsx
 * fetches, then renders <EventView>); its islands run here as they do in the
 * browser. How the route finds the event, moves old addresses and answers
 * 404 is tested in src/app/_tests/event-route.test.js; its head and
 * structured data in src/seo/*.test.js.
 */
const show = (data, { stable = false } = {}) => {
  const page = parseEventPage(data);
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[`/events/${page.event.slug}`]}>
        <EventView page={stable ? stableEventPage(page) : page} />
      </MemoryRouter>
    </StrictMode>
  );
};

const title = (name) => screen.getByRole("heading", { level: 1, name });
const h2 = (name) => screen.queryByRole("heading", { level: 2, name });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("an event's page", () => {
  it("shows every section of a full event, in the site's own words", () => {
    show(fullEvent());
    expect(title("Hack Night 04")).toBeInTheDocument();

    for (const name of ["About this event", "Prizes", "Speakers", "Agenda", "Venue", "Guidelines", "Organising team", "Questions?", "More from Circuit Society", "Similar events"]) {
      expect(h2(name)).toBeInTheDocument();
    }
    const tabs = screen.getByRole("navigation", { name: "On this page" });
    expect(within(tabs).getAllByRole("link").map((a) => a.textContent)).toEqual(["About", "Prizes", "Speakers", "Agenda", "Venue", "Guidelines", "Team", "Contact"]);

    // The hero: category, the club, when (in India time), where, the price and the seats.
    expect(screen.getByText("Hackathon")).toBeInTheDocument();
    expect(within(document.querySelector(".ep-intro")).getByRole("link", { name: /Circuit Society/ })).toHaveAttribute("href", "/clubs/circuit-society");
    expect(screen.getByText("1.2k followers")).toBeInTheDocument();
    expect(screen.getByText(/18 October/)).toBeInTheDocument();
    expect(screen.getByText("6:00 PM – 9:00 PM IST")).toBeInTheDocument();
    expect(screen.getAllByText("Lab 3B, COEP").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹250").length).toBeGreaterThan(0);
    expect(within(document.querySelector(".ep-facts")).getByText("102 going · 18 seats left")).toBeInTheDocument();
    expect(screen.getByAltText("Poster for Hack Night 04")).toHaveAttribute("src", "https://cdn.example/p.jpg");
    expect(screen.getByText("₹50,000")).toBeInTheDocument();

    // The about keeps its paragraphs, links what it can, and never renders the club's text as HTML.
    const about = document.getElementById("about");
    expect(within(about).getByRole("link", { name: "https://circuit.example.org/recap" })).toHaveAttribute("href", "https://circuit.example.org/recap");
    expect(within(about).getByRole("link", { name: "hello@circuit.example.org" })).toHaveAttribute("href", "mailto:hello@circuit.example.org");
    expect(about.querySelector("script")).toBeNull();
    expect(about).toHaveTextContent("<script>alert(1)</script>");
    expect(within(about).getByText("IoT")).toBeInTheDocument();

    // Speakers: an http(s) link gets an icon, a javascript: one gets nothing.
    expect(screen.getByRole("link", { name: "Ananya Iyer on LinkedIn" })).toHaveAttribute("href", "https://www.linkedin.com/in/ananya");
    expect(screen.queryByRole("link", { name: /Rahul Menon on/ })).toBeNull();
    expect(screen.getByText("RM")).toBeInTheDocument();

    // The agenda, the map and the way there, the team, the contact.
    expect(screen.getByText("Opening keynote")).toBeInTheDocument();
    const map = screen.getByTitle("Map of Lab 3B, COEP");
    expect(map).toHaveAttribute("src", "https://www.google.com/maps?q=18.5293,73.8565&z=15&output=embed");
    expect(map).toHaveAttribute("loading", "lazy");
    expect(screen.getByRole("link", { name: /Get directions/ })).toHaveAttribute("href", "https://maps.app.goo.gl/abc");
    expect(screen.getByRole("link", { name: "Asha Rao on LinkedIn" })).toBeInTheDocument();
    expect(within(document.getElementById("contact")).getByRole("link", { name: /hello@circuit.example.org/ })).toHaveAttribute("href", "mailto:hello@circuit.example.org");
    expect(screen.getByRole("link", { name: /\+91 98765 43210/ })).toHaveAttribute("href", "tel:+919876543210");

    // More from the club leaves out this very event.
    const more = document.getElementById("more");
    expect(within(more).getByRole("link", { name: "Solder Sprint" })).toBeInTheDocument();
    expect(within(more).queryByRole("link", { name: "Hack Night 04" })).toBeNull();

    // The one button.
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/events/hack-night-04/register");
    expect(screen.getByText(/Registration closes Sat, 17 Oct/)).toBeInTheDocument();
  });

  it("points every picture at the site's stable media addresses once the server has swapped them in", () => {
    const data = fullEvent();
    data.speakers[0].photo = "https://s3.example/ananya.jpg?Expires=1";
    data.more_from_club[0].poster = "https://s3.example/solder.png?Expires=1";
    show(data, { stable: true });
    expect(screen.getByAltText("Poster for Hack Night 04")).toHaveAttribute("src", "/media/events/hack-night-04/poster");
    const html = document.body.innerHTML;
    expect(html).toContain("/media/events/hack-night-04/speakers/1/photo");
    // A card asks for the large poster: about twice the width it is drawn at.
    expect(html).toContain("/media/events/solder-sprint/poster?size=large");
    expect(html).not.toMatch(/s3\.example|cdn\.example/);
  });

  it("an online event points at the ticket", () => {
    show(fullEvent({ event: { ...fullEvent().event, is_online: true, location_name: null, lat: null, lng: null } }));
    expect(h2("Online event")).toBeInTheDocument();
    expect(screen.getByText(/joining link is on your ticket/)).toBeInTheDocument();
    expect(screen.queryByTitle(/Map of/)).toBeNull();
  });

  it("leaves out what a sparse event doesn't have, and never says 0", () => {
    show(sparseEvent());
    expect(title("Quiet Evening")).toBeInTheDocument();
    for (const name of ["About this event", "Prizes", "Speakers", "Agenda", "Guidelines", "Organising team", "Questions?", /More from/, "Similar events"]) {
      expect(h2(name)).toBeNull();
    }
    // One section is no reason for a tab bar.
    expect(screen.queryByRole("navigation", { name: "On this page" })).toBeNull();
    expect(h2("Venue")).toBeInTheDocument();
    expect(screen.queryByTitle(/Map of/)).toBeNull();
    expect(screen.getByRole("link", { name: /Get directions/ })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=Yasya%20Hall");

    // No poster: the generated cover, never a broken image.
    expect(document.querySelector(".ep-poster img")).toBeNull();
    expect(document.querySelector(".ep-poster .dc-cover")).not.toBeNull();

    const text = document.querySelector("article").textContent;
    expect(text).not.toMatch(/(?<![\d:.,])0(?!\d)/);
    expect(text).not.toMatch(/followers|going|seats/);
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/events/quiet-evening/register");
  });

  it("a past event still shows in full, marked as ended", () => {
    show(fullEvent({ event: { ...fullEvent().event, status: "ended", registration_open: false } }));
    expect(title("Hack Night 04")).toBeInTheDocument();
    expect(h2("About this event")).toBeInTheDocument();
    expect(within(document.querySelector(".ep-poster")).getByText("Ended")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Registration" })).getByRole("button", { name: "This event has ended" })).toBeDisabled();
  });

  describe("the register button", () => {
    const base = sparseEvent().event;
    const cases = [
      ["open", { registration_open: true }, (s) => expect(s.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/events/quiet-evening/register")],
      [
        "not open yet",
        { registration_open: false, reg_opens_at: "2099-10-25T10:00:00+05:30" },
        (s) => expect(s.getByRole("button", { name: "Registration opens 25 Oct" })).toBeDisabled(),
      ],
      ["closed", { registration_open: false, reg_opens_at: "2026-01-01T10:00:00+05:30" }, (s) => expect(s.getByRole("button", { name: "Registration closed" })).toBeDisabled()],
      ["full", { status: "full", registration_open: true, capacity: 50, going: 50, seats_left: 0 }, (s) => expect(s.getByRole("button", { name: "Event full" })).toBeDisabled()],
      [
        "live",
        { status: "live", registration_open: false },
        (s) => {
          expect(s.getByText("Happening now")).toBeInTheDocument();
          expect(s.getByRole("link", { name: "Join the live room" })).toHaveAttribute("href", "/events/quiet-evening/live");
          expect(s.queryByRole("link", { name: "Register" })).toBeNull();
        },
      ],
      ["ended", { status: "ended", registration_open: false }, (s) => expect(s.getByRole("button", { name: "This event has ended" })).toBeDisabled()],
    ];
    it.each(cases)("%s", (_, over, check) => {
      show(sparseEvent({ event: { ...base, ...over } }));
      const card = within(screen.getByRole("region", { name: "Registration" }));
      check(card);
      // Exactly one way to register on the page.
      expect(screen.queryAllByRole("link", { name: "Register" }).length).toBeLessThanOrEqual(1);
    });
  });

  it("shares through the phone's sheet, or copies the link and says so", async () => {
    show(fullEvent());
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Share" })));
    expect(writeText).toHaveBeenCalledWith("https://myotherapp.in/events/hack-night-04");
    expect(screen.getByText("Link copied")).toBeInTheDocument();

    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Share" })));
    expect(share).toHaveBeenCalledWith({ title: "Hack Night 04", text: "Hack Night 04 — Circuit Society", url: "https://myotherapp.in/events/hack-night-04" });
    delete navigator.share;
  });

  it("adds the event to a calendar: Google, or an .ics file", () => {
    show(fullEvent());
    const toggle = screen.getByRole("button", { name: "Add to calendar" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const google = screen.getByRole("link", { name: "Google Calendar" });
    expect(google.getAttribute("href")).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=Hack\+Night\+04&dates=20261018T123000Z%2F20261018T153000Z/);
    const ics = screen.getByRole("link", { name: /\.ics/ });
    expect(ics).toHaveAttribute("download", "hack-night-04.ics");
    expect(decodeURIComponent(ics.getAttribute("href"))).toContain("DTSTART:20261018T123000Z");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the live-room strip while the room is on", async () => {
    liveApi.fetchBanner.mockResolvedValue({ event: { id: 123, status: "published" }, banner: { kind: "general", text: "Round two in ten minutes" }, poll: null, quiz: { live: false, title: null }, qa: { open: true, has_questions: false } });
    show(fullEvent());
    expect(await screen.findByText("Round two in ten minutes")).toBeInTheDocument();
    expect(liveApi.fetchBanner).toHaveBeenCalledWith(123);
    expect(liveApi.fetchFeed).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Open the live room" })).toHaveAttribute("href", "/events/hack-night-04/live");
  });
});
