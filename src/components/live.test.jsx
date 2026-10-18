import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/api/live", () => ({
  errorLine: (e, f) => e?.response?.data?.message || f,
  liveApi: {
    fetchFeed: vi.fn(),
    ask: vi.fn(),
    vote: vi.fn(),
    respond: vi.fn(),
    joinQuiz: vi.fn(),
    playState: vi.fn(),
    answer: vi.fn(),
    fetchSurvey: vi.fn(),
    submitSurvey: vi.fn(),
  },
}));

const { liveApi } = await import("@/api/live");
const Live = (await import("./live.jsx")).default;
const Play = (await import("./play.jsx")).default;
const Feedback = (await import("./feedback.jsx")).default;

const feed = {
  event: { id: 68, name: "Hack Night 04", status: "live" },
  banner: { id: "u1", kind: "room", text: "Demos move to Lab 3B — same time", audience: "checked_in", recipients: 88, pushed: 80, sent_at: "2026-10-13T13:00:00Z" },
  updates: [],
  poll: { id: "p1", kind: "choice", prompt: "How comfortable are you with embedded C?", options: ["Never touched it", "A little"], status: "live", sort_order: 0, results: { responses: 95, choices: [{ label: "Never touched it", count: 21, pct: 22 }, { label: "A little", count: 38, pct: 40 }] }, my_response: null },
  questions: [{ id: "x2", text: "Can we use TensorFlow Lite Micro?", author_name: "Rohan P.", status: "approved", pinned: false, votes: 14, created_at: "2026-10-13T12:55:00Z", voted: false, mine: false }],
  qa: { approve_first: true, open: true },
  quiz: { live: true, title: "Edge AI warm-up quiz" },
};

const at = (path, element, pattern) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={element} />
        {pattern === "/play/:id" ? null : <Route path="/play/:eventId" element={<p>play page</p>} />}
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("the live room", () => {
  it("shows the banner, the poll, the quiz door and the questions, and sends a vote", async () => {
    liveApi.fetchFeed.mockResolvedValue(feed);
    liveApi.vote.mockResolvedValue({ id: "x2", votes: 15, voted: true });
    at("/events/hack-night-04/live", <Live eventId="68" eventSlug="hack-night-04" eventName="Hack Night 04" />, "/events/:slug/live");
    expect(await screen.findByText("Demos move to Lab 3B — same time")).toBeInTheDocument();
    expect(screen.getByText("How comfortable are you with embedded C?")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("Edge AI warm-up quiz")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /14 votes/ }));
    await waitFor(() => expect(liveApi.vote).toHaveBeenCalledWith("68", "x2"));
    expect(await screen.findByRole("button", { name: /15 votes, yours/ })).toBeInTheDocument();
  });

  it("answers the poll and asks a question with the browser's key", async () => {
    liveApi.fetchFeed.mockResolvedValue(feed);
    liveApi.respond.mockResolvedValue({ ...feed.poll, my_response: "A little", results: { responses: 96, choices: [{ label: "Never touched it", count: 21, pct: 22 }, { label: "A little", count: 39, pct: 41 }] } });
    liveApi.ask.mockResolvedValue({ id: "x9", status: "pending" });
    at("/events/hack-night-04/live", <Live eventId="68" eventSlug="hack-night-04" eventName="Hack Night 04" />, "/events/:slug/live");
    fireEvent.click(await screen.findByRole("button", { name: /A little/ }));
    await waitFor(() => expect(liveApi.respond).toHaveBeenCalledWith("68", "p1", "A little"));
    expect(await screen.findByText("41%")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Is there a power bank station?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(liveApi.ask).toHaveBeenCalledWith("68", "Is there a power bank station?", ""));
    expect(await screen.findByText(/the organiser will put it up/)).toBeInTheDocument();
  });

  it("joins the quiz with the code and the name, and remembers the player", async () => {
    liveApi.fetchFeed.mockResolvedValue(feed);
    liveApi.joinQuiz.mockResolvedValue({ event_id: 68, quiz_id: "qz", title: "Edge AI warm-up quiz", player_id: "pl1", player_key: "secret-key", name: "Sneha" });
    at("/events/hack-night-04/live", <Live eventId="68" eventSlug="hack-night-04" eventName="Hack Night 04" />, "/events/:slug/live");
    fireEvent.change(await screen.findByLabelText("Join code"), { target: { value: "483921" } });
    fireEvent.change(screen.getByLabelText("Your name for the quiz"), { target: { value: "Sneha" } });
    fireEvent.click(screen.getByRole("button", { name: "Join the quiz" }));
    await waitFor(() => expect(liveApi.joinQuiz).toHaveBeenCalledWith("483921", "Sneha"));
    expect(await screen.findByText("play page")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("moa.live.player.68")).player_key).toBe("secret-key");
  });
});

describe("the quiz, played", () => {
  it("answers the open question and shows the verdict", async () => {
    localStorage.setItem("moa.live.player.68", JSON.stringify({ player_key: "secret-key", name: "Sneha" }));
    liveApi.playState.mockResolvedValue({ status: "live", title: "Edge AI warm-up quiz", name: "Sneha", score: 0, current_index: 0, total: 4, rank: null, leaderboard: [], question: { id: "q1", prompt: "RAM on an ESP32-S3?", options: [{ key: "a", label: "512 KB" }, { key: "b", label: "8 MB" }], seconds: 20, time_left: 17, my_answer: null, my_points: null, correct_key: null } });
    liveApi.answer.mockResolvedValue({ correct: true, points: 930, score: 930, correct_key: "a" });
    at("/play/68", <Play eventId="68" />, "/play/:id");
    expect(await screen.findByText("RAM on an ESP32-S3?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /512 KB/ }));
    await waitFor(() => expect(liveApi.answer).toHaveBeenCalledWith("68", "secret-key", "a"));
    expect(await screen.findByText("Right — +930")).toBeInTheDocument();
    expect(screen.getByText("930 points")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /8 MB/ })).toBeDisabled();
  });

  it("sends people without a player back to the room", async () => {
    at("/play/68", <Play eventId="68" />, "/play/:id");
    expect(await screen.findByText("You are not in a quiz")).toBeInTheDocument();
    expect(liveApi.playState).not.toHaveBeenCalled();
  });
});

describe("the survey", () => {
  it("takes a rating, a 0–10 and a line, and sends them with the link's key", async () => {
    liveApi.fetchSurvey.mockResolvedValue({ event_name: "Hack Night 04", club_name: "Circuit Society", first_name: "Sneha", submitted: false, questions: [{ key: "overall", kind: "rating", label: "How was the event overall?" }, { key: "recommend", kind: "nps", label: "How likely are you to recommend us?" }, { key: "change", kind: "text", label: "What should we change?" }] });
    liveApi.submitSurvey.mockResolvedValue({ submitted: true });
    at("/feedback/68/reg-1?k=tok", <Feedback eventId="68" registrationId="reg-1" k="tok" />, "/feedback/:eventId/:registrationId");
    expect(await screen.findByText("How was Hack Night 04?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "5 of 5" }));
    fireEvent.click(screen.getByRole("button", { name: "9" }));
    fireEvent.change(screen.getByLabelText("What should we change?"), { target: { value: "More time for hacking" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(liveApi.submitSurvey).toHaveBeenCalledWith("68", "reg-1", "tok", { overall: 5, recommend: 9, change: "More time for hacking" }));
    expect(await screen.findByText("Thank you, Sneha.")).toBeInTheDocument();
  });
});

describe("questions from the room", () => {
  it("hides the ask box when the feed says the room takes no questions, and keeps the ones asked", async () => {
    liveApi.fetchFeed.mockResolvedValue({ ...feed, qa: { approve_first: false, open: false } });
    at("/events/hack-night-04/live", <Live eventId="68" eventSlug="hack-night-04" />, "/events/:slug/live");
    expect(await screen.findByRole("heading", { name: "Questions from the room" })).toBeInTheDocument();
    expect(screen.getByText(/Questions aren.t open right now/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Your question")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ask" })).toBeNull();
    // What was asked stays, to read and vote on.
    expect(screen.getByText("Can we use TensorFlow Lite Micro?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /14 votes/ })).toBeInTheDocument();
  });

  it("shows nothing of the questions when the room takes none and none were asked", async () => {
    liveApi.fetchFeed.mockResolvedValue({ ...feed, questions: [], qa: { approve_first: false, open: false } });
    at("/events/hack-night-04/live", <Live eventId="68" eventSlug="hack-night-04" />, "/events/:slug/live");
    expect(await screen.findByText("Demos move to Lab 3B — same time")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Ask the room|Questions from the room/ })).toBeNull();
    expect(screen.queryByLabelText("Your question")).toBeNull();
  });

  it("closes the ask box when a question is refused with 409 QA_CLOSED, without an error", async () => {
    liveApi.fetchFeed.mockResolvedValue(feed);
    liveApi.ask.mockRejectedValue({ response: { status: 409, data: { message: "Questions aren't open for this event right now.", error_code: "QA_CLOSED" } } });
    at("/events/hack-night-04/live", <Live eventId="68" eventSlug="hack-night-04" />, "/events/:slug/live");
    fireEvent.change(await screen.findByLabelText("Your question"), { target: { value: "Is there a power bank station?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(screen.queryByLabelText("Your question")).toBeNull());
    expect(screen.getByRole("heading", { name: "Questions from the room" })).toBeInTheDocument();
    expect(screen.getByText(/Questions aren.t open right now/)).toBeInTheDocument();
    expect(screen.queryByText("That did not send. Try again.")).toBeNull();
    expect(document.querySelector(".live-error")).toBeNull();
  });

  it("says any other refusal in the server's words and keeps the box", async () => {
    liveApi.fetchFeed.mockResolvedValue(feed);
    liveApi.ask.mockRejectedValue({ response: { status: 429, data: { message: "Slow down a little." } } });
    at("/events/hack-night-04/live", <Live eventId="68" eventSlug="hack-night-04" />, "/events/:slug/live");
    fireEvent.change(await screen.findByLabelText("Your question"), { target: { value: "Is there a power bank station?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("Slow down a little.")).toBeInTheDocument();
    expect(screen.getByLabelText("Your question")).toBeInTheDocument();
  });

  it("has the event's name and the way back before the feed arrives", () => {
    liveApi.fetchFeed.mockReturnValue(new Promise(() => {}));
    at("/events/hack-night-04/live", <Live eventId="68" eventSlug="hack-night-04" eventName="Hack Night 04" />, "/events/:slug/live");
    expect(screen.getByRole("heading", { level: 1, name: "Hack Night 04" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Event" })).toHaveAttribute("href", "/events/hack-night-04");
    expect(screen.getByRole("status")).toHaveTextContent("Opening the room…");
  });
});
