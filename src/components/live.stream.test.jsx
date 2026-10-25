import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { FakeEventSource } from "@/test/eventsource";

/*
 * The live room, the quiz and the event page's strip on the room's stream
 * (src/api/liveStream.js): the same screens, filled by snapshots; the taps
 * still go by their POSTs; and on today's API (the stream answers 404) the
 * same polls as before, with the same screen.
 */
vi.mock("@/api/live", () => ({
  errorLine: (e, f) => e?.response?.data?.message || f,
  liveApi: {
    fetchFeed: vi.fn(),
    fetchBanner: vi.fn(),
    ask: vi.fn(),
    vote: vi.fn(),
    respond: vi.fn(),
    joinQuiz: vi.fn(),
    playState: vi.fn(),
    answer: vi.fn(),
  },
}));

const { liveApi } = await import("@/api/live");
const { TIMING } = await import("@/api/liveStream");
const Live = (await import("./live.jsx")).default;
const Play = (await import("./play.jsx")).default;
const { LiveStrips } = await import("./discover/eventislands.jsx");

const question = { id: "x2", text: "Can we use TensorFlow Lite Micro?", author_name: "Rohan P.", status: "approved", pinned: false, votes: 14, created_at: "2026-10-13T12:55:00Z", voted: false, mine: false };
const feed = {
  event: { id: 68, name: "Hack Night 04", status: "live" },
  banner: { id: "u1", kind: "room", text: "Demos move to Lab 3B — same time" },
  updates: [],
  poll: { id: "p1", kind: "choice", prompt: "How comfortable are you with embedded C?", options: ["Never touched it", "A little"], status: "live", results: { responses: 95, choices: [{ label: "Never touched it", count: 21, pct: 22 }, { label: "A little", count: 38, pct: 40 }] }, my_response: null },
  questions: [question],
  qa: { approve_first: true, open: true },
  quiz: { live: true, title: "Edge AI warm-up quiz" },
};
const playing = { status: "live", title: "Edge AI warm-up quiz", name: "Sneha", score: 0, current_index: 0, total: 4, rank: null, leaderboard: [], question: { id: "q1", prompt: "RAM on an ESP32-S3?", options: [{ key: "a", label: "512 KB" }, { key: "b", label: "8 MB" }], seconds: 20, time_left: 17, my_answer: null, my_points: null, correct_key: null } };

const room = () => (
  <MemoryRouter initialEntries={["/events/hack-night-04/live"]}>
    <Routes>
      <Route path="/events/:slug/live" element={<Live eventId="68" eventSlug="hack-night-04" eventName="Hack Night 04" />} />
    </Routes>
  </MemoryRouter>
);
const play = () => (
  <MemoryRouter initialEntries={["/play/68"]}>
    <Routes>
      <Route path="/play/:id" element={<Play eventId="68" />} />
    </Routes>
  </MemoryRouter>
);
const strips = (status) => (
  <MemoryRouter>
    <LiveStrips event={{ id: 123, slug: "hack-night-04", status }} />
  </MemoryRouter>
);

const notFound = () => Promise.resolve(new Response('{"message":"Not Found"}', { status: 404, headers: { "content-type": "application/json" } }));
const push = (body, id) => act(() => FakeEventSource.last.snapshot(body, id));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  FakeEventSource.reset();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(notFound));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the live room, pushed", () => {
  it("draws the room from the stream without polling; a vote goes by its POST, and the next snapshot carries it as this browser's", async () => {
    liveApi.vote.mockResolvedValue({ id: "x2", votes: 15, voted: true });
    const { unmount } = render(room());
    expect(FakeEventSource.instances).toHaveLength(1);
    const es = FakeEventSource.last;
    expect(es.query.get("view")).toBe("room");
    expect(es.query.get("key")).toBe(localStorage.getItem("moa.live.key"));
    expect(screen.getByRole("status")).toHaveTextContent("Opening the room…");

    push(feed, 1);
    expect(screen.getByText("Demos move to Lab 3B — same time")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("Edge AI warm-up quiz")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /14 votes/ }));
    await waitFor(() => expect(liveApi.vote).toHaveBeenCalledWith("68", "x2"));
    expect(await screen.findByRole("button", { name: /15 votes, yours/ })).toBeInTheDocument();

    // The room's next snapshot is this browser's: its vote is in it.
    push({ ...feed, questions: [{ ...question, votes: 16, voted: true }] }, 2);
    expect(screen.getByRole("button", { name: "16 votes, yours among them" })).toBeInTheDocument();
    expect(liveApi.fetchFeed).not.toHaveBeenCalled();

    unmount();
    expect(es.closed).toBe(true);
  });

  it("answers the poll and asks by their POSTs; the poll's card follows the stream", async () => {
    liveApi.respond.mockResolvedValue({ ...feed.poll, my_response: "A little", results: { responses: 96, choices: [{ label: "Never touched it", count: 21, pct: 22 }, { label: "A little", count: 39, pct: 41 }] } });
    liveApi.ask.mockResolvedValue({ id: "x9", status: "pending" });
    liveApi.fetchFeed.mockResolvedValue(feed);
    render(room());
    push(feed, 1);
    fireEvent.click(screen.getByRole("button", { name: /A little/ }));
    await waitFor(() => expect(liveApi.respond).toHaveBeenCalledWith("68", "p1", "A little"));
    expect(await screen.findByText("41%")).toBeInTheDocument();
    push({ ...feed, poll: { ...feed.poll, my_response: "A little", results: { responses: 97, choices: [{ label: "Never touched it", count: 21, pct: 22 }, { label: "A little", count: 40, pct: 41 }] } } }, 2);
    expect(screen.getByText(/97 answers so far · you answered/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Is there a power bank station?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(liveApi.ask).toHaveBeenCalledWith("68", "Is there a power bank station?", ""));
    expect(await screen.findByText(/the organiser will put it up/)).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("on today's API (the stream answers 404) polls every 5 s and looks exactly as it does without a stream", async () => {
    vi.useFakeTimers();
    liveApi.fetchFeed.mockResolvedValue(feed);

    vi.stubGlobal("EventSource", undefined);
    const before = render(room());
    await act(() => vi.advanceTimersByTimeAsync(0));
    const html = before.container.innerHTML;
    expect(html).toContain("Demos move to Lab 3B");
    before.unmount();
    vi.clearAllMocks();

    vi.stubGlobal("EventSource", FakeEventSource);
    const after = render(room());
    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => FakeEventSource.last.refuse());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(after.container.innerHTML).toBe(html);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(60000));
    expect(liveApi.fetchFeed).toHaveBeenCalledTimes(14);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(after.container.innerHTML).toBe(html);
  });

  it("is never opened while the page is drawn on the server", () => {
    localStorage.setItem("moa.live.player.68", JSON.stringify({ player_key: "secret-key", name: "Sneha" }));
    liveApi.fetchFeed.mockResolvedValue(feed);
    renderToString(room());
    renderToString(play());
    renderToString(strips("live"));
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(liveApi.fetchFeed).not.toHaveBeenCalled();
  });

  it("is never opened for a bot: the room is polled, as before", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
    liveApi.fetchFeed.mockResolvedValue(feed);
    render(room());
    expect(await screen.findByText("Demos move to Lab 3B — same time")).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});

describe("the quiz, pushed", () => {
  it("plays from the stream: the question, an answer by its POST, the next snapshot; gone sends the player back to the room", async () => {
    localStorage.setItem("moa.live.player.68", JSON.stringify({ player_key: "secret-key", name: "Sneha" }));
    liveApi.answer.mockResolvedValue({ correct: true, points: 930, score: 930, correct_key: "a" });
    render(play());
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const es = FakeEventSource.last;
    expect(es.query.get("view")).toBe("quiz");
    expect(es.query.get("player")).toBe("secret-key");

    push(playing, 1);
    expect(screen.getByText("RAM on an ESP32-S3?")).toBeInTheDocument();
    expect(screen.getByLabelText("17 seconds left")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /512 KB/ }));
    await waitFor(() => expect(liveApi.answer).toHaveBeenCalledWith("68", "secret-key", "a"));
    expect(await screen.findByText("Right — +930")).toBeInTheDocument();

    push({ ...playing, score: 930, rank: 1, question: { ...playing.question, time_left: 12, my_answer: "a", my_points: 930, correct_key: "a" } }, 2);
    expect(screen.getByText("930 points")).toBeInTheDocument();
    expect(screen.getByText("1st right now")).toBeInTheDocument();
    expect(screen.getByLabelText("12 seconds left")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /8 MB/ })).toBeDisabled();
    expect(liveApi.playState).not.toHaveBeenCalled();

    // Removed from the quiz: the stream says so, one poll confirms, and the page does what it always did.
    liveApi.playState.mockRejectedValue({ response: { status: 401 } });
    act(() => es.gone(401, "You are not in this quiz. Join again with the code on the screen."));
    expect(await screen.findByText("That quiz has moved on")).toBeInTheDocument();
    expect(liveApi.playState).toHaveBeenCalledWith("68", "secret-key");
    expect(localStorage.getItem("moa.live.player.68")).toBeNull();
    expect(es.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("on today's API polls the player's state every 2 s, as before", async () => {
    vi.useFakeTimers();
    localStorage.setItem("moa.live.player.68", JSON.stringify({ player_key: "secret-key", name: "Sneha" }));
    liveApi.playState.mockResolvedValue(playing);
    render(play());
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => FakeEventSource.last.refuse());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("RAM on an ESP32-S3?")).toBeInTheDocument();
    expect(liveApi.playState).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(liveApi.playState).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(TIMING.afterOff - 2000));
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});

describe("the event page's live strip", () => {
  const banner = { event: { id: 123, status: "live" }, banner: { kind: "general", text: "Round two in ten minutes" }, poll: null, quiz: { live: false, title: null }, qa: { open: true, has_questions: false } };

  it("is pushed while the event is live, as the small banner view with no key", () => {
    render(strips("live"));
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.last.url).toContain("/api/v1/events/123/live/stream?view=banner");
    expect(FakeEventSource.last.query.get("key")).toBeNull();
    push(banner, 1);
    expect(screen.getByText("Round two in ten minutes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the live room" })).toHaveAttribute("href", "/events/hack-night-04/live");
    push({ ...banner, banner: null }, 2);
    expect(screen.queryByText("Round two in ten minutes")).toBeNull();
    // The floor has questions: the strip says so.
    push({ ...banner, banner: null, qa: { open: true, has_questions: true } }, 3);
    expect(screen.getByText("Questions are being taken from the floor")).toBeInTheDocument();
    push({ ...banner, banner: null, poll: { id: "p1", kind: "choice", prompt: "Which track?" } }, 4);
    expect(screen.getByText("Which track?")).toBeInTheDocument();
    expect(liveApi.fetchBanner).not.toHaveBeenCalled();
    expect(liveApi.fetchFeed).not.toHaveBeenCalled();
  });

  it("falls back to the half-minute poll of the strip on today's API", async () => {
    vi.useFakeTimers();
    liveApi.fetchBanner.mockResolvedValue(banner);
    render(strips("live"));
    act(() => FakeEventSource.last.refuse());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("Round two in ten minutes")).toBeInTheDocument();
    expect(liveApi.fetchBanner).toHaveBeenCalledTimes(1);
    expect(liveApi.fetchBanner).toHaveBeenCalledWith(123);
    await act(() => vi.advanceTimersByTimeAsync(29999));
    expect(liveApi.fetchBanner).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(liveApi.fetchBanner).toHaveBeenCalledTimes(2);
    expect(liveApi.fetchFeed).not.toHaveBeenCalled();
  });

  it("before the event, polls the strip every half minute and holds no stream; after it, reads once", async () => {
    vi.useFakeTimers();
    liveApi.fetchBanner.mockResolvedValue(banner);
    const upcoming = render(strips("upcoming"));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("Round two in ten minutes")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(liveApi.fetchBanner).toHaveBeenCalledTimes(2);
    upcoming.unmount();

    vi.clearAllMocks();
    render(strips("ended"));
    await act(() => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
    expect(liveApi.fetchBanner).toHaveBeenCalledTimes(1);
    expect(liveApi.fetchFeed).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
