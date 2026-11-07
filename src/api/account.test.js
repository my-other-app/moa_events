import { describe, expect, it } from "vitest";
import { parseMyEvent, siteHref } from "./account";

/* A link the API hands out (certificate_url), as the site links it: the API makes it, the site never does. */
describe("siteHref", () => {
  it.each([
    ["https://myotherapp.in/certificates/q7Hb2_kLm9Zx-41PwT0aRe", "/certificates/q7Hb2_kLm9Zx-41PwT0aRe"],
    ["https://www.myotherapp.in/certificates/MOA-7K3QF-X9PWM", "/certificates/MOA-7K3QF-X9PWM"],
    ["/certificates/abc?x=1#y", "/certificates/abc?x=1#y"],
    ["https://staging.example.org/certificates/abc", "https://staging.example.org/certificates/abc"],
  ])("%s → %s", (given, href) => {
    expect(siteHref(given)).toBe(href);
  });

  it.each([null, undefined, "", "   ", 42, "javascript:alert(1)", "data:text/html,x"])("%o is no link", (given) => {
    expect(siteHref(given)).toBeNull();
  });
});

describe("a registration's certificate", () => {
  const row = (over) => ({ id: 68, name: "Hack Night", ticket_id: "MOA-7K3QF-X9PWM", ...over });

  it("is the API's link, whatever id it carries", () => {
    expect(parseMyEvent(row({ certificate_url: "https://myotherapp.in/certificates/q7Hb2_kLm9Zx-41PwT0aRe" })).certificate).toBe("/certificates/q7Hb2_kLm9Zx-41PwT0aRe");
  });

  it("is none without one: never made from the ticket", () => {
    expect(parseMyEvent(row({ certificate_url: null })).certificate).toBeNull();
    expect(parseMyEvent(row({ has_certificate: true })).certificate).toBeNull();
  });
});
