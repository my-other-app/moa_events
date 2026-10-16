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
  club: { id: 3, name: "Circuit Society", slug: "circuit-society", logo: null },
  going: 42,
  status: "upcoming",
};

const card = (over = {}) => {
  const event = parseEvent({ ...base, ...over });
  const view = render(
    <MemoryRouter>
      <EventCard event={event} />
    </MemoryRouter>
  );
  return within(view.container.querySelector("article"));
};

describe("an event card", () => {
  it("shows the club, poster, title, IST time, place, price and who's going, and links to the event page", () => {
    const c = card();
    expect(c.getByRole("link", { name: "Hack Night 04" })).toHaveAttribute("href", "/68");
    expect(c.getByRole("link", { name: /Circuit Society/ })).toHaveAttribute("href", "/clubs/circuit-society");
    expect(c.getByAltText("Poster for Hack Night 04")).toHaveAttribute("src", base.poster);
    expect(c.getByText("Sat, 17 Oct · 6:00 PM")).toBeInTheDocument();
    expect(c.getByText("Lab 3B, COEP")).toBeInTheDocument();
    expect(c.getByText("· 2.4 km away")).toBeInTheDocument();
    expect(c.getByText("42 going")).toBeInTheDocument();
  });

  it("marks a free event Free, and a paid one with its price and no pill", () => {
    let c = card();
    expect(c.getAllByText("Free")).toHaveLength(2); // the pill and the price
    c = card({ id: 69, has_fee: true, fee: 199 });
    expect(c.getByText("₹199")).toBeInTheDocument();
    expect(c.queryByText("Free")).toBeNull();
  });

  it("puts the most pressing status on the poster", () => {
    expect(card({ id: 1, status: "live", has_fee: true, fee: 50 }).getByText("Live now")).toBeInTheDocument();
    expect(card({ id: 2, status: "closing_soon" }).getByText("Closing soon")).toBeInTheDocument();
    expect(card({ id: 3, status: "full" }).getByText("Full")).toBeInTheDocument();
  });

  it("says Online for an online event, with no distance, and hides a zero going count", () => {
    const c = card({ id: 70, is_online: true, location_name: null, going: 0 });
    expect(c.getByText("Online")).toBeInTheDocument();
    expect(c.queryByText(/km away/)).toBeNull();
    expect(c.queryByText(/going/)).toBeNull();
  });

  it("keeps the space for a missing poster and still names the event", () => {
    const c = card({ id: 71, poster: null, club: null });
    expect(c.queryByRole("img")).toBeNull();
    expect(c.getAllByText("Hack Night 04").length).toBeGreaterThan(1);
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
