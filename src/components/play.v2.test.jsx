import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/api/live", () => ({
  errorLine: (e, f) => e?.response?.data?.message || f,
  liveApi: {
    fetchFeed: vi.fn(),
    fetchBanner: vi.fn(),
    respond: vi.fn(),
    joinQuiz: vi.fn(),
    playState: vi.fn(),
    answer: vi.fn(),
    fetchTheme: vi.fn(),
  },
}));

const { liveApi } = await import("@/api/live");
const { default: Play, teamLabel } = await import("./play.jsx");

/**
 * The quiz page against this release's API (X-Live-Version: 2): every
 * question kind, the round's phases, points as the round scores them,
 * teams, rounds and the theme. The state below is the play state the
 * backend sends (CONTRACT.md 5.5), with invented players.
 */
const options4 = [
  { key: "a", label: "2" },
  { key: "b", label: "9" },
  { key: "c", label: "11" },
  { key: "d", label: "15" },
];

const state = (over = {}, q = {}) => ({
  status: "live",
  title: "Round 1",
  name: "Sneha",
  score: 0,
  current_index: 0,
  total: 5,
  rank: null,
  leaderboard: [],
  quiz_id: "qz1",
  round: { index: 0, count: 1 },
  phase: "question",
  paused: false,
  board_now: false,
  next_at: null,
  team: null,
  teams: null,
  tag: "7F2",
  streak: 0,
  theme_version: null,
  question: {
    id: "q1",
    prompt: "Which of these are prime?",
    options: options4,
    seconds: 30,
    sort_order: 0,
    time_left: 20,
    my_answer: null,
    my_points: null,
    my_correct: null,
    correct_key: null,
    kind: "single",
    effective_points: 1000,
    double: false,
    my_response: null,
    my_credit: null,
    correct_keys: null,
    accepted: null,
    correct_order: null,
    ...q,
  },
  ...over,
});

const play = () => {
  localStorage.setItem("moa.live.player.68", JSON.stringify({ player_key: "pk1", name: "Sneha", team: null }));
  return render(
    <MemoryRouter initialEntries={["/play/68"]}>
      <Routes>
        <Route path="/play/:id" element={<Play eventId="68" />} />
      </Routes>
    </MemoryRouter>
  );
};

/** Lets the page take its state (the poll's first read), then `ms` more. */
const step = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers();
  liveApi.fetchTheme.mockResolvedValue(null);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("several right answers", () => {
  it("toggles the answers, locks them in together, then shows partial credit and what was missed", async () => {
    const open = state({}, { kind: "multi" });
    const revealed = state({ phase: "revealed", score: 437 }, { kind: "multi", time_left: 0, my_response: { option_keys: ["a"] }, my_points: 437, my_correct: false, my_credit: 0.5, correct_keys: ["a", "c"] });
    liveApi.playState.mockResolvedValueOnce(open).mockResolvedValueOnce(open).mockResolvedValue(revealed);
    liveApi.answer.mockResolvedValue({ correct: null, points: null, score: 0, answered: true });
    play();
    await step();
    const lock = screen.getByRole("button", { name: "Pick your answers" });
    expect(lock).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^2/ }));
    expect(screen.getByRole("button", { name: /^2/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /^11/ }));
    fireEvent.click(screen.getByRole("button", { name: /^11/ }));
    expect(screen.getByRole("button", { name: "Lock in 1 answer" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Lock in 1 answer" }));
    await step();
    expect(liveApi.answer).toHaveBeenCalledWith("68", "pk1", { option_keys: ["a"] });
    expect(screen.getByText("Answer locked in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Lock in/ })).toBeNull();

    await step(4000);
    expect(screen.getByText("Partly right — +437")).toBeInTheDocument();
    expect(screen.getByText("The answers were 2 and 11.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^2/ }).className).toContain("is-right");
    expect(screen.getByRole("button", { name: /^11/ }).className).toContain("is-missed");
    expect(screen.getByRole("button", { name: /a right answer you missed/ })).toBeInTheDocument();
  });
});

describe("type the answer", () => {
  it("sends what was typed, trimmed, and shows the answers taken once revealed", async () => {
    const q = { kind: "type", options: [], prompt: "Capital of Kerala?" };
    liveApi.playState.mockResolvedValueOnce(state({}, q)).mockResolvedValueOnce(state({}, q)).mockResolvedValue(state({ phase: "revealed", score: 875 }, { ...q, time_left: 0, my_response: { text: "Thiruvananthapuram" }, my_points: 875, my_correct: true, my_credit: 1, accepted: ["Thiruvananthapuram", "Trivandrum"] }));
    liveApi.answer.mockResolvedValue({ correct: null, points: null, score: 0, answered: true });
    play();
    await step();
    const box = screen.getByLabelText("Your answer");
    expect(box).toHaveAttribute("maxLength", "120");
    expect(box).toHaveAttribute("autocomplete", "off");
    const send = screen.getByRole("button", { name: "Send my answer" });
    expect(send).toBeDisabled();
    fireEvent.change(box, { target: { value: "  Thiruvananthapuram " } });
    fireEvent.click(send);
    await step();
    expect(liveApi.answer).toHaveBeenCalledWith("68", "pk1", { text: "Thiruvananthapuram" });
    expect(screen.getByText("Answer locked in")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your answer")).toBeNull();
    await step(4000);
    expect(screen.getByText("Right — +875")).toBeInTheDocument();
    expect(screen.getByText("Thiruvananthapuram · Trivandrum")).toBeInTheDocument();
  });
});

describe("put in order", () => {
  const q = { kind: "order", prompt: "Oldest first", options: [{ key: "c", label: "Python" }, { key: "a", label: "C" }, { key: "b", label: "Java" }] };

  it("moves rows with large up and down buttons, says where each went, and locks the order in", async () => {
    liveApi.playState.mockResolvedValue(state({}, q));
    liveApi.answer.mockResolvedValue({ correct: null, points: null, score: 0, answered: true });
    play();
    await step();
    const list = screen.getByRole("list", { name: "Put these in order" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent.replace(/[↑↓]/g, ""))).toEqual(["1Python", "2C", "3Java"]);
    expect(screen.getByRole("button", { name: "Move Python up" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move C up" }));
    expect(screen.getByText("Moved C to 1 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lock in this order" }));
    await step();
    expect(liveApi.answer).toHaveBeenCalledWith("68", "pk1", { order: ["a", "c", "b"] });
    expect(screen.queryByRole("button", { name: /Move/ })).toBeNull();
  });

  it("shows which rows were in the right place, and the right order", async () => {
    liveApi.playState.mockResolvedValue(state({ phase: "revealed", score: 333 }, { ...q, time_left: 0, my_response: { order: ["a", "b", "c"] }, my_points: 333, my_correct: false, my_credit: 1 / 3, correct_order: ["a", "c", "b"] }));
    play();
    await step();
    expect(screen.getByText("Partly right — +333")).toBeInTheDocument();
    const mine = within(screen.getByRole("list", { name: "Your order" })).getAllByRole("listitem");
    expect(mine.map((li) => li.className)).toEqual(["lt-order-row is-right", "lt-order-row is-wrong", "lt-order-row is-wrong"]);
    const right = screen.getByRole("heading", { name: "The right order" }).nextElementSibling;
    expect(within(right).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["C", "Python", "Java"]);
  });
});

describe("true or false, and poll questions", () => {
  it("lays true and false side by side", async () => {
    liveApi.playState.mockResolvedValue(state({}, { kind: "true_false", prompt: "The ESP32 has Wi-Fi.", options: [{ key: "a", label: "True" }, { key: "b", label: "False" }] }));
    play();
    await step();
    expect(screen.getByRole("button", { name: "True" }).parentElement.className).toContain("is-pair");
  });

  it("says a poll question has no right answer, thanks the player, and shows the room's tally once revealed", async () => {
    const q = { kind: "poll", prompt: "Tabs or spaces?", options: [{ key: "a", label: "Tabs" }, { key: "b", label: "Spaces" }], effective_points: 0 };
    liveApi.playState.mockResolvedValueOnce(state({}, q)).mockResolvedValue(state({ phase: "revealed" }, { ...q, time_left: 0, my_answer: "b", my_response: { option_key: "b" }, my_points: 0, counts: [{ key: "a", label: "Tabs", count: 3 }, { key: "b", label: "Spaces", count: 9 }] }));
    play();
    await step();
    expect(screen.getByText("Poll — no right answer")).toBeInTheDocument();
    await step(2000);
    expect(screen.getByText("Thanks — that one was a poll.")).toBeInTheDocument();
    const tally = within(screen.getByRole("list", { name: "How the room answered" })).getAllByRole("listitem");
    expect(tally.map((li) => li.textContent)).toEqual(["Tabs25% · 3 answers", "Spaces75% · 9 answers"]);
    expect(tally[1].className).toBe("is-mine");
    expect(screen.queryByText(/Not that one|Right —/)).toBeNull();
  });
});

describe("the round's phases", () => {
  it("stops the clock while paused and takes no answer", async () => {
    liveApi.playState.mockResolvedValue(state({ phase: "paused", paused: true }, { time_left: 12 }));
    play();
    await step();
    expect(screen.getByText("Paused — the host will carry on in a moment.")).toBeInTheDocument();
    expect(screen.getByLabelText("Paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^9/ })).toBeDisabled();
    await step(3000);
    expect(screen.getByLabelText("Paused")).toBeInTheDocument();
  });

  it("says the host reveals the answer once answers are in", async () => {
    liveApi.playState.mockResolvedValue(state({ phase: "closed" }, { time_left: 0, my_answer: "a", my_response: { option_key: "a" } }));
    play();
    await step();
    expect(screen.getByText("Answers are in — the host reveals the answer.")).toBeInTheDocument();
    expect(screen.queryByText(/Answer locked in/)).toBeNull();
    expect(screen.getByRole("button", { name: /^9/ })).toBeDisabled();
  });

  it("counts down to the next question in a round that moves on by itself", async () => {
    vi.setSystemTime(new Date("2026-11-29T10:00:00Z"));
    liveApi.playState.mockResolvedValue(state({ phase: "revealed", next_at: "2026-11-29T10:00:05Z" }, { time_left: 0, my_answer: "a", my_response: { option_key: "a" }, my_points: 1000, my_correct: true, my_credit: 1, correct_key: "a" }));
    play();
    await step();
    expect(screen.getByText("Next question in 5s")).toBeInTheDocument();
    await step(2000);
    expect(screen.getByText("Next question in 3s")).toBeInTheDocument();
  });
});

describe("points as the round scores them", () => {
  it("shows a wrong answer's negative points", async () => {
    liveApi.playState.mockResolvedValue(state({ phase: "revealed", score: 0 }, { time_left: 0, my_answer: "b", my_response: { option_key: "b" }, my_points: -250, my_correct: false, my_credit: 0, correct_key: "a" }));
    play();
    await step();
    expect(screen.getByText("Not that one — −250")).toBeInTheDocument();
    expect(screen.getByText("The answer was 2.")).toBeInTheDocument();
  });

  it("tags a double-points question and what it is worth", async () => {
    liveApi.playState.mockResolvedValue(state({}, { double: true, effective_points: 2000 }));
    play();
    await step();
    expect(screen.getByText("Double points")).toBeInTheDocument();
    expect(screen.getByText("2000 points")).toBeInTheDocument();
  });

  it("tags nothing on a question worth the usual 1000", async () => {
    liveApi.playState.mockResolvedValue(state());
    play();
    await step();
    expect(document.querySelector(".play-tags")).toBeNull();
  });

  it("says when a streak bonus came with the points", async () => {
    liveApi.playState.mockResolvedValue(state({ phase: "revealed", streak: 3, score: 3100 }, { time_left: 0, my_answer: "a", my_response: { option_key: "a" }, my_points: 1100, my_correct: true, my_credit: 1, correct_key: "a" }));
    play();
    await step();
    expect(screen.getByText("Right — +1100")).toBeInTheDocument();
    expect(screen.getByText("Includes a streak bonus: 3 right in a row.")).toBeInTheDocument();
  });
});

describe("teams and rounds", () => {
  const red = { key: "red", name: "Red Rockets", color: "#E11D48" };
  const teams = [
    { ...red, players: 70, score: 140000, rank: 1 },
    { key: "blue", name: "Blue Whales", color: "#2563EB", players: 68, score: 120000, rank: 2 },
  ];

  it("shows the player's team in the lobby and the round among the rounds", async () => {
    liveApi.playState.mockResolvedValue(state({ phase: "lobby", question: null, current_index: -1, team: red, round: { index: 1, count: 3 } }));
    play();
    await step();
    expect(screen.getByRole("heading", { name: "You are in, Sneha" })).toBeInTheDocument();
    expect(screen.getByText("Team Red Rockets")).toBeInTheDocument();
    expect(screen.getByText("Round 2 of 3 · 5 questions tonight")).toBeInTheDocument();
  });

  it("says a team whose name already starts with Team once, never “Team Team Flutter”", async () => {
    const flutter = { key: "flutter", name: "Team Flutter", color: "#4285F4" };
    liveApi.playState.mockResolvedValue(state({ team: flutter, teams: [{ ...flutter, players: 3, score: 1728, rank: 3 }] }));
    play();
    await step();
    expect(screen.getByText("Team Flutter", { selector: ".lt-team-chip" })).toBeInTheDocument();
    expect(screen.queryByText(/Team Team/)).toBeNull();
  });

  it.each([
    ["Red Rockets", "Team Red Rockets"],
    ["Team Flutter", "Team Flutter"],
    ["team kotlin", "team kotlin"],
    ["TEAM-A", "TEAM-A"],
    ["  Team Android ", "Team Android"],
    // A name that only begins with the letters is still named as a team.
    ["Teamsters", "Team Teamsters"],
  ])("names %j as %j", (name, said) => {
    expect(teamLabel(name)).toBe(said);
  });

  it("shows the teams' board with the board, the player's team marked", async () => {
    liveApi.playState.mockResolvedValue(
      state({ phase: "revealed", board_now: true, team: red, teams, rank: 2, score: 1750, leaderboard: [{ rank: 1, name: "Rohan", score: 2000, team: "blue" }, { rank: 2, name: "Sneha", score: 1750, team: "red" }] }, { time_left: 0, my_answer: "a", my_response: { option_key: "a" }, my_points: 1750, my_correct: true, my_credit: 1, correct_key: "a" })
    );
    play();
    await step();
    const board = within(screen.getByRole("list", { name: "Teams" })).getAllByRole("listitem");
    expect(board[0].textContent).toContain("Red Rockets (your team)");
    expect(board[0]).toHaveClass("is-me");
    const rows = within(screen.getByRole("list", { name: "Leaderboard" })).getAllByRole("listitem");
    expect(rows[0].textContent).toBe("1Rohan, Blue Whales2000");
  });

  it("ends a round that has more to come by saying so, not as the end of the quiz", async () => {
    liveApi.playState.mockResolvedValue(state({ status: "ended", phase: "ended", question: null, round: { index: 0, count: 3 }, rank: 4, score: 2600, leaderboard: [{ rank: 1, name: "Rohan", score: 4000 }] }));
    play();
    await step();
    expect(screen.getByRole("heading", { level: 2, name: "That is round 1 of 3" })).toBeInTheDocument();
    expect(screen.getByText(/the next round starts here/)).toBeInTheDocument();
    expect(screen.getByText("You came 4th with 2600 points.")).toBeInTheDocument();
  });

  it("shows the board across the rounds at the end, when the API sends it", async () => {
    liveApi.playState.mockResolvedValue(state({ status: "ended", phase: "ended", question: null, round: { index: 2, count: 3 }, rank: 1, score: 3000, overall: [{ rank: 1, name: "Sneha", score: 8125, rounds: 3, saved_ms: 84210 }, { rank: 2, name: "Rohan", score: 7000, rounds: 3, saved_ms: 60000 }] }));
    play();
    await step();
    expect(screen.getByRole("heading", { level: 2, name: "That is the quiz" })).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "Across the rounds" })).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["1Sneha8125", "2Rohan7000"]);
  });

  it("joins the next round on its own with the same name when the API says one has started", async () => {
    const newRound = { response: { status: 401, data: { message: "A new round has started.", error_code: "QUIZ_NEW_ROUND", errors: { join_code: "555111", quiz_id: "qz2", title: "Round 2" } } } };
    liveApi.playState.mockImplementation(async (_, key) => {
      if (key === "pk1") throw newRound;
      return state({ phase: "lobby", question: null, title: "Round 2", round: { index: 1, count: 2 } });
    });
    liveApi.joinQuiz.mockResolvedValue({ event_id: 68, quiz_id: "qz2", title: "Round 2", player_id: "pl2", player_key: "pk2", name: "Sneha", team: null, tag: "A01" });
    play();
    await step();
    await step(2000);
    expect(liveApi.joinQuiz).toHaveBeenCalledTimes(1);
    expect(liveApi.joinQuiz).toHaveBeenCalledWith("555111", "Sneha");
    expect(JSON.parse(localStorage.getItem("moa.live.player.68")).player_key).toBe("pk2");
    expect(liveApi.playState).toHaveBeenLastCalledWith("68", "pk2");
    expect(screen.getByRole("heading", { level: 1, name: "Round 2" })).toBeInTheDocument();
    expect(screen.getByText("Round 2 of 2 · 5 questions tonight")).toBeInTheDocument();
  });

  it("says why when the next round does not take the player", async () => {
    liveApi.playState.mockRejectedValue({ response: { status: 401, data: { error_code: "QUIZ_NEW_ROUND", errors: { join_code: "555111" } } } });
    liveApi.joinQuiz.mockRejectedValue({ response: { status: 409, data: { message: "This quiz has started; new players can't join now.", error_code: "QUIZ_LATE" } } });
    play();
    await step();
    await step();
    expect(screen.getByRole("heading", { name: "That quiz has moved on" })).toBeInTheDocument();
    expect(screen.getByText("This quiz has started; new players can't join now.")).toBeInTheDocument();
    expect(localStorage.getItem("moa.live.player.68")).toBeNull();
  });
});

describe("a kind this page does not know", () => {
  it("asks for a reload instead of showing a question nobody can answer", async () => {
    liveApi.playState.mockResolvedValue(state({}, { kind: "draw_it" }));
    play();
    await step();
    expect(screen.getByText("This kind of question needs a newer version of this page.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload the page" })).toBeInTheDocument();
  });
});

describe("the theme", () => {
  const theme = (over = {}) => ({
    custom: true,
    version: "v1",
    theme: {
      preset: "club",
      colors: { background: "#101820", accent: "#F2AA4C", answers: ["#E4572E", "#29335C", "#F3A712", "#669BBC", "#A8C686", "#7D4E57"] },
      text: { on_background: "#FFFFFF", on_accent: "#111827", on_answers: ["#111827", "#FFFFFF", "#111827", "#111827", "#111827", "#FFFFFF"] },
      font: { display: "space_grotesk", body: "inter" },
      answers: { style: "shapes" },
      timer: "ring",
      leaderboard: { size: 5, podium: false, animate: true, own_rank: true },
      logo: { id: "m1", thumbnail: "https://media.myotherapp.in/t.png", medium: "https://media.myotherapp.in/m.png", large: "https://media.myotherapp.in/l.png", width: 200, height: 100 },
      background: { kind: "color", gradient: null, image: null, dim: 0.45 },
      guest: { text_scale: 1.0, logo: true, background: "theme", answer_layout: "grid" },
      ...over,
    },
  });

  it("asks for the theme the play state names, and draws the answers in its colours and shapes", async () => {
    liveApi.fetchTheme.mockResolvedValue(theme());
    liveApi.playState.mockResolvedValue(state({ theme_version: "v1" }));
    const { container } = play();
    await step();
    await step();
    expect(liveApi.fetchTheme).toHaveBeenCalledWith("68");
    const page = container.querySelector(".live-page");
    expect(page.className).toContain("lt-on");
    expect(page.style.getPropertyValue("--lt-accent")).toBe("#F2AA4C");
    expect(container.querySelector(".lt-backdrop").style.backgroundColor).toBe("rgb(16, 24, 32)");
    const tile = screen.getByRole("button", { name: /^2/ });
    expect(tile.className).toContain("is-tinted");
    expect(tile.style.getPropertyValue("--tile")).toBe("var(--lt-a0)");
    expect(tile.querySelector("svg.lt-shape")).not.toBeNull();
    expect(tile.parentElement.className).toContain("is-grid");
    expect(screen.getByRole("timer", { name: "20 seconds left" })).toBeInTheDocument();
    expect(container.querySelector("img.lt-logo").getAttribute("src")).toBe("https://media.myotherapp.in/m.png");
    // Stored for the tab: the next page in this room opens in it.
    expect(JSON.parse(sessionStorage.getItem("moa.live.theme.68")).version).toBe("v1");
  });

  it("opens in the theme the room left in this tab, without asking again", async () => {
    sessionStorage.setItem("moa.live.theme.68", JSON.stringify(theme()));
    liveApi.playState.mockResolvedValue(state({ theme_version: "v1" }));
    const { container } = play();
    await step();
    expect(container.querySelector(".live-page").className).toContain("lt-on");
    expect(liveApi.fetchTheme).not.toHaveBeenCalled();
  });

  it("hides the clock, or shows the seconds alone, as the theme says", async () => {
    sessionStorage.setItem("moa.live.theme.68", JSON.stringify(theme({ timer: "hidden" })));
    liveApi.playState.mockResolvedValue(state({ theme_version: "v1" }));
    const first = play();
    await step();
    expect(screen.queryByLabelText(/seconds left/)).toBeNull();
    expect(first.container.querySelector(".play-timebar")).toBeNull();
    first.unmount();
    sessionStorage.setItem("moa.live.theme.68", JSON.stringify(theme({ timer: "number" })));
    play();
    await step();
    expect(screen.getByLabelText("20 seconds left").className).toContain("is-big");
    expect(document.querySelector(".play-timebar")).toBeNull();
  });

  it("draws the final board without a podium when the theme says so", async () => {
    sessionStorage.setItem("moa.live.theme.68", JSON.stringify(theme()));
    liveApi.playState.mockResolvedValue(state({ theme_version: "v1", status: "ended", phase: "ended", question: null, rank: 2, score: 1840, leaderboard: [{ rank: 1, name: "Rohan", score: 2210 }, { rank: 2, name: "Sneha", score: 1840 }, { rank: 3, name: "Kiran", score: 990 }] }));
    play();
    await step();
    expect(screen.getByRole("list", { name: "Leaderboard" }).className).toBe("play-board");
  });

  it("keeps today's look when the room has no theme, and asks for none on an API from before themes", async () => {
    liveApi.playState.mockResolvedValue({ status: "live", title: "Quiz", name: "Sneha", score: 0, current_index: 0, total: 4, rank: null, leaderboard: [], question: { id: "q1", prompt: "RAM on an ESP32-S3?", options: [{ key: "a", label: "512 KB" }, { key: "b", label: "8 MB" }], seconds: 20, time_left: 17, my_answer: null, my_points: null, correct_key: null } });
    const { container } = play();
    await step();
    expect(screen.getByText("RAM on an ESP32-S3?")).toBeInTheDocument();
    expect(liveApi.fetchTheme).not.toHaveBeenCalled();
    expect(container.querySelector(".live-page").className).toBe("live-page dc-scope");
    expect(screen.getByRole("button", { name: /512 KB/ }).className).toBe("play-answer");
    expect(screen.getByRole("button", { name: /512 KB/ }).querySelector(".play-mark").textContent).toBe("A");
    expect(container.querySelector(".play-timebar")).not.toBeNull();
  });
});
