import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { plansResponse } from "@/test/plansFixture";

const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn() } }));

const { parseHome } = await import("@/api/parse");
const { parsePlans } = await import("@/utils/pricing");
const { SitePage } = await import("./chrome");
const { ForClubsView } = await import("./forclubspage");
const { PricingView } = await import("./pricingpage");

/*
 * /for-clubs and /pricing as the server renders them (src/app/for-clubs,
 * src/app/pricing): the plans and the numbers it read are in the HTML.
 * Their heads and structured data: src/app/_tests/static-routes.test.js.
 */
const SIGNUP = "https://club-dashboard.myotherapp.in/signup";
const LOGIN = "https://club-dashboard.myotherapp.in/login";
const PLANS = () => parsePlans(plansResponse());
const HOME = () => parseHome({ stats: { upcoming_events: 128, clubs: 42, cities: 3 } });

function Where() {
  const l = useLocation();
  return <output data-testid="where">{`${l.pathname}${l.hash}`}</output>;
}

/** The two pages at their addresses, as the server would render each (`plans: null`: it couldn't read them). */
const at = (path, { plans = PLANS(), home = HOME() } = {}) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/for-clubs"
          element={
            <SitePage>
              <ForClubsView plans={plans} home={home} />
            </SitePage>
          }
        />
        <Route
          path="/pricing"
          element={
            <SitePage>
              <PricingView plans={plans} />
            </SitePage>
          }
        />
        <Route path="*" element={<SitePage>{null}</SitePage>} />
      </Routes>
      <Where />
    </MemoryRouter>
  );

beforeEach(() => {
  get.mockReset();
  window.scrollTo = vi.fn();
});

describe("/for-clubs", () => {
  it("sells the dashboard: the hero, the way in, every part of it, how to start, the plans, the questions", async () => {
    at("/for-clubs");
    const main = within(screen.getByRole("main"));
    expect(main.getByRole("heading", { level: 1 })).toHaveTextContent("Run your club’s events from one place.");

    const startFree = main.getAllByRole("link", { name: /^Start free/ });
    // The hero's and the last word's start the free trial (Pro named); a Free card's names Free.
    for (const a of startFree) expect(a.getAttribute("href")).toMatch(new RegExp(`^${SIGNUP.replace(/[.?]/g, "\\$&")}\\?plan=(pro|free)&cycle=monthly$`));
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

    // The plans, as the server read them: nothing asked from the browser.
    const pricing = screen.getByRole("region", { name: "Plans that grow with your club" });
    expect(pricing).toHaveAttribute("id", "pricing");
    expect(within(pricing).getByText("Most popular")).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
    expect(within(pricing).getByRole("link", { name: "Compare every plan in detail" })).toHaveAttribute("href", "/pricing#compare");
    expect(within(pricing).queryByRole("table")).toBeNull();
    expect(main.getByText("Paid plans from ₹299 a month")).toBeInTheDocument();
    expect(main.getByText("Try Growth free for 14 days")).toBeInTheDocument();
    expect(main.getByText(/Pay yearly and get 2 months free/)).toBeInTheDocument();

    // The live numbers.
    expect(main.getByText("on MyOtherApp right now", { exact: false })).toBeInTheDocument();
    expect(main.getByText("42").closest("p")).toHaveTextContent("42 clubs128 upcoming events");

    // Questions open in place, and point at the policy.
    const faq = screen.getByRole("region", { name: "Questions, answered" });
    const qs = [...faq.querySelectorAll("summary")].map((s) => s.textContent);
    expect(qs).toEqual(expect.arrayContaining(["How do payments and payouts work?", "How does the free trial work?", "What happens when the trial ends?", "Can we switch plans later?", "How much do we save by paying yearly?", "Can we cancel?"]));
    fireEvent.click(within(faq).getByText("How much do we save by paying yearly?"));
    expect(within(faq).getByText(/twelve months for the price of 10/)).toBeInTheDocument();
    expect(within(faq).getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    // No fee is added at checkout: the answer says so instead of pointing at fees in the Terms.
    expect(within(faq).getByText(/attendees pay exactly that/)).toBeInTheDocument();
    expect(within(faq).getByText(/Connect your own Razorpay account under Payments/)).toBeInTheDocument();
    for (const a of within(faq).getAllByRole("link", { name: "write to us" })) expect(a).toHaveAttribute("href", "mailto:support@myotherapp.in");

    // Nothing promised that isn't in the product.
    expect(screen.getByRole("main").textContent).not.toMatch(/coupon|ticket types|custom domain|SLA/i);
  });

  it("still sells, with a calm word about the plans, when the server couldn't read them", async () => {
    get.mockRejectedValueOnce(Object.assign(new Error("404"), { response: { status: 404 } }));
    at("/for-clubs", { plans: null, home: null });
    const pricing = screen.getByRole("region", { name: "Plans that grow with your club" });
    expect(await within(pricing).findByRole("heading", { name: "Pricing is loading…" })).toBeInTheDocument();
    expect(within(pricing).getByRole("link", { name: "See plans in the dashboard" })).toHaveAttribute("href", SIGNUP);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Start free/ })[0]).toHaveAttribute("href", `${SIGNUP}?plan=pro&cycle=monthly`);
    expect(screen.queryByText(/Paid plans from/)).toBeNull();
    expect(screen.queryByText("on MyOtherApp right now", { exact: false })).toBeNull();

    // Trying again once the API answers.
    get.mockResolvedValueOnce({ data: plansResponse() });
    fireEvent.click(within(pricing).getByRole("button", { name: "Try again" }));
    expect(await within(pricing).findByText("Most popular")).toBeInTheDocument();
  });
});

describe("/pricing", () => {
  it("is the plans on their own: a heading, the switch, the cards, the full comparison, the questions", () => {
    at("/pricing");
    expect(screen.getByRole("heading", { level: 1, name: "Plans for every club." })).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByRole("rowheader", { name: "Events a month" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Billing period" })).toBeInTheDocument();
    expect(screen.getByText("Every plan comes with").nextElementSibling.textContent).toBe(
      "Check-in at the doorCertificatesCustom registration questionsRatings and reviewsThreads to your followers"
    );
    expect(screen.getByRole("link", { name: /See everything clubs get/ })).toHaveAttribute("href", "/for-clubs");
    expect(screen.getByRole("region", { name: "Questions, answered" })).toBeInTheDocument();
  });

  it("has the comparison in the page for /pricing#compare to land on", () => {
    at("/pricing#compare");
    expect(screen.getByRole("table").closest("section")).toHaveAttribute("id", "compare");
  });
});

describe("routes and links", () => {
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
    for (const a of [...document.querySelectorAll("header a, footer a")]) expect(a.getAttribute("href")).not.toMatch(/club-dashboard/);

    fireEvent.click(forClubs);
    expect(screen.getByTestId("where").textContent).toBe("/for-clubs");
    expect(within(screen.getByRole("navigation", { name: "Discover" })).getByRole("link", { name: "For clubs" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Most popular")).toBeInTheDocument();
  });

  it("keeps /clubs as the club directory", () => {
    at("/clubs");
    const nav = screen.getByRole("navigation", { name: "Discover" });
    expect(within(nav).getByRole("link", { name: "Clubs" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "For clubs" })).not.toHaveClass("active");
  });
});
