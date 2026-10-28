// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";

/* The web manifest and the icons every page links to: real files, the sizes they say. */
const PUBLIC = join(process.cwd(), "public");

describe("/manifest.webmanifest", () => {
  it("names the site, in Indian English, and points to the Android app", async () => {
    const manifest = (await import("../manifest.js")).default();
    expect(manifest).toMatchObject({ short_name: "MyOtherApp", start_url: "/", display: "standalone", lang: "en-IN", prefer_related_applications: true });
    expect(manifest.related_applications).toEqual([{ platform: "play", url: expect.stringContaining("id=app.myotherapp.in"), id: "app.myotherapp.in" }]);
    expect(manifest.icons.map((i) => i.purpose)).toEqual(["any", "any", "maskable"]);
  });

  it("lists icons that exist, at the sizes it says", async () => {
    const manifest = (await import("../manifest.js")).default();
    for (const icon of manifest.icons) {
      const meta = await sharp(readFileSync(join(PUBLIC, icon.src))).metadata();
      expect(`${meta.width}x${meta.height}`).toBe(icon.sizes);
      expect(meta.format).toBe("png");
    }
  });
});

describe("the page icons", () => {
  it("are small and square: favicon.ico at 16, 32 and 48, the apple touch icon at 180 with no see-through corners", async () => {
    const ico = readFileSync(join(PUBLIC, "favicon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1); // an icon
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + 16 * i));
    expect(sizes).toEqual([16, 32, 48]);
    expect(ico.length).toBeLessThan(10 * 1024);
    const apple = await sharp(readFileSync(join(PUBLIC, "apple-touch-icon.png"))).stats();
    expect(apple.isOpaque).toBe(true);
  });

  it("are what the root layout links", async () => {
    const source = readFileSync(join(process.cwd(), "src/app/layout.jsx"), "utf8");
    for (const file of ["/favicon.ico", "/icon-192.png", "/apple-touch-icon.png"]) expect(source).toContain(`"${file}"`);
    expect(source).not.toContain('url: "/logo.svg"');
    // And the page says it is in Indian English.
    expect(source).toContain('<html lang="en-IN"');
  });
});
