import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AnswersNeededNote } from "./answersneeded.jsx";

/*
 * The "details needed" note (feature-register/missing-answers-contract.md
 * §2.4), as utils/answers.js parseAnswersNeeded hands it over: the cancelled
 * note's shape, in amber, with the person's own answers page as its link.
 */
const draw = (props) =>
  render(
    <MemoryRouter>
      <AnswersNeededNote {...props} />
    </MemoryRouter>,
  );
const HREF = "/answers/68/0b6e1f9a-4c1d-4d7e-9a51-1f2b3c4d5e6f?k=3f2a9c0d4e5b6a7f8091a2b3c4d5e6f7";

describe("the details-needed note", () => {
  it("says how many, links them, and gives the deadline in India time", () => {
    draw({ needed: { count: 2, href: HREF, deadline: "2026-11-14T12:30:00Z" } });
    const note = screen.getByRole("status");
    expect(note).toHaveClass("cx-note", "cx-note--needed");
    expect(note.querySelector(".cx-title")).toHaveTextContent("2 details needed · Add them");
    expect(screen.getByRole("link", { name: "Add them" })).toHaveAttribute("href", HREF);
    expect(note).toHaveTextContent("Add them by Sat, 14 Nov · 6:00 PM IST.");
    expect(note).toHaveTextContent("The organisers asked for a few more details. Your ticket stays as it is.");
  });

  it("compact, for a row: the count, the link and the deadline only", () => {
    draw({ needed: { count: 1, href: HREF, deadline: null }, compact: true, className: "me-answers" });
    const note = screen.getByRole("status");
    expect(note).toHaveClass("is-compact", "me-answers");
    expect(note).toHaveTextContent(/^1 detail needed · Add it$/);
  });

  it("names the registration for one under review, and says it without a count", () => {
    draw({ needed: { count: null, href: HREF, deadline: null }, what: "registration" });
    expect(screen.getByRole("status")).toHaveTextContent("Details needed · Add them");
    expect(screen.getByRole("status")).toHaveTextContent("Your registration stays as it is.");
  });

  it("is nothing without a link", () => {
    const { container } = draw({ needed: null });
    expect(container).toBeEmptyDOMElement();
    expect(draw({ needed: { count: 2, href: null } }).container).toBeEmptyDOMElement();
  });
});
