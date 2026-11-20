import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthContext } from "@/auth/context";

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
    fetchTheme: vi.fn(),
  },
}));

const { liveApi } = await import("@/api/live");
const Live = (await import("./live.jsx")).default;

/**
 * The room against this release's API: the theme the feed carries (and
 * keeps for the quiz page), the quiz door with the round's player rules,
 * and the refusals a join can meet. Invented guests throughout.
 */
const theme = {
  custom: true,
  version: "v7",
  theme: {
    preset: "meridian_light",
    colors: { background: "#F4F5F2", accent: "#0C7A66", answers: ["#DC2626", "#2563EB", "#D97706", "#16A34A", "#7C3AED", "#0891B2"] },
    text: { on_background: "#111827", on_accent: "#FFFFFF", on_answers: ["#FFFFFF", "#FFFFFF", "#111827", "#FFFFFF", "#FFFFFF", "#FFFFFF"] },
    font: { display: "dm_sans", body: "dm_sans" },
    answers: { style: "shapes" },
    timer: "bar",
    leaderboard: { size: 5, podium: true, animate: true, own_rank: true },
    logo: { id: "m1", thumbnail: "https://media.myotherapp.in/t.png", medium: "https://media.myotherapp.in/m.png", large: "https://media.myotherapp.in/l.png", width: 300, height: 100 },
    background: { kind: "color", gradient: null, image: null, dim: 0.45 },
    guest: { text_scale: 1.2, logo: true, background: "plain", answer_layout: "column" },
  },
};

const feed = (over = {}) => ({
  event: { id: 68, name: "Hack Night 04", status: "live" },
  banner: null,
  updates: [],
  poll: null,
  questions: [],
  qa: { approve_first: true, open: false },
  quiz: { live: true, title: "Round 1" },
  ...over,
});

const room = (auth = null) =>
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={["/events/hack-night-04/live"]}>
        <Routes>
          <Route path="/events/:slug/live" element={<Live eventId="68" eventSlug="hack-night-04" eventName="Hack Night 04" />} />
          <Route path="/play/:eventId" element={<p>play page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("the room's theme", () => {
  it("draws the room in the theme the feed carries, with the organiser's logo, and keeps it for the quiz", async () => {
    liveApi.fetchFeed.mockResolvedValue(feed({ theme }));
    const { container } = room();
    expect(await screen.findByText("Round 1")).toBeInTheDocument();
    const page = container.querySelector(".live-page");
    expect(page.className.split(" ")).toEqual(expect.arrayContaining(["live-page", "dc-scope", "lt-on", "lt-plain", "lt-display-sans"]));
    expect(page.style.getPropertyValue("--lt-accent")).toBe("#0C7A66");
    expect(page.style.getPropertyValue("--lt-scale")).toBe("1.2");
    // The phone keeps its own background: no backdrop.
    expect(container.querySelector(".lt-backdrop")).toBeNull();
    expect(container.querySelector(".live-top img.lt-logo").getAttribute("src")).toBe("https://media.myotherapp.in/m.png");
    expect(JSON.parse(sessionStorage.getItem("moa.live.theme.68"))).toMatchObject({ custom: true, version: "v7" });
  });

  it("looks exactly as before when the organiser never saved a theme", async () => {
    liveApi.fetchFeed.mockResolvedValue(feed({ theme: { custom: false, theme: theme.theme, version: "d0" } }));
    const { container } = room();
    expect(await screen.findByText("Round 1")).toBeInTheDocument();
    expect(container.querySelector(".live-page").className).toBe("live-page dc-scope");
    expect(container.querySelector(".lt-logo")).toBeNull();
    // Kept too, so the quiz page knows there is none and asks for nothing.
    expect(JSON.parse(sessionStorage.getItem("moa.live.theme.68"))).toMatchObject({ custom: false, version: "d0" });
  });

  it("looks exactly as before on an API from before themes, and keeps nothing", async () => {
    liveApi.fetchFeed.mockResolvedValue(feed());
    const { container } = room();
    expect(await screen.findByText("Round 1")).toBeInTheDocument();
    expect(container.querySelector(".live-page").className).toBe("live-page dc-scope");
    expect(sessionStorage.getItem("moa.live.theme.68")).toBeNull();
  });

  it("hides the logo when the theme keeps it off phones", async () => {
    liveApi.fetchFeed.mockResolvedValue(feed({ theme: { ...theme, theme: { ...theme.theme, guest: { ...theme.theme.guest, logo: false } } } }));
    const { container } = room();
    expect(await screen.findByText("Round 1")).toBeInTheDocument();
    expect(container.querySelector(".lt-logo")).toBeNull();
  });

  it("calls a closed poll's chip its results", async () => {
    liveApi.fetchFeed.mockResolvedValue(feed({ poll: { id: "p1", kind: "choice", prompt: "Tea or coffee?", options: ["Tea", "Coffee"], status: "closed", sort_order: 0, results: { responses: 2, choices: [{ label: "Tea", count: 1, pct: 50 }, { label: "Coffee", count: 1, pct: 50 }] }, my_response: null, settings: {} } }));
    room();
    expect(await screen.findByRole("link", { name: "Poll results" })).toHaveAttribute("href", "#live-poll");
  });
});

describe("joining a round", () => {
  const fill = async () => {
    fireEvent.change(await screen.findByLabelText("Join code"), { target: { value: "483921" } });
  };

  it("offers the round's teams to pick from, and joins with the one picked", async () => {
    liveApi.fetchFeed.mockResolvedValue(feed({ quiz: { live: true, title: "Round 1", teams: { mode: "pick", list: [{ key: "red", name: "Red Rockets", color: "#E11D48" }, { key: "blue", name: "Blue Whales", color: "#2563EB" }] } } }));
    liveApi.joinQuiz.mockResolvedValue({ event_id: 68, quiz_id: "qz1", title: "Round 1", player_id: "pl1", player_key: "pk1", name: "Sneha", team: { key: "blue", name: "Blue Whales", color: "#2563EB" }, tag: "7F2" });
    room();
    await fill();
    fireEvent.change(screen.getByLabelText("Your name for the quiz"), { target: { value: "Sneha" } });
    const group = screen.getByRole("group", { name: "Pick your team" });
    fireEvent.click(within(group).getByRole("radio", { name: "Blue Whales" }));
    fireEvent.click(screen.getByRole("button", { name: "Join the quiz" }));
    await waitFor(() => expect(liveApi.joinQuiz).toHaveBeenCalledWith("483921", "Sneha", "blue"));
    expect(await screen.findByText("play page")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("moa.live.player.68")).team.key).toBe("blue");
  });

  it("asks for no nickname in a round played under registered names", async () => {
    liveApi.fetchFeed.mockResolvedValue(feed({ quiz: { live: true, title: "Round 1", names: "registered" } }));
    liveApi.joinQuiz.mockResolvedValue({ event_id: 68, quiz_id: "qz1", title: "Round 1", player_id: "pl1", player_key: "pk1", name: "Sneha Joseph" });
    room();
    await fill();
    expect(screen.queryByLabelText("Your name for the quiz")).toBeNull();
    expect(screen.getByText(/You play under the name you registered with/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Join the quiz" }));
    await waitFor(() => expect(liveApi.joinQuiz).toHaveBeenCalledWith("483921", "Guest"));
  });

  it("offers to sign in when the round is for registered guests and the visitor is signed out", async () => {
    const openSignIn = vi.fn();
    liveApi.fetchFeed.mockResolvedValue(feed());
    liveApi.joinQuiz.mockRejectedValue({ response: { status: 403, data: { message: "This quiz is for registered guests: sign in with the account you registered with.", error_code: "QUIZ_REGISTERED_ONLY" } } });
    room({ enabled: true, user: null, openSignIn });
    await fill();
    fireEvent.change(screen.getByLabelText("Your name for the quiz"), { target: { value: "Sneha" } });
    fireEvent.click(screen.getByRole("button", { name: "Join the quiz" }));
    expect(await screen.findByText(/This quiz is for registered guests/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(openSignIn).toHaveBeenCalled();
  });

  it.each([
    ["QUIZ_NAME_REFUSED", 422, "Pick another name."],
    ["QUIZ_LATE", 409, "This quiz has started; new players can't join now."],
    ["QUIZ_TICKET_IN_USE", 409, "Your ticket is already playing on another device."],
  ])("says %s in the API's words and keeps the form", async (code, status, message) => {
    liveApi.fetchFeed.mockResolvedValue(feed());
    liveApi.joinQuiz.mockRejectedValue({ response: { status, data: { message, error_code: code } } });
    room();
    await fill();
    fireEvent.change(screen.getByLabelText("Your name for the quiz"), { target: { value: "Sneha" } });
    fireEvent.click(screen.getByRole("button", { name: "Join the quiz" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText("Join code")).toHaveValue("483921");
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });
});
