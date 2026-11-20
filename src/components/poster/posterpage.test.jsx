import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * The poster page (/posters/{ticket}): what it shows for each answer of the
 * API (feature-register/posters/CONTRACT.md §6), the photo (made ready,
 * sent, framed, removed), the drawing (asked for, waited for, shown, tried
 * again), and Share / Download. The API is mocked; making the photo ready
 * is mocked (jsdom reads no pictures: utils/posterphoto.test.js covers it).
 */
vi.mock("@/api/posters", () => ({
  postersApi: {
    read: vi.fn(),
    upload: vi.fn(),
    photo: vi.fn(),
    removePhoto: vi.fn(),
    frame: vi.fn(),
    render: vi.fn(),
    renderStatus: vi.fn(),
    image: vi.fn(),
    note: vi.fn(async () => true),
  },
}));
vi.mock("@/utils/posterphoto", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, preparePhoto: vi.fn() };
});

const { postersApi } = await import("@/api/posters");
const { preparePhoto, PhotoProblem } = await import("@/utils/posterphoto");
const { parsePoster } = await import("@/utils/poster");
const { default: PosterPage } = await import("./posterpage.jsx");

const T = "MOA-1A2B3-XY7QZ";
const KEY = "3f9a0c1d2e3f4a5b6c7d8e9f0a1b2c3d";
const LINK_KEY = "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b";

const FORMAT = (key, over = {}) => ({
  key,
  width: 1080,
  height: key === "story" ? 1920 : key === "portrait" ? 1350 : 1080,
  variant: "default",
  frame: { x: 140, y: 180, width: 800, height: 800, radius: [400, 400, 400, 400] },
  framing: { zoom: 1, x: 0.5, y: 0.5 },
  render: { status: "none" },
  ...over,
});
const PHOTO = { width: 1600, height: 2000, uploaded_at: "2026-11-22T10:01:00+05:30" };
const BODY = (over = {}) =>
  parsePoster({
    available: true,
    reason: null,
    key: KEY,
    event: { id: 1, name: "DevFest 2026", slug: "devfest-2026", starts_at: "2026-11-28T08:30:00+05:30" },
    guest: { name: "Asha Nair", first_name: "Asha", initials: "AN", role: "attendee", role_label: "Attendee" },
    moment: { key: "before", phrase: "I'm attending", caption: "I'm attending DevFest 2026! Join me: https://api.myotherapp.in/l/x7k2m9pq" },
    share_url: "https://api.myotherapp.in/l/x7k2m9pq",
    photo: null,
    formats: [FORMAT("square")],
    ...over,
  });
const READY = (fp = "fp1", over = {}) => ({ status: "ready", fingerprint: fp, retryAfterMs: null, caption: null, http: 200, ...over });
const png = (name = "poster") => new Blob([name], { type: "image/png" });
const refusal = (status, data = {}) => ({ __apiFailure: true, status, code: data.error_code || null, errors: data.errors || null, message: data.message || null, network: false, authExpired: false, retryAfter: null, trackId: null, data });

const open = (s = "") =>
  render(
    <MemoryRouter initialEntries={[`/posters/${T}${s ? `?s=${s}` : ""}`]}>
      <PosterPage ticketid={T} s={s} />
    </MemoryRouter>,
  );

let urls;
const clicked = [];
beforeEach(() => {
  vi.clearAllMocks();
  urls = 0;
  clicked.length = 0;
  URL.createObjectURL = vi.fn(() => `blob:made-${++urls}`);
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 300, height: 300, right: 300, bottom: 300, x: 0, y: 0 });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    clicked.push(this.download);
  });
  postersApi.note.mockResolvedValue(true);
  postersApi.image.mockImplementation(async (t, s, format, fp) => png(`${format}:${fp}`));
  postersApi.photo.mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" }));
  postersApi.render.mockResolvedValue(READY("fp1"));
});
afterEach(() => {
  delete URL.createObjectURL;
  delete URL.revokeObjectURL;
  delete navigator.share;
  delete navigator.canShare;
  vi.restoreAllMocks();
});

const poster = () => screen.findByRole("img", { name: /Your “I'm attending” poster for DevFest 2026/ });

describe("the poster, drawn by the server", () => {
  it("shows a poster drawn already, without asking for another", async () => {
    postersApi.read.mockResolvedValue(BODY({ formats: [FORMAT("square", { render: { status: "ready", fingerprint: "a1" } })] }));
    open();
    expect(await poster()).toHaveAttribute("src", "blob:made-1");
    expect(postersApi.render).not.toHaveBeenCalled();
    expect(postersApi.image).toHaveBeenCalledWith(T, KEY, "square", "a1");
    expect(screen.getByRole("heading", { level: 1, name: "Your poster" })).toBeInTheDocument();
    expect(screen.getByText("I'm attending DevFest 2026! Join me: https://api.myotherapp.in/l/x7k2m9pq")).toBeInTheDocument();
    expect(screen.getByText("https://api.myotherapp.in/l/x7k2m9pq")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Your ticket" })).toHaveAttribute("href", `/tickets/${T}`);
  });

  it("asks for a poster never drawn, waits while it is drawn, then shows it", async () => {
    postersApi.read.mockResolvedValue(BODY());
    postersApi.render.mockResolvedValue({ status: "rendering", fingerprint: "fp2", retryAfterMs: 800, caption: null, http: 202 });
    postersApi.renderStatus.mockResolvedValue(READY("fp2"));
    open();
    expect(await screen.findByText("Drawing your poster…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    expect(await poster()).toBeInTheDocument();
    expect(postersApi.render).toHaveBeenCalledWith(T, KEY, "square");
    expect(postersApi.renderStatus).toHaveBeenCalledWith(T, KEY, "square");
    expect(postersApi.image).toHaveBeenCalledWith(T, KEY, "square", "fp2");
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
  });

  it("says when it couldn't be drawn, and tries again", async () => {
    postersApi.read.mockResolvedValue(BODY());
    postersApi.render.mockRejectedValueOnce(refusal(503, { error_code: "POSTER_RENDER_BUSY" }));
    open();
    expect(await screen.findByText("Your poster couldn’t be drawn just now. Try again in a moment.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await poster()).toBeInTheDocument();
    expect(postersApi.render).toHaveBeenCalledTimes(2);
  });

  it("says a drawing that failed while it was waited for", async () => {
    postersApi.read.mockResolvedValue(BODY());
    postersApi.render.mockResolvedValue({ status: "rendering", fingerprint: "fp2", retryAfterMs: 800, caption: null, http: 202 });
    postersApi.renderStatus.mockResolvedValue({ status: "failed", fingerprint: "fp2", retryAfterMs: null, caption: null, http: 200 });
    open();
    expect(await screen.findByText("Your poster couldn’t be drawn just now. Try again in a moment.", {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("says too many in a row, with how long to wait", async () => {
    postersApi.read.mockResolvedValue(BODY());
    postersApi.render.mockRejectedValue(refusal(429, { error_code: "RATE_LIMITED", errors: { retry_after: 300 } }));
    open();
    expect(await screen.findByText("That’s a lot of changes in a short time. Try again in 5 minutes.")).toBeInTheDocument();
  });

  it("says a lost connection in words, and tries again when it's back", async () => {
    postersApi.read.mockResolvedValue(BODY());
    postersApi.render.mockRejectedValueOnce({ __apiFailure: true, status: 0, network: true });
    open();
    expect(await screen.findByText("We couldn’t reach MyOtherApp. Check your connection and try again.")).toBeInTheDocument();
    fireEvent(window, new Event("online"));
    expect(await poster()).toBeInTheDocument();
  });

  it("draws another format when it's picked", async () => {
    postersApi.read.mockResolvedValue(BODY({ formats: [FORMAT("square", { render: { status: "ready", fingerprint: "a1" } }), FORMAT("story")] }));
    postersApi.render.mockResolvedValue(READY("s1"));
    open();
    await poster();
    fireEvent.click(screen.getByRole("radio", { name: /Story/ }));
    await waitFor(() => expect(postersApi.image).toHaveBeenCalledWith(T, KEY, "story", "s1"));
    expect(postersApi.render).toHaveBeenCalledWith(T, KEY, "story");
    expect(await screen.findByRole("img", { name: /story$/ })).toBeInTheDocument();
    expect(screen.getByRole("figure").style.aspectRatio).toBe("1080 / 1920");
    // Back to square: already here, nothing asked again.
    fireEvent.click(screen.getByRole("radio", { name: /Square/ }));
    expect(await screen.findByRole("img", { name: /square$/ })).toBeInTheDocument();
    expect(postersApi.image).toHaveBeenCalledTimes(2);
  });

  it("goes with the email link's key, when the page came with one", async () => {
    postersApi.read.mockResolvedValue(BODY({ formats: [FORMAT("square", { render: { status: "ready", fingerprint: "a1" } })] }));
    open(LINK_KEY);
    await poster();
    expect(postersApi.read).toHaveBeenCalledWith(T, LINK_KEY);
    expect(postersApi.image).toHaveBeenCalledWith(T, LINK_KEY, "square", "a1");
    // From the email, the way back is the event: this browser may hold no ticket.
    expect(screen.getByRole("link", { name: "The event" })).toHaveAttribute("href", "/events/devfest-2026");
  });

  it("closes when posters are switched off meanwhile", async () => {
    postersApi.read.mockResolvedValue(BODY());
    postersApi.render.mockRejectedValue(refusal(409, { error_code: "POSTER_NOT_AVAILABLE", errors: { reason: "moment_off" } }));
    open();
    expect(await screen.findByRole("heading", { level: 1, name: "Posters aren’t open right now" })).toBeInTheDocument();
  });
});

describe("when there is no poster to make", () => {
  it.each([
    ["off", "Posters aren’t on for this event"],
    ["not_sent", "Your poster isn’t ready yet"],
    ["moment_off", "Posters aren’t open right now"],
    ["revoked", "This ticket was revoked"],
    ["cancelled", "This registration is no longer active"],
    ["event_cancelled", "This event was called off"],
  ])("says why: %s", async (reason, title) => {
    postersApi.read.mockResolvedValue(parsePoster({ available: false, reason, event: reason === "off" ? undefined : { id: 1, name: "DevFest 2026", slug: "devfest-2026" } }));
    open();
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(postersApi.render).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Choose a photo/ })).toBeNull();
  });

  it("offers the ticket while it is still good, never for a revoked one", async () => {
    postersApi.read.mockResolvedValue(parsePoster({ available: false, reason: "not_sent", event: { id: 1, name: "DevFest 2026", slug: "devfest-2026" } }));
    const page = open();
    expect(await screen.findByRole("link", { name: "View your ticket" })).toHaveAttribute("href", `/tickets/${T}`);
    page.unmount();
    postersApi.read.mockResolvedValue(parsePoster({ available: false, reason: "revoked", event: { id: 1, name: "DevFest 2026", slug: "devfest-2026" } }));
    open();
    expect(await screen.findByRole("link", { name: "Go to the event" })).toHaveAttribute("href", "/events/devfest-2026");
    expect(screen.queryByRole("link", { name: "View your ticket" })).toBeNull();
  });

  it("an API without posters reads as off", async () => {
    postersApi.read.mockRejectedValue(refusal(404, { detail: "Not Found" }));
    open();
    expect(await screen.findByRole("heading", { level: 1, name: "Posters aren’t on for this event" })).toBeInTheDocument();
  });

  it("says when the poster is someone else's, or there's no such ticket", async () => {
    postersApi.read.mockRejectedValue(refusal(403, { error_code: "POSTER_FORBIDDEN" }));
    const page = open();
    expect(await screen.findByRole("heading", { level: 1, name: "This poster belongs to another ticket holder" })).toBeInTheDocument();
    page.unmount();
    postersApi.read.mockRejectedValue(refusal(404, { error_code: "TICKET_NOT_FOUND" }));
    open();
    expect(await screen.findByRole("heading", { level: 1, name: "No such ticket" })).toBeInTheDocument();
  });

  it("says when it didn't load, and loads again", async () => {
    postersApi.read.mockRejectedValueOnce({ __apiFailure: true, status: 0, network: true });
    postersApi.read.mockResolvedValueOnce(BODY());
    open();
    expect(await screen.findByText("Your poster didn’t load")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await poster()).toBeInTheDocument();
  });
});

describe("the photo", () => {
  const choose = (name = "IMG_1.jpg", type = "image/jpeg") => {
    const input = screen.getByLabelText(/Choose a photo|Change photo/);
    const file = new File([new Uint8Array(100)], name, { type });
    fireEvent.change(input, { target: { files: [file] } });
    return file;
  };

  it("without one: the initials, and the way to add one", async () => {
    postersApi.read.mockResolvedValue(BODY());
    open();
    expect(await screen.findByRole("heading", { level: 2, name: "Add your photo" })).toBeInTheDocument();
    expect(screen.getByText(/No photo\? Your poster shows your initials \(AN\)/)).toBeInTheDocument();
    expect(screen.getByLabelText("Choose a photo")).toHaveAttribute("accept", "image/*,.heic,.heif");
    expect(screen.queryByRole("group", { name: "Your photo in the poster's frame" })).toBeNull();
  });

  it("is made ready, sent, shown in the frame, and the poster drawn with it", async () => {
    postersApi.read.mockResolvedValue(BODY({ formats: [FORMAT("square", { render: { status: "ready", fingerprint: "a1" } })] }));
    const ready = new Blob(["jpeg"], { type: "image/jpeg" });
    preparePhoto.mockResolvedValue({ blob: ready, filename: "photo.jpg", width: 1600, height: 2000, previewUrl: "blob:local" });
    postersApi.upload.mockResolvedValue(BODY({ photo: PHOTO }));
    postersApi.render.mockResolvedValue(READY("withphoto"));
    open();
    await poster();
    const file = choose();
    await waitFor(() => expect(postersApi.upload).toHaveBeenCalledWith(T, KEY, ready, "photo.jpg"));
    expect(preparePhoto).toHaveBeenCalledWith(file, { maxBytes: 12 * 1024 * 1024 });
    const frame = await screen.findByRole("group", { name: "Your photo in the poster's frame" });
    expect(within(frame).getByRole("presentation", { hidden: true })).toHaveAttribute("src", "blob:local");
    // The design's round frame.
    expect(frame.style.borderRadius).toBe("50% 50% 50% 50% / 50% 50% 50% 50%");
    await waitFor(() => expect(postersApi.image).toHaveBeenCalledWith(T, KEY, "square", "withphoto"));
    // The server's copy isn't read again: the one just chosen is already shown.
    expect(postersApi.photo).not.toHaveBeenCalled();
  });

  it("is read from the server when this browser couldn't show it (a HEIC)", async () => {
    postersApi.read.mockResolvedValue(BODY());
    const heic = new File([new Uint8Array(100)], "IMG_2.HEIC", { type: "" });
    preparePhoto.mockResolvedValue({ blob: heic, filename: "IMG_2.HEIC", width: null, height: null, previewUrl: null });
    postersApi.upload.mockResolvedValue(BODY({ photo: PHOTO }));
    open();
    await poster();
    choose("IMG_2.HEIC", "");
    await waitFor(() => expect(postersApi.photo).toHaveBeenCalledWith(T, KEY));
    const frame = await screen.findByRole("group", { name: "Your photo in the poster's frame" });
    await waitFor(() => expect(frame.querySelector("img")).toHaveAttribute("src", expect.stringMatching(/^blob:made-/)));
  });

  it("says why a photo wasn't taken", async () => {
    postersApi.read.mockResolvedValue(BODY());
    preparePhoto.mockRejectedValue(new PhotoProblem("type", "Choose a photo: JPEG, PNG, HEIC or WebP."));
    open();
    await poster();
    choose("notes.pdf", "application/pdf");
    expect(await screen.findByText("Choose a photo: JPEG, PNG, HEIC or WebP.")).toBeInTheDocument();
    expect(postersApi.upload).not.toHaveBeenCalled();
  });

  it("says why the server refused it", async () => {
    postersApi.read.mockResolvedValue(BODY());
    preparePhoto.mockResolvedValue({ blob: new Blob(["x"]), filename: "photo.jpg", width: 10, height: 10, previewUrl: "blob:local" });
    postersApi.upload.mockRejectedValueOnce(refusal(429, { error_code: "RATE_LIMITED", errors: { retry_after: 1200 } }));
    open();
    await poster();
    choose();
    expect(await screen.findByText("That’s a lot of changes in a short time. Try again in 20 minutes.")).toBeInTheDocument();
    postersApi.upload.mockRejectedValueOnce(refusal(422, { message: "That file is not a picture" }));
    choose();
    expect(await screen.findByText("That file is not a picture.")).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local");
  });

  it("is moved in the frame, kept with “Update my poster”, and the poster drawn again", async () => {
    postersApi.read.mockResolvedValue(BODY({ photo: PHOTO, formats: [FORMAT("square", { render: { status: "ready", fingerprint: "a1" } })] }));
    postersApi.frame.mockResolvedValue(BODY({ photo: PHOTO, formats: [FORMAT("square", { framing: { zoom: 1.1, x: 0.5, y: 0.5 }, render: { status: "none" } })] }));
    postersApi.render.mockResolvedValue(READY("moved"));
    open();
    await poster();
    expect(postersApi.photo).toHaveBeenCalledWith(T, KEY);
    const frame = await screen.findByRole("group", { name: "Your photo in the poster's frame" });
    expect(screen.queryByRole("button", { name: "Update my poster" })).toBeNull();
    fireEvent.keyDown(frame, { key: "+" });
    const update = await screen.findByRole("button", { name: "Update my poster" });
    // Nothing to share while the poster shown isn't the one being made.
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    fireEvent.click(update);
    await waitFor(() => expect(postersApi.frame).toHaveBeenCalled());
    const [t, s, framing, format] = postersApi.frame.mock.calls[0];
    expect([t, s, format]).toEqual([T, KEY, undefined]);
    expect(framing).toEqual({ zoom: 1.1, cx: 0.5, cy: 0.5 });
    await waitFor(() => expect(postersApi.image).toHaveBeenCalledWith(T, KEY, "square", "moved"));
    expect(screen.queryByRole("button", { name: "Update my poster" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Download" })).toBeEnabled());
  });

  it("is removed, and the poster goes back to the initials", async () => {
    postersApi.read.mockResolvedValue(BODY({ photo: PHOTO, formats: [FORMAT("square", { render: { status: "ready", fingerprint: "a1" } })] }));
    postersApi.removePhoto.mockResolvedValue(BODY());
    postersApi.render.mockResolvedValue(READY("initials"));
    open();
    await poster();
    fireEvent.click(await screen.findByRole("button", { name: "Remove photo" }));
    await waitFor(() => expect(postersApi.removePhoto).toHaveBeenCalledWith(T, KEY));
    expect(await screen.findByRole("heading", { level: 2, name: "Add your photo" })).toBeInTheDocument();
    await waitFor(() => expect(postersApi.image).toHaveBeenCalledWith(T, KEY, "square", "initials"));
    // The photo's object URL is let go of.
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("is let go of when the page is left", async () => {
    postersApi.read.mockResolvedValue(BODY({ photo: PHOTO, formats: [FORMAT("square", { render: { status: "ready", fingerprint: "a1" } })] }));
    const page = open();
    await poster();
    await waitFor(() => expect(postersApi.photo).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("group", { name: "Your photo in the poster's frame" }).querySelector("img")).toBeTruthy());
    const made = URL.createObjectURL.mock.results.map((r) => r.value);
    page.unmount();
    for (const url of made) expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
  });
});

describe("sharing the poster", () => {
  it("downloads it (and says so to the organiser's counts) where there's no share sheet for files", async () => {
    postersApi.read.mockResolvedValue(BODY({ formats: [FORMAT("square", { render: { status: "ready", fingerprint: "a1" } })] }));
    open();
    await poster();
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(clicked).toEqual(["im-attending-devfest-2026-square.png"]);
    expect(postersApi.note).toHaveBeenCalledWith(T, KEY, "download", "square");
  });

  it("shares the PNG with the caption through the phone's sheet", async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    postersApi.read.mockResolvedValue(BODY({ formats: [FORMAT("square", { render: { status: "ready", fingerprint: "a1" } })] }));
    open();
    await poster();
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const data = share.mock.calls[0][0];
    expect(data.files[0].name).toBe("im-attending-devfest-2026-square.png");
    expect(data.text).toBe("I'm attending DevFest 2026! Join me: https://api.myotherapp.in/l/x7k2m9pq");
    await waitFor(() => expect(postersApi.note).toHaveBeenCalledWith(T, KEY, "share", "square"));
  });

  it("copies the guest's link", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    postersApi.read.mockResolvedValue(BODY({ formats: [FORMAT("square", { render: { status: "ready", fingerprint: "a1" } })] }));
    open();
    await poster();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://api.myotherapp.in/l/x7k2m9pq"));
    await waitFor(() => expect(postersApi.note).toHaveBeenCalledWith(T, KEY, "copy_link", "square"));
    delete navigator.clipboard;
  });
});
