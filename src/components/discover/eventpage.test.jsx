import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { fullEvent, sparseEvent } from "@/test/eventFixture";

const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn() } }));
vi.mock("@/api/live", () => ({ liveApi: { fetchFeed: vi.fn(() => Promise.reject(new Error("no room"))) } }));
vi.mock("@/api/competition", () => ({ competitionApi: { leaderboard: vi.fn(() => Promise.reject(new Error("none"))) } }));

const { forgetEvents } = await import("@/api/discover");
const { liveApi } = await import("@/api/live");
const EventPage = (await import("./eventpage.jsx")).default;

/** Answers GET /discover/events/{ref} from a table; anything else is a 404. */
const serve = (pages) =>
  get.mockImplementation((url) => {
    const ref = decodeURIComponent(url.replace("/api/v1/discover/events/", ""));
    const page = pages.find((p) => p.event.slug === ref || String(p.event.id) === ref);
    return page ? Promise.resolve({ data: page }) : Promise.reject(Object.assign(new Error("404"), { response: { status: 404 } }));
  });

function Where() {
  const l = useLocation();
  return <output data-testid="where">{`${l.pathname}${l.search}${l.hash}`}</output>;
}

const show = (path) =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/events/:slug" element={<EventPage />} />
          <Route path="/events/:slug/:sub" element={<p>sub page</p>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </StrictMode>
  );

const title = (name) => screen.findByRole("heading", { level: 1, name }, { timeout: 4000 });
const h2 = (name) => screen.queryByRole("heading", { level: 2, name });

beforeEach(() => {
  vi.clearAllMocks();
  forgetEvents();
  window.scrollTo = vi.fn();
});
afterEach(() => {
  document.head.querySelectorAll('script[type="application/ld+json"], link[rel="canonical"], meta[property^="og:"], meta[name^="twitter:"]').forEach((el) => el.remove());
});

describe("an event's page", () => {
  it("shows every section of a full event, in the site's own words", async () => {
    serve([fullEvent()]);
    show("/events/hack-night-04");
    expect(await title("Hack Night 04")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/api/v1/discover/events/hack-night-04", { params: undefined, skipAuth: true });

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

  it("tells search engines and link previews what the event is", async () => {
    serve([fullEvent()]);
    show("/events/hack-night-04");
    await title("Hack Night 04");
    expect(document.title).toBe("Hack Night 04 · MyOtherApp");
    expect(document.head.querySelector('meta[name="description"]').getAttribute("content")).toMatch(/^Twenty-four hours of building\./);
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute("href", "https://myotherapp.in/events/hack-night-04");
    const og = (p) => document.head.querySelector(`meta[property="og:${p}"]`)?.getAttribute("content");
    expect(og("title")).toBe("Hack Night 04 · MyOtherApp");
    expect(og("url")).toBe("https://myotherapp.in/events/hack-night-04");
    expect(og("image")).toBe("https://cdn.example/p.jpg");
    expect(og("description")).toMatch(/^Twenty-four hours/);

    const scripts = document.head.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    const ld = JSON.parse(scripts[0].textContent);
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Event",
      name: "Hack Night 04",
      startDate: "2026-10-18T18:00:00+05:30",
      endDate: "2026-10-18T21:00:00+05:30",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: { "@type": "Place", name: "Lab 3B, COEP", geo: { latitude: 18.5293, longitude: 73.8565 } },
      image: ["https://cdn.example/p.jpg"],
      organizer: { "@type": "Organization", name: "Circuit Society", url: "https://myotherapp.in/clubs/circuit-society" },
      offers: { "@type": "Offer", price: 250, priceCurrency: "INR", availability: "https://schema.org/InStock" },
    });
    // A "</script>" in a club's text cannot close the tag.
    expect(scripts[0].textContent).not.toContain("</script>");
  });

  it("an online event points at the ticket, and its structured data says so", async () => {
    serve([fullEvent({ event: { ...fullEvent().event, is_online: true, location_name: null, lat: null, lng: null } })]);
    show("/events/hack-night-04");
    await title("Hack Night 04");
    expect(h2("Online event")).toBeInTheDocument();
    expect(screen.getByText(/joining link is on your ticket/)).toBeInTheDocument();
    expect(screen.queryByTitle(/Map of/)).toBeNull();
    const ld = JSON.parse(document.head.querySelector('script[type="application/ld+json"]').textContent);
    expect(ld.location).toEqual({ "@type": "VirtualLocation", url: "https://myotherapp.in/events/hack-night-04" });
    expect(ld.eventAttendanceMode).toBe("https://schema.org/OnlineEventAttendanceMode");
  });

  it("leaves out what a sparse event doesn't have, and never says 0", async () => {
    serve([sparseEvent()]);
    show("/events/quiet-evening");
    expect(await title("Quiet Evening")).toBeInTheDocument();
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
    it.each(cases)("%s", async (_, over, check) => {
      serve([sparseEvent({ event: { ...base, ...over } })]);
      show("/events/quiet-evening");
      await title("Quiet Evening");
      const card = within(screen.getByRole("region", { name: "Registration" }));
      check(card);
      // Exactly one way to register on the page.
      expect(screen.queryAllByRole("link", { name: "Register" }).length).toBeLessThanOrEqual(1);
    });
  });

  it("shares through the phone's sheet, or copies the link and says so", async () => {
    serve([fullEvent()]);
    show("/events/hack-night-04");
    await title("Hack Night 04");
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

  it("adds the event to a calendar: Google, or an .ics file", async () => {
    serve([fullEvent()]);
    show("/events/hack-night-04");
    await title("Hack Night 04");
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
    liveApi.fetchFeed.mockResolvedValue({ banner: { kind: "general", text: "Round two in ten minutes" }, poll: null, quiz: null, questions: [] });
    serve([fullEvent()]);
    show("/events/hack-night-04");
    await title("Hack Night 04");
    expect(await screen.findByText("Round two in ten minutes")).toBeInTheDocument();
    expect(liveApi.fetchFeed).toHaveBeenCalledWith(123);
    expect(screen.getByRole("link", { name: "Open the live room" })).toHaveAttribute("href", "/events/hack-night-04/live");
  });

  it("moves an id address to the slug, keeping the query", async () => {
    serve([fullEvent()]);
    show("/events/123?ref=abc12345#agenda");
    expect(await title("Hack Night 04")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/events/hack-night-04?ref=abc12345#agenda");
  });

  it("shows the 404 page for an event that isn't public", async () => {
    serve([]);
    show("/events/nope");
    expect(await screen.findByText("404")).toBeInTheDocument();
  });

  it("offers a retry when the API fails, and tries again for real", async () => {
    get.mockRejectedValue(new Error("Network Error"));
    show("/events/hack-night-04");
    expect(await screen.findByRole("heading", { name: "That didn't load" })).toBeInTheDocument();
    serve([fullEvent()]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await title("Hack Night 04")).toBeInTheDocument();
  });

  it("holds the page's shape while it loads, not a spinner", () => {
    get.mockReturnValue(new Promise(() => {}));
    show("/events/hack-night-04");
    expect(screen.getByRole("status", { name: "Loading the event" })).toBeInTheDocument();
  });
});
