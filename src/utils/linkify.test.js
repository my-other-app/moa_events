import { describe, expect, it } from "vitest";
import { linkify, safeHref } from "./linkify";

const links = (text) => linkify(text).filter((t) => t.type === "link");

describe("linking a club's text", () => {
  it("links web addresses and email addresses, and keeps the rest as text", () => {
    const parts = linkify("See https://example.org/a?b=1 or www.example.com, and mail hi@example.org.");
    expect(parts.map((p) => p.type)).toEqual(["text", "link", "text", "link", "text", "link", "text"]);
    expect(links("See https://example.org/a?b=1")[0]).toEqual({ type: "link", value: "https://example.org/a?b=1", href: "https://example.org/a?b=1" });
    expect(links("www.example.com")[0].href).toBe("https://www.example.com/");
    expect(links("hi@example.org")[0].href).toBe("mailto:hi@example.org");
    expect(parts.map((p) => p.value).join("")).toBe("See https://example.org/a?b=1 or www.example.com, and mail hi@example.org.");
  });

  it("leaves sentence punctuation out of a link, but keeps a bracket the link opened", () => {
    expect(links("(see https://example.org/x).")[0].value).toBe("https://example.org/x");
    expect(links("https://en.wikipedia.org/wiki/Foo_(bar)")[0].value).toBe("https://en.wikipedia.org/wiki/Foo_(bar)");
  });

  it("never links anything but http(s) and mail", () => {
    expect(links("javascript:alert(1) data:text/html,hi")).toEqual([]);
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("ftp://example.org")).toBeNull();
    expect(safeHref("example.org/path")).toBe("https://example.org/path");
  });

  it("treats markup as text", () => {
    expect(linkify("<b>hi</b>")).toEqual([{ type: "text", value: "<b>hi</b>" }]);
  });
});
