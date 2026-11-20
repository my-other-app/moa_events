import { afterEach, describe, expect, it, vi } from "vitest";
import { canShareFile, copyText, downloadBlob, fileFor, shareFile } from "./sharefile";

/*
 * Sharing the poster: the share sheet with the PNG where the browser has one
 * for files, else nothing (the page offers the download and the caption).
 */
const png = () => fileFor(new Blob([new Uint8Array(8)], { type: "image/png" }), "poster.png");

const stubShare = ({ canShare = () => true, share = vi.fn(async () => {}) } = {}) => {
  Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
  Object.defineProperty(navigator, "canShare", { value: vi.fn(canShare), configurable: true, writable: true });
  return share;
};

afterEach(() => {
  delete navigator.share;
  delete navigator.canShare;
  vi.restoreAllMocks();
});

describe("sharing the poster", () => {
  it("is unsupported without a share sheet for files", async () => {
    expect(canShareFile(png())).toBe(false);
    expect(await shareFile({ file: png(), text: "Hi" })).toBe("unsupported");
    // A sheet that takes links but not files (Chrome on a Mac).
    stubShare({ canShare: (d) => !d.files });
    expect(await shareFile({ file: png(), text: "Hi" })).toBe("unsupported");
  });

  it("shares the PNG with the caption", async () => {
    const share = stubShare();
    const file = png();
    expect(await shareFile({ file, text: "I'm attending DevFest", title: "DevFest" })).toBe("shared");
    expect(share).toHaveBeenCalledWith({ files: [file], text: "I'm attending DevFest", title: "DevFest" });
  });

  it("shares the file alone where the sheet won't take words with it", async () => {
    const share = stubShare({ canShare: (d) => !d.text });
    const file = png();
    expect(await shareFile({ file, text: "words" })).toBe("shared");
    expect(share).toHaveBeenCalledWith({ files: [file] });
  });

  it("tells a closed sheet from a refusal", async () => {
    stubShare({ share: vi.fn(async () => Promise.reject(Object.assign(new Error("closed"), { name: "AbortError" }))) });
    expect(await shareFile({ file: png() })).toBe("cancelled");
    stubShare({ share: vi.fn(async () => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" }))) });
    expect(await shareFile({ file: png() })).toBe("failed");
  });
});

describe("downloading and copying", () => {
  it("saves the blob under its name", () => {
    URL.createObjectURL = vi.fn(() => "blob:poster");
    URL.revokeObjectURL = vi.fn();
    const clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      clicked.push({ href: this.getAttribute("href"), download: this.download });
    });
    expect(downloadBlob(new Blob(["x"]), "devfest-poster-square.png")).toBe(true);
    expect(clicked).toEqual([{ href: "blob:poster", download: "devfest-poster-square.png" }]);
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
  });

  it("copies the caption, the old way where the clipboard API is refused", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await copyText("caption")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("caption");
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) }, configurable: true });
    document.execCommand = vi.fn(() => true);
    expect(await copyText("caption")).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    delete navigator.clipboard;
    delete document.execCommand;
  });
});
