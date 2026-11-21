import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/api/live", () => ({
  errorLine: (e, f) => e?.response?.data?.message || f,
  liveApi: { fetchFeed: vi.fn(), fetchBanner: vi.fn(), ask: vi.fn(), vote: vi.fn(), respond: vi.fn(), joinQuiz: vi.fn() },
}));
vi.mock("@/api/discover", () => ({ discoverApi: { event: vi.fn() } }));

const { liveApi } = await import("@/api/live");
const { discoverApi } = await import("@/api/discover");
const Live = (await import("./live.jsx")).default;

/**
 * The room when its page came without the event: the server's read of the
 * event gave up (a busy API with a hall scanning the same code), so the page
 * has the slug alone (src/app/events/[slug]/live/page.jsx) and the browser
 * finds the event itself, then opens the room as usual.
 */
const feed = {
  event: { id: 68, name: "Hack Night 04", status: "live" },
  banner: { id: "u1", kind: "room", text: "Demos move to Lab 3B — same time", audience: "checked_in", recipients: 88, pushed: 80, sent_at: "2026-10-13T13:00:00Z" },
  updates: [],
  poll: null,
  questions: [],
  qa: { approve_first: false, open: true },
  quiz: null,
};
const eventPage = { event: { id: 68, slug: "hack-night-04", name: "Hack Night 04" } };

const room = (el) =>
  render(
    <MemoryRouter initialEntries={["/events/hack-night-04/live"]}>
      <Routes>
        <Route path="/events/:slug/live" element={el} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("the room when the server could not find the event in time", () => {
  it("looks the event up in the browser, then opens the room by its id", async () => {
    let found;
    discoverApi.event.mockReturnValue(new Promise((r) => (found = r)));
    liveApi.fetchFeed.mockResolvedValue(feed);
    room(<Live eventSlug="hack-night-04" />);
    // The page is never a server error: the way back and the room's outline first.
    expect(screen.getByRole("link", { name: "← Event" })).toHaveAttribute("href", "/events/hack-night-04");
    expect(screen.getByRole("status")).toHaveTextContent("Opening the room…");
    expect(liveApi.fetchFeed).not.toHaveBeenCalled();
    found(eventPage);
    expect(await screen.findByText("Demos move to Lab 3B — same time")).toBeInTheDocument();
    expect(discoverApi.event).toHaveBeenCalledWith("hack-night-04", { fresh: false });
    expect(liveApi.fetchFeed).toHaveBeenCalledWith("68");
    expect(screen.getByRole("heading", { level: 1, name: "Hack Night 04" })).toBeInTheDocument();
  });

  it("offers to try again when the API is still busy, and opens the room once it answers", async () => {
    discoverApi.event.mockRejectedValueOnce(Object.assign(new Error("timeout"), { notFound: false })).mockResolvedValue(eventPage);
    liveApi.fetchFeed.mockResolvedValue(feed);
    room(<Live eventSlug="hack-night-04" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The room didn’t load");
    expect(liveApi.fetchFeed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    expect(await screen.findByText("Demos move to Lab 3B — same time")).toBeInTheDocument();
    // The retry asks past the minute the first answer would be kept for.
    expect(discoverApi.event).toHaveBeenLastCalledWith("hack-night-04", { fresh: true });
  });

  it("says there is no room when no public event goes by that address", async () => {
    discoverApi.event.mockRejectedValue(Object.assign(new Error("No such event"), { notFound: true }));
    room(<Live eventSlug="nope" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("There’s no live room here");
    expect(screen.getByRole("link", { name: "Find events" })).toHaveAttribute("href", "/");
    expect(liveApi.fetchFeed).not.toHaveBeenCalled();
  });

  it("asks nothing more when the server did hand over the event", async () => {
    liveApi.fetchFeed.mockResolvedValue(feed);
    room(<Live eventId="68" eventSlug="hack-night-04" eventName="Hack Night 04" />);
    expect(await screen.findByText("Demos move to Lab 3B — same time")).toBeInTheDocument();
    expect(discoverApi.event).not.toHaveBeenCalled();
  });
});
