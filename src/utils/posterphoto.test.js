import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoProblem, fitWithin, photoKind, photoProblemText, preparePhoto, sizeWords } from "./posterphoto";

/*
 * Making the guest's photo ready before it is sent. jsdom reads no pictures
 * and draws no canvases, so the reading is handed in (`load`) and the
 * canvas stood in for; what is checked is what goes to the server.
 */
const file = (name, type, size = 1000) => new File([new Uint8Array(size)], name, { type });

let drawn;
beforeEach(() => {
  drawn = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
    const canvas = this;
    return {
      fillRect: () => {},
      drawImage: (img, x, y, w, h) => drawn.push({ w, h, canvas: { w: canvas.width, h: canvas.height } }),
      set fillStyle(v) {},
      set imageSmoothingQuality(v) {},
    };
  });
  HTMLCanvasElement.prototype.toBlob = function (cb, type, quality) {
    // A JPEG's size, roughly, by the pixels and the quality asked for.
    cb(new Blob([new Uint8Array(Math.round((this.width * this.height * quality) / 10))], { type }));
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  delete HTMLCanvasElement.prototype.toBlob;
});

const reads = (w, h) => vi.fn(async () => ({ img: {}, url: "blob:photo", w, h }));
const unreadable = vi.fn(async () => null);

describe("which photos are taken", () => {
  it("takes JPEG, PNG, WebP and HEIC, by type or by name when the browser gives no type", () => {
    expect(photoKind(file("a.jpg", "image/jpeg"))).toBe("jpeg");
    expect(photoKind(file("a.png", "image/png"))).toBe("png");
    expect(photoKind(file("a.webp", "image/webp"))).toBe("webp");
    expect(photoKind(file("IMG_0001.HEIC", "image/heic"))).toBe("heic");
    expect(photoKind(file("IMG_0001.HEIC", ""))).toBe("heic");
    expect(photoKind(file("IMG_0001.heif", "application/octet-stream"))).toBe("heic");
  });

  it("refuses anything else", () => {
    expect(photoKind(file("a.gif", "image/gif"))).toBeNull();
    expect(photoKind(file("a.svg", "image/svg+xml"))).toBeNull();
    expect(photoKind(file("notes.pdf", "application/pdf"))).toBeNull();
    // A name doesn't override a type that says otherwise.
    expect(photoKind(file("trick.jpg", "text/html"))).toBeNull();
  });

  it("says sizes and problems in words", () => {
    expect(sizeWords(10 * 1024 * 1024)).toBe("10 MB");
    expect(sizeWords(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(sizeWords(750 * 1024)).toBe("750 KB");
    expect(photoProblemText("size", 10 * 1024 * 1024)).toBe("That photo is too big. Choose one under 10 MB.");
    expect(photoProblemText("type")).toMatch(/JPEG, PNG, HEIC or WebP/);
  });

  it("fits a size within the long edge", () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ w: 2048, h: 1536 });
    expect(fitWithin(800, 1200, 2048)).toEqual({ w: 800, h: 1200 });
    expect(fitWithin(0, 10)).toBeNull();
  });
});

describe("making a photo ready", () => {
  it("draws a big photo at 2048 px on its long side, as a JPEG", async () => {
    const out = await preparePhoto(file("IMG_1.jpg", "image/jpeg", 6_000_000), { maxBytes: 10 * 1024 * 1024, load: reads(4032, 3024) });
    expect(out).toMatchObject({ filename: "photo.jpg", width: 2048, height: 1536, previewUrl: "blob:photo" });
    expect(out.blob.type).toBe("image/jpeg");
    expect(drawn[0]).toMatchObject({ w: 2048, h: 1536, canvas: { w: 2048, h: 1536 } });
  });

  it("keeps a small photo's size (drawn again, so the camera's details are left behind)", async () => {
    const out = await preparePhoto(file("me.png", "image/png", 90_000), { maxBytes: 10 * 1024 * 1024, load: reads(640, 800) });
    expect(out).toMatchObject({ width: 640, height: 800, filename: "photo.jpg" });
    expect(out.blob.type).toBe("image/jpeg");
  });

  it("tries smaller when the first try is still over the limit", async () => {
    // 2048 × 1536 at 0.88 ≈ 277 KB here; at 0.75 ≈ 236 KB; at 1536 px and 0.75 ≈ 133 KB.
    const out = await preparePhoto(file("big.jpg", "image/jpeg", 9_000_000), { maxBytes: 200_000, load: reads(4000, 3000) });
    expect(out.width).toBe(1536);
    expect(out.blob.size).toBeLessThanOrEqual(200_000);
  });

  it("sends a HEIC this browser can't read as it is, for the server to convert", async () => {
    const heic = file("IMG_2.HEIC", "", 2_500_000);
    const out = await preparePhoto(heic, { maxBytes: 10 * 1024 * 1024, load: unreadable });
    expect(out).toEqual({ blob: heic, filename: "IMG_2.HEIC", width: null, height: null, previewUrl: null });
  });

  it("refuses an unreadable HEIC over the limit, and an unreadable JPEG at any size", async () => {
    await expect(preparePhoto(file("IMG_3.heic", "image/heic", 12_000_000), { maxBytes: 10 * 1024 * 1024, load: unreadable })).rejects.toMatchObject({ code: "size" });
    await expect(preparePhoto(file("broken.jpg", "image/jpeg", 5000), { maxBytes: 10 * 1024 * 1024, load: unreadable })).rejects.toMatchObject({ code: "unreadable" });
  });

  it("refuses what isn't a photo, and an empty file", async () => {
    const e = await preparePhoto(file("a.gif", "image/gif"), { load: reads(10, 10) }).catch((x) => x);
    expect(e).toBeInstanceOf(PhotoProblem);
    expect(e.code).toBe("type");
    await expect(preparePhoto(file("a.jpg", "image/jpeg", 0), { load: reads(10, 10) })).rejects.toMatchObject({ code: "unreadable" });
  });

  it("sends the file as it is when the browser reads it but won't draw it", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const f = file("me.webp", "image/webp", 400_000);
    const out = await preparePhoto(f, { maxBytes: 10 * 1024 * 1024, load: reads(1200, 1200) });
    expect(out.blob).toBe(f);
    expect(out.width).toBe(1200);
  });
});
