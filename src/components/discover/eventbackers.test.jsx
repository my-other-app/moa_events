import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { fullEvent } from "@/test/eventFixture";

vi.mock("@/api/client", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/api/live", () => ({ liveApi: { fetchFeed: vi.fn(() => Promise.reject(new Error("no room"))), fetchBanner: vi.fn(() => Promise.reject(new Error("no room"))) } }));
vi.mock("@/api/competition", () => ({ competitionApi: { leaderboard: vi.fn(() => Promise.reject(new Error("none"))) } }));

const { parseEventPage } = await import("@/api/discover");
const { stableEventPage } = await import("@/seo/stabilize");
const { mediaTarget } = await import("@/seo/media");
const { EventView } = await import("./eventpage.jsx");

/*
 * An event's own sponsors and partners (the API's docs/EVENT_PARTNERS.md):
 * a Sponsors section, then a Partners section, each only when it has
 * entries, as square tiles with the logo whole, the name, the label and a
 * link out. An older API sends neither list, and neither section shows.
 */
const SPONSORS = [
  { id: 11, kind: "sponsor", name: "Kinetic Labs", label: "Title sponsor", link: "https://kinetic.example/fest", logo: "https://s3.example/k.medium.png?Expires=1" },
  { id: 12, kind: "sponsor", name: "Arc Foundry", label: null, link: null, logo: null },
];
const PARTNERS = [
  { id: 21, kind: "partner", name: "Radio City", label: "Media partner", link: "https://radiocity.example", logo: { medium: "https://s3.example/r.medium.png", original: "https://s3.example/r.png" } },
  { id: 22, kind: "partner", name: "Plain Link Co", label: null, link: "http://plain.example", logo: null },
  { id: 23, kind: "partner", name: "  ", label: "nameless", link: null, logo: null },
];

const show = (data, { stable = false } = {}) => {
  const page = parseEventPage(data);
  return render(
    <MemoryRouter initialEntries={[`/events/${page.event.slug}`]}>
      <EventView page={stable ? stableEventPage(page) : page} />
    </MemoryRouter>
  );
};
const section = (name) => screen.getByRole("heading", { level: 2, name }).closest("section");

describe("an event's sponsors and partners", () => {
  it("are a Sponsors section then a Partners section, after the agenda, in the page's tabs too", () => {
    show(fullEvent({ sponsors: SPONSORS, partners: PARTNERS }));
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf("Sponsors")).toBe(headings.indexOf("Agenda") + 1);
    expect(headings.indexOf("Partners")).toBe(headings.indexOf("Sponsors") + 1);
    const tabs = screen.getByRole("navigation", { name: "On this page" });
    expect(within(tabs).getAllByRole("link").map((a) => a.textContent)).toEqual(["About", "Prizes", "Speakers", "Agenda", "Sponsors", "Partners", "Venue", "Guidelines", "Team", "Contact"]);
  });

  it("show each logo whole in a square tile, with the name, the label and a link out", () => {
    show(fullEvent({ sponsors: SPONSORS, partners: PARTNERS }));
    const sponsors = section("Sponsors");
    const tiles = within(sponsors).getAllByRole("listitem");
    expect(tiles.map((t) => t.querySelector(".ep-backer-name").textContent)).toEqual(["Kinetic Labs", "Arc Foundry"]);
    const kinetic = within(sponsors).getByRole("link", { name: "Kinetic Labs, Title sponsor (opens in a new tab)" });
    expect(kinetic).toHaveAttribute("href", "https://kinetic.example/fest");
    expect(kinetic).toHaveAttribute("target", "_blank");
    // A sponsor's link is a paid one, said so for search engines.
    expect(kinetic.getAttribute("rel").split(" ")).toEqual(expect.arrayContaining(["sponsored", "noopener", "noreferrer"]));
    const logo = kinetic.querySelector(".ep-backer-logo img");
    expect(logo).toHaveAttribute("src", SPONSORS[0].logo);
    expect(logo).toHaveAttribute("alt", "");
    // On white like every logo: a square one fills the tile, anything else is whole with room (LogoImg).
    expect(logo).toHaveClass("dc-logo-img");
    Object.defineProperty(logo, "naturalWidth", { configurable: true, value: 1330 });
    Object.defineProperty(logo, "naturalHeight", { configurable: true, value: 300 });
    fireEvent.load(logo);
    expect(logo).toHaveAttribute("data-fit", "whole");
    // No link, no logo: a plain tile with the initials.
    expect(tiles[1].querySelector("a")).toBeNull();
    expect(tiles[1].querySelector(".ep-backer-logo").textContent).toBe("AF");

    const partners = section("Partners");
    const radio = within(partners).getByRole("link", { name: /Radio City, Media partner/ });
    expect(radio.getAttribute("rel")).toBe("noopener noreferrer");
    expect(radio.querySelector("img")).toHaveAttribute("src", "https://s3.example/r.medium.png");
    // An http link is dropped, not shown; a nameless row is not a tile.
    expect(within(partners).getAllByRole("listitem")).toHaveLength(2);
    expect(within(partners).getByText("Plain Link Co").closest("a")).toBeNull();
  });

  it("say Sponsor and Partner for one of each", () => {
    show(fullEvent({ sponsors: SPONSORS.slice(0, 1), partners: PARTNERS.slice(0, 1) }));
    expect(screen.getByRole("heading", { level: 2, name: "Sponsor" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Partner" })).toBeInTheDocument();
  });

  it("show only the kind that has entries, and nothing from an API that sends neither", () => {
    const { unmount } = show(fullEvent({ sponsors: [], partners: PARTNERS.slice(0, 1) }));
    expect(screen.queryByRole("heading", { level: 2, name: /^Sponsors?$/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Partner" })).toBeInTheDocument();
    unmount();

    show(fullEvent());
    expect(screen.queryByRole("heading", { level: 2, name: /^(Sponsors?|Partners?)$/ })).toBeNull();
    expect(document.querySelector(".ep-backers")).toBeNull();
  });

  it("are read from the API's lists, an older API's absence as none", () => {
    const page = parseEventPage(fullEvent({ sponsors: SPONSORS, partners: PARTNERS }));
    expect(page.sponsors.map((b) => [b.kind, b.name, b.label, b.link])).toEqual([
      ["sponsor", "Kinetic Labs", "Title sponsor", "https://kinetic.example/fest"],
      ["sponsor", "Arc Foundry", null, null],
    ]);
    expect(page.partners.map((b) => [b.name, b.link, b.logo])).toEqual([
      ["Radio City", "https://radiocity.example", "https://s3.example/r.medium.png"],
      ["Plain Link Co", null, null],
    ]);
    const old = parseEventPage(fullEvent());
    expect(old.sponsors).toEqual([]);
    expect(old.partners).toEqual([]);
  });

  it("are on stable addresses on a cached page, which lead to the current logo", () => {
    const data = fullEvent({ sponsors: SPONSORS, partners: PARTNERS });
    const page = stableEventPage(parseEventPage(data));
    expect(JSON.stringify(page.sponsors)).not.toMatch(/s3\.example|Expires=/);
    expect(page.sponsors.map((b) => b.logo)).toEqual(["/media/events/hack-night-04/sponsors/11/logo", null]);
    expect(page.partners.map((b) => b.logo)).toEqual(["/media/events/hack-night-04/partners/21/logo", null]);

    const fresh = parseEventPage(data);
    const sponsor = mediaTarget(["events", "hack-night-04", "sponsors", "11", "logo"]);
    expect(sponsor).toMatchObject({ source: "event", what: "sponsor" });
    expect(sponsor.pick(fresh)).toBe(SPONSORS[0].logo);
    expect(mediaTarget(["events", "hack-night-04", "partners", "21", "logo"]).pick(fresh)).toBe("https://s3.example/r.medium.png");
    expect(mediaTarget(["events", "hack-night-04", "partners", "i0", "logo"]).pick(fresh)).toBe("https://s3.example/r.medium.png");
    expect(mediaTarget(["events", "hack-night-04", "sponsors", "99", "logo"]).pick(fresh)).toBeNull();
    for (const bad of [["events", "x", "sponsors", "a b", "logo"], ["events", "x", "sponsors", "1", "photo"], ["events", "x", "backers", "1", "logo"]]) {
      expect(mediaTarget(bad)).toBeNull();
    }

    show(data, { stable: true });
    expect(section("Sponsors").querySelector("img")).toHaveAttribute("src", "/media/events/hack-night-04/sponsors/11/logo");
  });
});
