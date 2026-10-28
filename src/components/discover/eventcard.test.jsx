import { describe, expect, it } from "vitest";
import { render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { parseEvent } from "@/api/discover";
import { formatPrice, formatWhen, timeAgo } from "@/utils/format";
import { EventCard } from "./eventcard";

const base = {
  id: 68,
  name: "Hack Night 04",
  poster: "https://cdn.example/poster.jpg",
  starts_at: "2026-10-17T12:30:00Z",
  location_name: "Lab 3B, COEP",
  is_online: false,
  distance_km: 2.43,
  has_fee: false,
  fee: null,
  category: { id: 1, name: "Workshop" },
  club: { id: 3, name: "Circuit Society", slug: "circuit-society", logo: null },
  going: 42,
  capacity: null,
  status: "upcoming",
};

const show = (over = {}, props = {}) => {
  // The API is adding `slug`; until the parser passes it on, a test sets it on the parsed event.
  const { slug, ...rest } = over;
  const event = { ...parseEvent({ ...base, ...rest }), ...(slug ? { slug } : {}) };
  const view = render(
    <MemoryRouter>
      <EventCard event={event} {...props} />
    </MemoryRouter>
  );
  const article = view.container.querySelector("article");
  return { c: within(article), article };
};

describe("an event card", () => {
  it("shows the club, poster, title, IST time, place, price and who's going, as one link to the event", () => {
    const { c, article } = show();
    expect(c.getAllByRole("link")).toHaveLength(1);
    expect(c.getByRole("link", { name: "Hack Night 04" })).toHaveAttribute("href", "/68");
    expect(c.getByText("Circuit Society")).toBeInTheDocument();
    expect(c.getByAltText("Poster for Hack Night 04")).toHaveAttribute("src", base.poster);
    expect(c.getByText("Sat, 17 Oct · 6:00 PM")).toBeInTheDocument();
    expect(c.getByText("Lab 3B, COEP")).toBeInTheDocument();
    expect(c.getByText("· 2.4 km away")).toBeInTheDocument();
    expect(c.getByText("42 going")).toBeInTheDocument();
    // The date pinned to the poster, in India time.
    const badge = article.querySelector(".dc-datebadge");
    expect(badge).toHaveTextContent("Oct17");
    expect(article.querySelector(".dc-cover")).toBeNull();
  });

  it("draws a cover with the category and the date when there is no poster, and names the event only once", () => {
    const { c, article } = show({ id: 71, poster: null, club: null });
    expect(c.queryByRole("img")).toBeNull();
    const cover = article.querySelector(".dc-cover");
    expect(cover).not.toBeNull();
    expect(cover).toHaveAttribute("aria-hidden", "true");
    expect(within(cover).getByText("Workshop")).toBeInTheDocument();
    expect(within(cover).getByText("17")).toBeInTheDocument();
    expect(within(cover).getByText("Oct")).toBeInTheDocument();
    expect(within(cover).getByText("Sat")).toBeInTheDocument();
    expect(within(cover).queryByText("Hack Night 04")).toBeNull();
    expect(c.getAllByText("Hack Night 04")).toHaveLength(1);
    // No separate badge: the cover already carries the date.
    expect(article.querySelector(".dc-datebadge")).toBeNull();
  });

  it("draws the same cover for the same event every time, and different ones for its neighbours", () => {
    const look = (id) => show({ id, poster: null }).article.querySelector(".dc-cover").className;
    expect(look(60)).toBe(look(60));
    expect(new Set([look(60), look(61), look(62)]).size).toBe(3);
  });

  it("opens the event by its slug when it has one, and by its id until then", () => {
    expect(show({ slug: "hack-night-04" }).c.getByRole("link", { name: "Hack Night 04" })).toHaveAttribute("href", "/events/hack-night-04");
    expect(show({ id: 70 }).c.getByRole("link", { name: "Hack Night 04" })).toHaveAttribute("href", "/70");
  });

  it("marks a free event Free, and a paid one with its price and no Free chip", () => {
    let { c } = show();
    expect(c.getAllByText("Free")).toHaveLength(2); // the quiet chip and the price
    ({ c } = show({ id: 69, has_fee: true, fee: 199 }));
    expect(c.getByText("₹199")).toBeInTheDocument();
    expect(c.queryByText("Free")).toBeNull();
  });

  it("puts the most pressing status on the poster, and greys out an event that is over", () => {
    expect(show({ id: 1, status: "live", has_fee: true, fee: 50 }).c.getByText("Live now")).toBeInTheDocument();
    const closing = show({ id: 2, status: "closing_soon" }).c;
    expect(closing.getByText("Closing soon")).toBeInTheDocument();
    expect(closing.getAllByText("Free")).toHaveLength(2);
    // Full or over: no point saying it is free.
    const full = show({ id: 3, status: "full" }).c;
    expect(full.getByText("Full")).toBeInTheDocument();
    expect(full.getAllByText("Free")).toHaveLength(1);
    const ended = show({ id: 4, status: "ended" });
    expect(ended.c.getByText("Ended")).toBeInTheDocument();
    expect(ended.article).toHaveClass("is-ended");
    expect(show({ id: 5 }).article).not.toHaveClass("is-ended");
  });

  it("never shows a 0 for a missing fee, capacity or going count", () => {
    const { c, article } = show({ id: 6, has_fee: true, fee: null, capacity: null, going: 0 });
    expect(c.getByText("Paid")).toBeInTheDocument();
    expect(c.queryByText(/₹0/)).toBeNull();
    expect(c.queryByText(/seats?\b/)).toBeNull();
    expect(c.queryByText(/going/)).toBeNull();
    expect(c.queryByText("0")).toBeNull();
    expect(article.querySelector(".dc-evcard-bar")).toBeNull();
    // A capacity of 0 means "not set", not "no seats".
    expect(show({ id: 7, capacity: 0, going: 0 }).c.queryByText(/seats?\b/)).toBeNull();
  });

  it("shows how full it is when the club set a capacity", () => {
    expect(show({ id: 8, capacity: 100, going: 0 }).c.getByText("100 seats")).toBeInTheDocument();
    const filling = show({ id: 9, capacity: 100, going: 37 });
    expect(filling.c.getByText(/63 left/)).toBeInTheDocument();
    expect(filling.c.getByText(/37 of 100 taken/)).toBeInTheDocument();
    expect(filling.article.querySelector(".dc-evcard-bar span")).toHaveStyle({ width: "37%" });
    expect(show({ id: 10, capacity: 100, going: 88 }).c.getByText(/12 seats left/)).toBeInTheDocument();
    expect(show({ id: 11, capacity: 100, going: 99 }).c.getByText(/1 seat left/)).toBeInTheDocument();
    expect(show({ id: 12, capacity: 50, going: 50, status: "full" }).c.queryByText(/left|seats/)).toBeNull();
  });

  it("says Online for an online event, with no distance, and hides a zero going count", () => {
    const { c } = show({ id: 70, is_online: true, location_name: null, going: 0 });
    expect(c.getByText("Online")).toBeInTheDocument();
    expect(c.queryByText(/km away/)).toBeNull();
    expect(c.queryByText(/going/)).toBeNull();
  });

  it("can leave out the club row on the club's own page", () => {
    const { c, article } = show({ id: 73 }, { showClub: false });
    expect(c.queryByText("Circuit Society")).toBeNull();
    expect(article.querySelector(".dc-evcard-club")).toBeNull();
  });

  it("has a compact sideways version for dense lists", () => {
    const { c, article } = show({ id: 72, poster: null, status: "closing_soon", slug: "hack-night-04" }, { variant: "row", headingLevel: 4 });
    expect(article).toHaveClass("dc-evcard--row");
    expect(c.getByRole("heading", { level: 4, name: "Hack Night 04" })).toBeInTheDocument();
    expect(c.getByRole("link", { name: "Hack Night 04" })).toHaveAttribute("href", "/events/hack-night-04");
    expect(c.getAllByText("Hack Night 04")).toHaveLength(1);
    expect(c.getByText("Sat, 17 Oct · 6:00 PM")).toBeInTheDocument();
    expect(c.getByText("Closing soon")).toBeInTheDocument();
    expect(c.getByText("Free")).toBeInTheDocument(); // the price only, no chip
    expect(c.queryByText("Circuit Society")).toBeNull();
    expect(article.querySelector(".dc-evcard-pills")).toBeNull();
    expect(article.querySelector(".dc-cover")).not.toBeNull();
  });
});

describe("the formats", () => {
  it("prices and times", () => {
    expect(formatPrice(false, 100)).toBe("Free");
    expect(formatPrice(true, 1499)).toBe("₹1,499");
    expect(formatPrice(true, null)).toBe("Paid");
    expect(formatWhen("garbage")).toBe("");
    const now = Date.parse("2026-10-16T12:00:00Z");
    expect(timeAgo("2026-10-16T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-16T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-10-01T09:00:00Z", now)).toBe("1 Oct");
  });
});

describe("the High demand pill", () => {
  it("sits on the poster when the club has its label on, beside the other pills", () => {
    const { c, article } = show({ high_demand: true, status: "closing_soon" });
    const pill = c.getByText("High demand");
    expect(pill).toHaveClass("dc-pill", "dc-pill--demand");
    expect(article.querySelector(".dc-evcard-pills")).toHaveTextContent("Closing soonHigh demandFree");
  });

  it("isn't there without the label, from an API that doesn't send it, or once it has ended", () => {
    expect(show({ high_demand: false }).c.queryByText("High demand")).toBeNull();
    expect(show().c.queryByText("High demand")).toBeNull();
    expect(show({ high_demand: true, status: "ended" }).c.queryByText("High demand")).toBeNull();
  });

  it("the compact row says it beside the status", () => {
    const { c } = show({ high_demand: true, status: "closing_soon" }, { variant: "row" });
    expect(c.getByText("High demand")).toHaveClass("dc-evcard-status", "dc-evcard-status--demand");
    expect(c.getByText("Closing soon")).toBeInTheDocument();
  });
});
