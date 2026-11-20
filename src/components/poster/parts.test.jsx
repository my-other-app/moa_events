import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormatPicker, PosterPreview, ShareActions } from "./parts.jsx";

/*
 * The poster page's own parts: the formats, the preview's states, and
 * Share / Download / Copy caption with their fallbacks.
 */
const png = () => new Blob([new Uint8Array(16)], { type: "image/png" });

const clicks = [];
beforeEach(() => {
  clicks.length = 0;
  URL.createObjectURL = vi.fn(() => "blob:poster");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    clicks.push(this.download);
  });
});
afterEach(() => {
  delete URL.createObjectURL;
  delete URL.revokeObjectURL;
  delete navigator.share;
  delete navigator.canShare;
  delete navigator.clipboard;
  vi.restoreAllMocks();
});

describe("the format picker", () => {
  it("offers only the formats the organisers turned on, in order", () => {
    const pick = vi.fn();
    render(<FormatPicker offered={["story", "square"]} value="square" onChange={pick} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.value)).toEqual(["square", "story"]);
    expect(screen.getByRole("radio", { name: /Square/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Story/ }));
    expect(pick).toHaveBeenCalledWith("story");
  });

  it("isn't shown for a single format", () => {
    const { container } = render(<FormatPicker offered={["portrait"]} value="portrait" onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the preview", () => {
  it("has the format's shape and says when it's being drawn", () => {
    render(<PosterPreview format="story" state="loading" url={null} alt="x" />);
    const fig = screen.getByRole("figure");
    expect(fig.style.aspectRatio).toBe("1080 / 1920");
    expect(fig).toHaveClass("is-loading");
    expect(screen.getByRole("status")).toHaveTextContent("Drawing your poster…");
  });

  it("keeps the last picture, dimmed, while a new one is drawn", () => {
    render(<PosterPreview format="square" state="loading" stale url="blob:old" alt="Your poster" />);
    expect(screen.getByRole("img", { name: "Your poster" })).toHaveAttribute("src", "blob:old");
    expect(screen.getByRole("figure")).toHaveClass("is-stale");
  });

  it("offers Try again when it couldn't be drawn", () => {
    const retry = vi.fn();
    render(<PosterPreview format="square" state="failed" url={null} alt="x" failure="Try again in a moment." onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Try again in a moment.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });
});

describe("sharing", () => {
  it("offers Download and Copy caption where there is no share sheet for files", async () => {
    const done = vi.fn();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShareActions blob={png()} filename="devfest-poster-square.png" caption="I'm attending DevFest! https://x.in/l/abc" onDone={done} />);
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(clicks).toEqual(["devfest-poster-square.png"]);
    expect(done).toHaveBeenCalledWith("download");
    fireEvent.click(screen.getByRole("button", { name: "Copy caption" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("I'm attending DevFest! https://x.in/l/abc"));
    expect(await screen.findByText("Caption copied. Paste it with your poster.")).toBeInTheDocument();
  });

  it("shares the PNG and the caption through the sheet where there is one", async () => {
    const done = vi.fn();
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    render(<ShareActions blob={png()} filename="p.png" caption="Hello" title="DevFest" onDone={done} />);
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const data = share.mock.calls[0][0];
    expect(data.files[0].name).toBe("p.png");
    expect(data.files[0].type).toBe("image/png");
    expect(data.text).toBe("Hello");
    await waitFor(() => expect(done).toHaveBeenCalledWith("share"));
  });

  it("downloads instead when the sheet refuses, and does nothing when it's closed", async () => {
    const share = vi.fn(async () => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })));
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    render(<ShareActions blob={png()} filename="p.png" caption="" />);
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    await waitFor(() => expect(clicks).toEqual(["p.png"]));
    // No caption: no Copy caption.
    expect(screen.queryByRole("button", { name: "Copy caption" })).toBeNull();
    share.mockImplementation(async () => Promise.reject(Object.assign(new Error("closed"), { name: "AbortError" })));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
    expect(clicks).toEqual(["p.png"]);
  });
});
