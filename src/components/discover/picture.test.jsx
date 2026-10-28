import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryRouter } from "react-router-dom";
import { parseClubPage, parseEvent } from "@/api/discover";
import { Avatar } from "./bits";
import { ClubCard } from "./clubcard";
import { ClubView } from "./clubpage";
import { EventCard } from "./eventcard";
import { LogoImg, PosterImg } from "./picture";

/*
 * The club pictures' frames (utils/pictures.js): a poster whole in 4:5 on a
 * blurred copy of itself, a logo whole on white unless it is square, a
 * banner 3:1. The frames' shapes are the stylesheets' (checked below).
 */

const styles = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "styles");
const css = ["discover.css", "cards-hero.css", "event-page.css", "account.css", "register.css"].map((f) => readFileSync(join(styles, f), "utf8")).join("\n");
/** The declarations of the first rule whose selector is exactly `selector`. */
const rule = (selector) => {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) return null;
  return css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
};

/** Pretends the browser loaded the picture at its natural size. */
function loaded(img, width, height) {
  Object.defineProperty(img, "naturalWidth", { configurable: true, value: width });
  Object.defineProperty(img, "naturalHeight", { configurable: true, value: height });
  fireEvent.load(img);
}

afterEach(() => vi.restoreAllMocks());

describe("a poster", () => {
  it("is drawn whole over a blurred copy of itself, the poster first", () => {
    const { container } = render(<PosterImg src="https://cdn.example/p.jpg" alt="Poster for Hack Night" />);
    const frame = container.querySelector(".dc-poster");
    const [poster, copy] = frame.querySelectorAll("img");
    expect(poster).toHaveClass("dc-poster-img");
    expect(poster).toHaveAttribute("alt", "Poster for Hack Night");
    expect(copy).toHaveClass("dc-poster-bg");
    expect(copy).toHaveAttribute("alt", "");
    expect(copy).toHaveAttribute("aria-hidden", "true");
    expect(copy).toHaveAttribute("src", "https://cdn.example/p.jpg");
    expect(rule(".dc-poster-img")).toMatch(/object-fit:\s*contain/);
    expect(rule(".dc-poster > .dc-poster-bg")).toMatch(/object-fit:\s*cover/);
    expect(rule(".dc-poster > .dc-poster-bg")).toMatch(/filter:\s*blur\(20px\)/);
  });

  it("hides its copy once it turns out to be 4:5, and keeps it for any other shape", () => {
    const four = render(<PosterImg src="https://cdn.example/a.jpg" alt="A" />);
    loaded(screen.getByAltText("A"), 1080, 1350);
    expect(four.container.querySelector(".dc-poster")).toHaveAttribute("data-shape", "exact");
    const wide = render(<PosterImg src="https://cdn.example/b.jpg" alt="B" />);
    loaded(screen.getByAltText("B"), 1600, 900);
    expect(wide.container.querySelector(".dc-poster")).not.toHaveAttribute("data-shape");
    expect(css).toMatch(/\.dc-poster\[data-shape="exact"\] \.dc-poster-bg \{\s*display: none;/);
  });

  it("gives way to its fallback when it fails, never a blurred empty box", () => {
    render(<PosterImg src="https://cdn.example/gone.jpg" alt="Gone" fallback={<span>drawn cover</span>} extra={<span>12 Nov</span>} />);
    fireEvent.error(screen.getByAltText("Gone"));
    expect(screen.getByText("drawn cover")).toBeInTheDocument();
    expect(document.querySelector(".dc-poster")).toBeNull();
    expect(screen.queryByText("12 Nov")).toBeNull();
  });

  it("fades in as a lazy one arrives, and never holds back an eager one", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(false);
    const lazy = render(<PosterImg src="https://cdn.example/l.jpg" alt="Lazy" />);
    const frame = lazy.container.querySelector(".dc-poster");
    expect(frame).toHaveAttribute("data-fade", "wait");
    fireEvent.load(screen.getByAltText("Lazy"));
    expect(frame).toHaveAttribute("data-fade", "in");
    const eager = render(<PosterImg src="https://cdn.example/e.jpg" alt="Eager" loading="eager" fetchPriority="high" />);
    expect(eager.container.querySelector(".dc-poster")).not.toHaveAttribute("data-fade");
    expect(screen.getByAltText("Eager")).toHaveAttribute("fetchpriority", "high");
  });

  it("is in a 4:5 frame wherever one shows", () => {
    for (const frame of [".dc-evcard-media", ".dc-fan-media", ".me-thumb", ".rg-thumb"]) expect(rule(frame), frame).toMatch(/aspect-ratio:\s*4 \/ 5/);
    expect(css).toMatch(/\.ep-poster \{[^}]*aspect-ratio:\s*4 \/ 5/);
  });

  it("on a card, asks for the large size (about twice the card), a row's for the thumbnail", () => {
    const poster = { thumbnail: "https://cdn.example/t.jpg", medium: "https://cdn.example/m.jpg", large: "https://cdn.example/l.jpg", original: "https://cdn.example/o.jpg" };
    const event = parseEvent({ id: 1, name: "Hack Night", poster, starts_at: "2026-11-12T12:30:00Z", club: { id: 3, name: "C", slug: "c", logo: null } });
    render(
      <MemoryRouter>
        <EventCard event={event} />
        <EventCard event={{ ...event, id: 2, name: "Row" }} variant="row" />
      </MemoryRouter>
    );
    const [card, row] = screen.getAllByAltText(/Poster for/);
    expect(card).toHaveAttribute("src", "https://cdn.example/l.jpg");
    expect(row).toHaveAttribute("src", "https://cdn.example/t.jpg");
    expect(row.closest(".dc-poster")).toHaveClass("dc-poster--small");
  });
});

describe("a logo", () => {
  it("fills its frame when square, and is shown whole, with room, on white when it is not", () => {
    render(
      <>
        <LogoImg src="https://cdn.example/square.png" alt="Square" />
        <LogoImg src="https://cdn.example/word.png" alt="Wordmark" />
      </>
    );
    const square = screen.getByAltText("Square");
    const word = screen.getByAltText("Wordmark");
    loaded(square, 1080, 1080);
    loaded(word, 1330, 300);
    expect(square).toHaveAttribute("data-fit", "fill");
    expect(word).toHaveAttribute("data-fit", "whole");
    expect(rule(".dc-logo-img")).toMatch(/background:\s*#fff/);
    // Whole until it is known: a wide one is never cut, even before the script runs.
    expect(rule(".dc-logo-img")).toMatch(/object-fit:\s*contain/);
    expect(css).toMatch(/\.dc-avatar \.dc-logo-img\[data-fit="whole"\] \{\s*padding: 16%;/);
    expect(css).toMatch(/\.dc-ptile-logo \.dc-logo-img\[data-fit="whole"\] \{\s*padding: 10%;/);
  });

  it("in a club's disc asks for the size it needs, and shows the initial without one", () => {
    const logo = { thumbnail: "https://cdn.example/l-t.png", medium: "https://cdn.example/l-m.png", original: "https://cdn.example/l.png" };
    const { container } = render(
      <>
        <Avatar name="Small" src={logo} size={44} alt="small" />
        <Avatar name="Big" src={logo} size={104} alt="big" />
        <Avatar name="Robotics" src={null} size={44} />
      </>
    );
    expect(screen.getByAltText("small")).toHaveAttribute("src", "https://cdn.example/l-t.png");
    expect(screen.getByAltText("big")).toHaveAttribute("src", "https://cdn.example/l-m.png");
    expect(screen.getByAltText("big")).toHaveClass("dc-logo-img");
    expect(container.querySelectorAll(".dc-avatar")[2]).toHaveTextContent("R");
  });

  it("on a club's partner wall sits in a square tile", () => {
    const data = parseClubPage({
      club: { id: 3, slug: "c", name: "Circuit Society" },
      partners: [{ name: "Acme", role: "Hardware partner", logo: "https://cdn.example/acme.png" }],
    });
    const { container } = render(
      <MemoryRouter>
        <ClubView data={data} />
      </MemoryRouter>
    );
    const tile = container.querySelector(".dc-ptile-logo");
    expect(tile.querySelector("img")).toHaveClass("dc-logo-img");
    expect(rule(".dc-ptile-logo")).toMatch(/aspect-ratio:\s*1;/);
  });
});

describe("a banner", () => {
  it("is 3:1 on a club's card and on its page, at every width", () => {
    expect(rule(".dc-ccard-cover")).toMatch(/aspect-ratio:\s*3 \/ 1/);
    expect(rule(".dc-club-cover")).toMatch(/aspect-ratio:\s*3 \/ 1/);
    expect(css).not.toMatch(/\.dc-club-cover \{[^}]*16 \/ 9/);
    expect(css).not.toMatch(/\.dc-ccard-cover \{[^}]*16 \/ 7/);
  });

  it("asks a card for its medium (the banner has no thumbnail)", () => {
    const club = { id: 3, slug: "c", name: "C", cover: { medium: "https://cdn.example/c-m.jpg", large: "https://cdn.example/c-l.jpg" }, logo: null, interests: [], followers: 1 };
    const { container } = render(
      <MemoryRouter>
        <ClubCard club={club} />
      </MemoryRouter>
    );
    expect(container.querySelector(".dc-ccard-cover > img")).toHaveAttribute("src", "https://cdn.example/c-m.jpg");
  });
});
