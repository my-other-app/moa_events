// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * The house rules of the site's motion (styles/motion.css), checked on the
 * stylesheets themselves: nothing animates layout, no entrance starts from
 * opacity 0 (Chrome records no paint for it, which holds back the LCP),
 * every move is off when less motion is asked for, and the timings are the
 * tokens in index.css.
 */
const here = dirname(fileURLToPath(import.meta.url));
const sheets = Object.fromEntries(readdirSync(here).filter((f) => f.endsWith(".css")).map((f) => [f, readFileSync(join(here, f), "utf8")]));
const motion = sheets["motion.css"];
const tokens = readFileSync(join(here, "..", "index.css"), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Each declaration with the at-rules around it: [{ prop, value, at: ["@media …", …] }]. */
function declarations(css) {
  const out = [];
  const stack = [];
  let buf = "";
  for (const ch of strip(css)) {
    if (ch === "{") {
      stack.push(buf.trim());
      buf = "";
    } else if (ch === "}" || ch === ";") {
      const d = buf.trim();
      const m = /^([-a-z]+)\s*:\s*([\s\S]+)$/i.exec(d);
      if (m && stack.length) out.push({ prop: m[1].toLowerCase(), value: m[2].trim(), at: stack.filter((s) => s.startsWith("@")) });
      buf = "";
      if (ch === "}") stack.pop();
    } else buf += ch;
  }
  return out;
}

const LAYOUT = /\b(width|height|top|right|bottom|left|inset|margin(-\w+)?|padding(-\w+)?|all|flex(-\w+)?|grid(-\w+)?|font-size|line-height)\b/;

describe("the site's motion", () => {
  it("never transitions a property that lays out the page", () => {
    const bad = [];
    for (const [file, css] of Object.entries(sheets)) {
      for (const d of declarations(css)) {
        if (d.prop === "transition" || d.prop === "transition-property") {
          const props = d.value.split(",").map((part) => part.trim().split(/\s+/)[0]);
          for (const p of props) if (LAYOUT.test(p) && !/^var\(/.test(p)) bad.push(`${file}: ${d.prop}: ${d.value}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("starts no entrance from opacity 0", () => {
    const frames = [...strip(motion).matchAll(/@keyframes\s+([\w-]+)\s*{\s*(from|0%)\s*{([^}]*)}/g)];
    expect(frames.length).toBeGreaterThan(5);
    for (const [, name, , body] of frames) {
      const o = /opacity\s*:\s*([\d.]+)/.exec(body);
      if (o) expect([name, Number(o[1])]).not.toEqual([name, 0]);
    }
  });

  it("moves only inside prefers-reduced-motion: no-preference", () => {
    const loose = declarations(motion).filter((d) => {
      if (d.at.some((a) => a.startsWith("@keyframes") || a.startsWith("@starting-style"))) return false;
      const moves = d.prop === "animation" || d.prop === "animation-name" || (d.prop === "transform" && d.value !== "none");
      return moves && !d.at.some((a) => /prefers-reduced-motion:\s*no-preference/.test(a));
    });
    expect(loose).toEqual([]);
  });

  it("times every transition and animation in motion.css with the tokens", () => {
    for (const d of declarations(motion)) {
      if (!/^(transition|animation)(-duration)?$/.test(d.prop)) continue;
      // Only the existing spinners keep their own turn.
      const own = d.value.replace(/(rg|ac)-spin [\d.]+s linear infinite/g, "");
      expect([d.prop, own]).not.toEqual([d.prop, expect.stringMatching(/\b\d*\.?\d+m?s\b/)]);
    }
  });

  it("zeroes the tokens when less motion is asked for", () => {
    const reduce = /@media \(prefers-reduced-motion: reduce\)\s*{\s*:root\s*{([^}]*)}/.exec(strip(tokens));
    expect(reduce).not.toBeNull();
    for (const t of ["--motion-fast: 0ms", "--motion-base: 0ms", "--motion-slow: 0ms", "--motion-stagger: 0ms", "--motion-lift: 0px", "--motion-press: 1", "--motion-rise: 0px"]) {
      expect(reduce[1]).toContain(t);
    }
  });
});
