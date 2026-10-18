import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { plansResponse } from "@/test/plansFixture";

const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn() } }));

const { AppRoutes } = await import("@/test/routes");

const SIGNUP = "https://clubs-next.myotherapp.in/signup";
const LOGIN = "https://clubs-next.myotherapp.in/login";
const head = (selector) => document.head.querySelector(selector);
const jsonLd = () => [...document.head.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));

function Where() {
  const l = useLocation();
  return <output data-testid="where">{`${l.pathname}${l.hash}`}</output>;
}

const at = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <Where />
    </MemoryRouter>
  );

/** The API: plans and the home numbers; with `plans: false`, /plans isn't there yet. */
function api({ plans = true } = {}) {
  get.mockImplementation(async (url) => {
    if (url === "/api/v1/plans" && plans) return { data: plansResponse() };
    if (url === "/api/v1/discover/home") return { data: { stats: { upcoming_events: 128, clubs: 42, cities: 3 } } };
    throw Object.assign(new Error("404"), { response: { status: 404 } });
  });
}

beforeEach(() => {
  get.mockReset();
  window.scrollTo = vi.fn();
  api();
});

describe("/for-clubs", () => {
  it("sells the dashboard: the hero, the way in, every part of it, how to start, the plans, the questions", async () => {
    at("/for-clubs");
    const main = within(screen.getByRole("main"));
    expect(main.getByRole("heading", { level: 1 })).toHaveTextContent("Run your club’s events from one place.");

    const startFree = main.getAllByRole("link", { name: /^Start free/ });
    for (const a of startFree) expect(a).toHaveAttribute("href", `${SIGNUP}?plan=free&cycle=monthly`);
    expect(main.getByRole("link", { name: "See pricing" })).toHaveAttribute("href", "#pricing");
    expect(main.getByRole("link", { name: "Log in" })).toHaveAttribute("href", LOGIN);
    expect(main.getByRole("link", { name: "Log in to the clubs dashboard" })).toHaveAttribute("href", LOGIN);

    // The parts of an event, and each thing the dashboard does.
    for (const h of ["Fill the room", "Run the door", "Wrap it up", "Grow your club"]) expect(main.getByRole("heading", { level: 2, name: h })).toBeInTheDocument();
    for (const h of [
      "Events and registration",
      "Paid tickets through Razorpay",
      "QR tickets and check-in",
      "Kiosks and ID cards",
      "Certificates, designed by you",
      "Live room and competitions",
      "A website for your club",
      "Tracking links and analytics",
      "Emails and announcements",
      "Threads and followers",
      "Team access with roles",
      "Store, merch and swag",
      "Closeout reports",
      "Finance",
    ]) {
      expect(main.getByRole("heading", { level: 3, name: h })).toBeInTheDocument();
    }
    const how = screen.getByRole("region", { name: "Apply, get verified, go live." });
    expect(within(how).getAllByRole("listitem").map((li) => li.querySelector("h3").textContent)).toEqual(["Apply", "We verify your club", "Go live"]);

    // The plans arrive, from the API.
    const pricing = await screen.findByRole("region", { name: "Plans that grow with your club" });
    expect(pricing).toHaveAttribute("id", "pricing");
    expect(await within(pricing).findByText("Most popular")).toBeInTheDocument();
    expect(within(pricing).getByRole("link", { name: "Compare every plan in detail" })).toHaveAttribute("href", "/pricing#compare");
    expect(within(pricing).queryByRole("table")).toBeNull();
    expect(main.getByText("Paid plans from ₹299 a month")).toBeInTheDocument();
    expect(main.getByText("Try Growth free for 14 days")).toBeInTheDocument();
    expect(main.getByText(/Pay yearly and get 2 months free/)).toBeInTheDocument();

    // The live numbers.
    expect(await main.findByText("on MyOtherApp right now", { exact: false })).toBeInTheDocument();
    expect(main.getByText("42").closest("p")).toHaveTextContent("42 clubs128 upcoming events");

    // Questions open in place, and point at the policy.
    const faq = screen.getByRole("region", { name: "Questions, answered" });
    const qs = [...faq.querySelectorAll("summary")].map((s) => s.textContent);
    expect(qs).toEqual(expect.arrayContaining(["How do payments and payouts work?", "Is the Free plan really free?", "Can we switch plans later?", "How much do we save by paying yearly?", "Can we cancel?"]));
    fireEvent.click(within(faq).getByText("How much do we save by paying yearly?"));
    expect(within(faq).getByText(/twelve months for the price of 10/)).toBeInTheDocument();
    expect(within(faq).getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(within(faq).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    for (const a of within(faq).getAllByRole("link", { name: "write to us" })) expect(a).toHaveAttribute("href", "mailto:support@myotherapp.in");

    // Nothing promised that isn't in the product.
    expect(screen.getByRole("main").textContent).not.toMatch(/coupon|ticket types|custom domain|SLA/i);
  });

  it("carries its own title, canonical address and the plans as structured data", async () => {
    at("/for-clubs");
    await screen.findByText("Most popular");
    await waitFor(() => expect(document.title).toBe("MyOtherApp for clubs · Run your club's events from one place"));
    expect(head('link[rel="canonical"]')).toHaveAttribute("href", "https://myotherapp.in/for-clubs");
    expect(head('meta[property="og:url"]')).toHaveAttribute("content", "https://myotherapp.in/for-clubs");
    expect(head('meta[name="description"]').getAttribute("content")).toMatch(/^Registrations with your own questions/);
    expect(head('meta[name="robots"]')).toBeNull();
    const [ld] = jsonLd();
    expect(ld).toMatchObject({ "@type": "SoftwareApplication", url: "https://myotherapp.in/for-clubs" });
    expect(ld.offers.find((o) => o.name === "Growth, yearly")).toMatchObject({ price: 6990, priceCurrency: "INR" });
  });

  it("still sells, with a calm word about the plans, when /plans isn't there", async () => {
    api({ plans: false });
    at("/for-clubs");
    const pricing = screen.getByRole("region", { name: "Plans that grow with your club" });
    expect(await within(pricing).findByRole("heading", { name: "Pricing is loading…" })).toBeInTheDocument();
    expect(within(pricing).getByRole("link", { name: "See plans in the dashboard" })).toHaveAttribute("href", SIGNUP);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Start free/ })[0]).toHaveAttribute("href", `${SIGNUP}?plan=free&cycle=monthly`);
    expect(screen.queryByText(/Paid plans from/)).toBeNull();
    expect(jsonLd()).toEqual([]);

    // Trying again once the API answers.
    api();
    fireEvent.click(within(pricing).getByRole("button", { name: "Try again" }));
    expect(await within(pricing).findByText("Most popular")).toBeInTheDocument();
  });
});

describe("/pricing", () => {
  it("is the plans on their own: a heading, the switch, the cards, the full comparison, the questions", async () => {
    at("/pricing");
    expect(screen.getByRole("heading", { level: 1, name: "Plans for every club." })).toBeInTheDocument();
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("rowheader", { name: "Events a month" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Billing period" })).toBeInTheDocument();
    expect(screen.getByText("Every plan comes with").nextElementSibling.textContent).toBe(
      "Check-in at the doorCertificatesCustom registration questionsRatings and reviewsThreads to your followers"
    );
    expect(screen.getByRole("link", { name: /See everything clubs get/ })).toHaveAttribute("href", "/for-clubs");
    expect(screen.getByRole("region", { name: "Questions, answered" })).toBeInTheDocument();

    await waitFor(() => expect(document.title).toBe("Pricing · MyOtherApp for clubs"));
    expect(head('link[rel="canonical"]')).toHaveAttribute("href", "https://myotherapp.in/pricing");
    expect(jsonLd()[0]).toMatchObject({ "@type": "SoftwareApplication", url: "https://myotherapp.in/pricing" });
    expect(jsonLd()[0].offers).toHaveLength(9);
  });

  it("lands on the comparison from /pricing#compare once the plans are in", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    at("/pricing#compare");
    await screen.findByRole("table");
    await waitFor(() => expect(scrolled).toHaveBeenCalled());
    expect(scrolled.mock.contexts[0].id).toBe("compare");
    delete Element.prototype.scrollIntoView;
  });
});

describe("routes and links", () => {
  it("serves /for-clubs and /pricing at their fixed words, never as an old event address", async () => {
    at("/for-clubs");
    await screen.findByText("Most popular");
    at("/pricing");
    await screen.findAllByRole("table");
    expect(get).not.toHaveBeenCalledWith("/api/v1/discover/events/for-clubs", expect.anything());
    expect(get).not.toHaveBeenCalledWith("/api/v1/discover/events/pricing", expect.anything());
    expect(get).toHaveBeenCalledWith("/api/v1/plans", { skipAuth: true });
  });

  it("puts For clubs in the header (lit on /pricing too) and For clubs and Pricing in the footer, all on this site", async () => {
    at("/pricing");
    const nav = screen.getByRole("navigation", { name: "Discover" });
    const forClubs = within(nav).getByRole("link", { name: "For clubs" });
    expect(forClubs).toHaveAttribute("href", "/for-clubs");
    expect(forClubs).toHaveClass("active");
    const footer = screen.getByRole("navigation", { name: "MyOtherApp" });
    expect(within(footer).getByRole("link", { name: "For clubs" })).toHaveAttribute("href", "/for-clubs");
    expect(within(footer).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
    // No marketing link in the chrome goes straight to the dashboard.
    for (const a of [...document.querySelectorAll("header a, footer a")]) expect(a.getAttribute("href")).not.toMatch(/clubs-next/);

    fireEvent.click(forClubs);
    expect(screen.getByTestId("where").textContent).toBe("/for-clubs");
    expect(within(screen.getByRole("navigation", { name: "Discover" })).getByRole("link", { name: "For clubs" })).toHaveAttribute("aria-current", "page");
    await screen.findByText("Most popular");
  });

  it("keeps /clubs as the club directory", () => {
    at("/clubs");
    const nav = screen.getByRole("navigation", { name: "Discover" });
    expect(within(nav).getByRole("link", { name: "Clubs" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "For clubs" })).not.toHaveClass("active");
  });
});
