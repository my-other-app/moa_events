// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * What a phone's narrow width asks of the live room's stylesheets (jsdom
 * lays nothing out, so the rules are read where they are written): the
 * title at the top wraps between words instead of losing its end, and a
 * donut's legend takes its own row under the ring rather than wrapping
 * word by word beside it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const live = strip(readFileSync(join(here, "live.css"), "utf8"));
const room = strip(readFileSync(join(here, "liveroom.css"), "utf8"));

/** The declarations of the first rule for `selector` (outside any at-rule), as {prop: value}. */
function rule(css, selector) {
  const at = css.search(new RegExp(`(^|[}\\s])${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`));
  if (at < 0) throw new Error(`no rule for ${selector}`);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  return Object.fromEntries(
    body
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()])
  );
}

describe("the top of the room", () => {
  it("lets the title take two lines, broken between words, instead of an ellipsis", () => {
    const h1 = rule(live, ".live-top h1");
    expect(h1["white-space"]).toBeUndefined();
    expect(h1["text-overflow"]).toBeUndefined();
    expect(h1["-webkit-line-clamp"]).toBe("2");
    expect(h1["overflow-wrap"]).toBe("break-word");
  });

  it("makes the logo and the title a little smaller beside each other on a phone", () => {
    const narrow = room.slice(room.indexOf("@media (max-width: 480px)"));
    expect(narrow).toMatch(/\.live-top:has\(\.lt-logo\) h1\s*\{[^}]*font-size:\s*17px/);
    expect(narrow).toMatch(/\.lt-logo\s*\{[^}]*max-width:\s*72px/);
  });
});

describe("a donut's legend", () => {
  it("wraps under the ring when it has less than its own width beside it", () => {
    expect(rule(room, ".lt-donut")["flex-wrap"]).toBe("wrap");
    expect(rule(room, ".lt-legend").flex).toBe("1 1 240px");
  });

  it("breaks a label only where a word is longer than the row", () => {
    expect(rule(room, ".lt-legend-label")["overflow-wrap"]).toBe("break-word");
  });
});
