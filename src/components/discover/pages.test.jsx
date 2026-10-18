import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn() } }));

const { AppRoutes } = await import("@/App.jsx");
const { PRIVACY, TERMS, plainText } = await import("@/content/legal");

const at = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>
  );

const head = (selector) => document.head.querySelector(selector);

beforeEach(() => {
  get.mockReset();
  window.scrollTo = vi.fn();
  get.mockImplementation(async (url) => {
    if (url === "/api/v1/discover/home") return { data: { stats: { upcoming_events: 128, clubs: 42, cities: 1 } } };
    throw Object.assign(new Error("404"), { response: { status: 404 } });
  });
});

describe("the site's own pages", () => {
  it("serves /about, never as an old event address, with the live numbers and both kinds of people it is for", async () => {
    at("/about");
    expect(screen.getByRole("heading", { level: 1, name: /Where student clubs run their events/ })).toBeInTheDocument();
    // Asked for the home numbers, and nothing about an event called "about".
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/discover/home", expect.anything()));
    expect(get).not.toHaveBeenCalledWith("/api/v1/discover/events/about", expect.anything());

    const live = (await screen.findByText("On MyOtherApp right now")).closest(".dc-about-live");
    expect(live).toHaveTextContent("128 upcoming events");
    expect(live).toHaveTextContent("42 clubs");
    // One city is not worth a number.
    expect(live).not.toHaveTextContent("city");

    const students = screen.getByRole("region", { name: /Find it, get in/ });
    for (const t of ["Discover events and clubs near you", "Register in a minute", "Tickets with QR entry", "Certificates", "Live rooms", "Club threads"]) {
      expect(within(students).getByRole("heading", { level: 3, name: t })).toBeInTheDocument();
    }
    const clubs = screen.getByRole("region", { name: /one dashboard/ });
    for (const t of ["Events, registrations and payments", "Check-in at the door", "Certificates", "Club websites", "Tracking links", "Analytics"]) {
      expect(within(clubs).getByRole("heading", { level: 3, name: t })).toBeInTheDocument();
    }
    // Clubs are sent to the page for clubs on this site, not straight to the dashboard.
    expect(within(clubs).getByRole("link", { name: /See everything clubs get/ })).toHaveAttribute("href", "/for-clubs");
    expect(within(clubs).getByRole("link", { name: "Plans and pricing" })).toHaveAttribute("href", "/pricing");
    for (const a of screen.getAllByRole("link", { name: /^For clubs/ })) expect(a).toHaveAttribute("href", "/for-clubs");
    expect(screen.getByRole("main").querySelector('a[href*="clubs-next"]')).toBeNull();
    expect(within(screen.getByRole("region", { name: /three steps/ })).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "support@myotherapp.in" })).toHaveAttribute("href", "mailto:support@myotherapp.in");
    expect(within(screen.getByRole("main")).getByRole("link", { name: "Get it on Google Play" })).toBeInTheDocument();

    await waitFor(() => expect(document.title).toBe("About MyOtherApp"));
    expect(head('link[rel="canonical"]')).toHaveAttribute("href", "https://myotherapp.in/about");
    expect(head('meta[property="og:url"]')).toHaveAttribute("content", "https://myotherapp.in/about");
    expect(head('meta[name="robots"]')).toBeNull();
  });

  it("shows the mark instead of numbers when the numbers can't be had", async () => {
    get.mockRejectedValue(new Error("offline"));
    const { container } = at("/about");
    await waitFor(() => expect(container.querySelector(".dc-about-live--mark")).not.toBeNull());
    expect(screen.queryByText("On MyOtherApp right now")).toBeNull();
  });

  it("serves the Privacy Policy as a page to read: headings, lists, when it last changed, indexable", async () => {
    at("/privacy");
    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
    expect(within(main).getByText("Last updated", { exact: false })).toHaveTextContent("Last updated 18 October 2026");
    expect(main.querySelector("time")).toHaveAttribute("dateTime", "2026-10-18");
    const sections = within(main).getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(sections).toEqual(expect.arrayContaining(PRIVACY.sections.map((s) => s.heading)));
    const collect = within(main).getByRole("region", { name: "1. What We Collect" });
    expect(within(collect).getAllByRole("listitem")).toHaveLength(PRIVACY.sections[0].blocks[1][1].length);
    expect(within(collect).getByText("Account details:")).toContainHTML("Account details:");
    // What the app sends and what people post are named, not waved at.
    for (const t of ["push-notification token", "Firebase Crashlytics", "Firebase Analytics", "answers to the organiser's questions", "Reports and blocks:"])
      expect(collect.textContent).toContain(t);
    expect(within(main).getAllByRole("link", { name: "support@myotherapp.in" })[0]).toHaveAttribute("href", "mailto:support@myotherapp.in");
    // The section list jumps to each part.
    expect(within(screen.getByRole("navigation", { name: "On this page" })).getByRole("link", { name: "8. Cookies & Tracking" })).toHaveAttribute(
      "href",
      "#cookies-and-tracking"
    );
    // The app's old claims are gone: it asks for no location, and has no Mixpanel.
    expect(main.textContent).not.toMatch(/Mixpanel|college ID|because it's a mobile app/);
    // The old name is gone.
    expect(main.textContent).not.toMatch(/Finnet/i);
    expect(main.textContent).toContain("Welcome to MyOtherApp! We care about your privacy");

    await waitFor(() => expect(document.title).toBe("Privacy Policy · MyOtherApp"));
    expect(head('link[rel="canonical"]')).toHaveAttribute("href", "https://myotherapp.in/privacy");
    expect(head('meta[name="description"]').getAttribute("content")).toMatch(/collects, uses/);
    expect(head('meta[name="robots"]')).toBeNull();
  });

  it("opens /privacy#delete-account, the page Google Play links to, on how to delete an account", async () => {
    const scrolled = vi.fn();
    const had = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function () {
      scrolled(this.id);
    };
    try {
      at("/privacy#delete-account");
      const section = screen.getByRole("region", { name: "6. Deleting Your Account" });
      expect(section).toHaveAttribute("id", "delete-account");
      // After the page starts at the top, it moves to the section.
      await waitFor(() => expect(scrolled).toHaveBeenCalledWith("delete-account"));
      // The steps in the app, in order.
      const steps = within(section).getByRole("heading", { level: 3, name: "In the app" }).nextElementSibling;
      expect(steps.tagName).toBe("OL");
      expect([...steps.children].map((li) => li.textContent)).toEqual([
        "Open the Profile tab and tap Settings.",
        "Scroll to the bottom and tap Delete Account.",
        "Tap DELETE to confirm. You're signed out straight away.",
      ]);
      // The way by email, and what goes and what stays.
      expect(within(section).getByRole("link", { name: "support@myotherapp.in" })).toHaveAttribute("href", "mailto:support@myotherapp.in");
      for (const h of ["By email", "What is deleted", "What is kept"]) expect(within(section).getByRole("heading", { level: 3, name: h })).toBeInTheDocument();
      expect(section.textContent).toContain("Payment records:");
      expect(section.textContent).toContain("not erased straight away");
    } finally {
      Element.prototype.scrollIntoView = had;
    }
  });

  it("serves the Terms with every part of their text, the rules for posts and how to report, and links across to the policy", async () => {
    at("/terms");
    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { level: 1, name: "Terms and Conditions" })).toBeInTheDocument();
    for (const s of TERMS.sections) expect(within(main).getByRole("heading", { level: 2, name: s.heading })).toBeInTheDocument();
    expect(within(main).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toContain("Exclusions and Jurisdiction");
    const duties = within(main).getByRole("region", { name: "User Responsibilities" });
    expect(duties.querySelector("ol").children).toHaveLength(4);
    // Every line of the text is on the page.
    const text = main.textContent.replace(/\s+/g, " ");
    for (const s of TERMS.sections)
      for (const [kind, body] of s.blocks) for (const line of kind === "ul" || kind === "ol" ? body : [body]) expect(text).toContain(plainText(line));
    expect(text).not.toMatch(/Myotherapp/);
    expect(within(main.querySelector(".dc-prose")).getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    // What the stores ask of an app with people's posts in it: rules, a way to report and block, and a promise to act.
    const rules = within(main).getByRole("region", { name: "Acceptable Use" });
    expect(rules).toHaveTextContent("zero tolerance for objectionable content and abusive users");
    for (const t of ["Spam:", "Harassment:", "Hate:", "Sexual content:", "Violence:", "Misinformation:", "Illegal content:", "Impersonation:"])
      expect(within(rules).getByText(t)).toBeInTheDocument();
    const reporting = within(main).getByRole("region", { name: "Reporting and Blocking" });
    expect(reporting).toHaveTextContent(
      "We review reports and act within 24 hours, which may include removing content and suspending or terminating accounts."
    );
    expect(reporting).toHaveTextContent("Report comment");
    expect(reporting).toHaveTextContent("Settings → Blocked Users");
    expect(within(reporting).getByRole("link", { name: "support@myotherapp.in" })).toHaveAttribute("href", "mailto:support@myotherapp.in");
    expect(text).not.toMatch(/do not actively monitor/i);
    // No fee the checkout doesn't charge.
    expect(text).not.toMatch(/2% processing fee/);
    expect(within(main).getAllByRole("link", { name: /delete your account/i })[0]).toHaveAttribute("href", "/privacy#delete-account");
    await waitFor(() => expect(head('link[rel="canonical"]')).toHaveAttribute("href", "https://myotherapp.in/terms"));
    cleanup();
  });
});
