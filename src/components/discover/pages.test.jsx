import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LEGAL, PRIVACY, TERMS, plainText, updatedLabel } from "@/content/legal";
import { AboutView } from "./aboutpage";
import { SitePage } from "./chrome";
import { LegalPage } from "./legalpage";

/*
 * The site's own pages as the server renders them (src/app/about, privacy,
 * terms): their words are all in the HTML. Their heads are tested with the
 * routes (src/app/_tests/static-routes.test.js). The legal tests read the
 * text from @/content/legal, so they hold whatever its words are.
 */
const at = (path, page) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SitePage>{page}</SitePage>
    </MemoryRouter>
  );

describe("/about", () => {
  it("is who it is for, with the live numbers", () => {
    at("/about", <AboutView stats={{ upcoming_events: 128, clubs: 42, cities: 1 }} />);
    expect(screen.getByRole("heading", { level: 1, name: /Where student clubs run their events/ })).toBeInTheDocument();
    const live = screen.getByText("On MyOtherApp right now").closest(".dc-about-live");
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
  });

  it("shows the mark instead of numbers when the numbers couldn't be had", () => {
    const { container } = at("/about", <AboutView stats={null} />);
    expect(container.querySelector(".dc-about-live--mark")).not.toBeNull();
    expect(screen.queryByText("On MyOtherApp right now")).toBeNull();
  });
});

describe("the legal pages", () => {
  for (const doc of [PRIVACY, TERMS]) {
    it(`serve the ${doc.title} as a page to read: every heading and line, when it last changed, a list of its parts`, () => {
      at(doc.path, <LegalPage doc={doc} />);
      const main = screen.getByRole("main");
      expect(within(main).getByRole("heading", { level: 1, name: doc.title })).toBeInTheDocument();
      expect(within(main).getByText("Last updated", { exact: false })).toHaveTextContent(`Last updated ${updatedLabel(doc.updated)}`);
      expect(main.querySelector("time")).toHaveAttribute("dateTime", doc.updated);
      const toc = screen.getByRole("navigation", { name: "On this page" });
      for (const s of doc.sections) {
        const section = within(main).getByRole("region", { name: s.heading });
        expect(section).toHaveAttribute("id", s.id);
        expect(within(toc).getByRole("link", { name: s.heading })).toHaveAttribute("href", `#${s.id}`);
        const lists = s.blocks.filter(([kind]) => kind === "ul" || kind === "ol");
        expect(section.querySelectorAll("ul, ol")).toHaveLength(lists.length);
      }
      // Every line of the text is on the page, bold and links included.
      const text = main.textContent.replace(/\s+/g, " ");
      for (const [kind, body] of [...doc.intro, ...doc.sections.flatMap((s) => s.blocks)]) for (const line of kind === "ul" || kind === "ol" ? body : [body]) expect(text).toContain(plainText(line));
      expect(main.textContent).not.toMatch(/Finnet/i);
      // And it links across to the other.
      const other = doc.key === "privacy" ? LEGAL.terms : LEGAL.privacy;
      expect(within(screen.getByRole("complementary", { name: "More" })).getByRole("link", { name: new RegExp(other.title) })).toHaveAttribute("href", other.path);
    });
  }

  it("write the support address as a link", () => {
    at("/privacy", <LegalPage doc={PRIVACY} />);
    expect(screen.getAllByRole("link", { name: "support@myotherapp.in" })[0]).toHaveAttribute("href", "mailto:support@myotherapp.in");
  });
});
