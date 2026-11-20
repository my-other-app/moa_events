import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/api/live", () => ({
  errorLine: (e, f) => e?.response?.data?.message || f,
  liveApi: { respond: vi.fn() },
}));

const { liveApi } = await import("@/api/live");
const PollCard = (await import("./poll.jsx")).default;

/**
 * The poll card against this release's API (CONTRACT.md 7): the new kinds
 * and every display setting. The poll bodies are the v2 PollOut the feed
 * carries, with invented answers.
 */
const settings = (over = {}) => ({ max_choices: 1, scale: 5, style: "stars", results: "live", show: "both", chart: "bar", hide_results: false, anonymous: true, change_vote: true, seconds: null, moderate: true, option_images: [], ...over });

const choice = (over = {}, st = {}) => ({
  id: "p1",
  kind: "choice",
  prompt: "What do we drink at the break?",
  options: ["Tea", "Coffee", "Juice"],
  status: "live",
  launched_at: "2026-11-29T10:00:00Z",
  closed_at: null,
  sort_order: 0,
  results: { responses: 41, choices: [{ label: "Tea", count: 30, pct: 73 }, { label: "Coffee", count: 8, pct: 20 }, { label: "Juice", count: 3, pct: 7 }] },
  my_response: null,
  settings: settings(st),
  closes_at: null,
  option_images: [],
  results_hidden: false,
  my_values: null,
  ...over,
});

const card = (poll) => {
  const onChange = vi.fn();
  const view = render(<PollCard eventId="68" poll={poll} onChange={onChange} />);
  return { ...view, onChange };
};

beforeEach(() => vi.clearAllMocks());

describe("multiple choice, at most N", () => {
  it("toggles up to the limit and sends the picks together", async () => {
    const poll = choice({}, { max_choices: 2 });
    liveApi.respond.mockResolvedValue({ ...poll, my_response: "0,2", my_values: ["Tea", "Juice"] });
    const { onChange } = card(poll);
    expect(screen.getByText("Pick up to 2.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tea/ }));
    fireEvent.click(screen.getByRole("button", { name: /Juice/ }));
    // The limit reached: the third cannot be picked.
    expect(screen.getByRole("button", { name: /Coffee/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Send 2 picks" }));
    await waitFor(() => expect(liveApi.respond).toHaveBeenCalledWith("68", "p1", { values: ["Tea", "Juice"] }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ my_values: ["Tea", "Juice"] }));
  });

  it("says what was picked, and offers to change it while votes may change", () => {
    card(choice({ my_response: "0,2", my_values: ["Tea", "Juice"] }, { max_choices: 2 }));
    expect(screen.getByText(/You picked/).textContent).toBe("You picked Tea and Juice. Change them and send again.");
    expect(screen.getByRole("button", { name: /Tea/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /Send/ })).toBeNull();
  });
});

describe("results", () => {
  it("shows no results to guests while hidden, and says when they show", () => {
    card(choice({ results: { responses: 41 }, results_hidden: true }, { results: "closed" }));
    expect(screen.getByText("The results show when the poll closes.")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/votes/)).toBeNull();
    // The options are still there to vote on.
    expect(screen.getByRole("button", { name: "Tea" })).toBeEnabled();
    expect(screen.getByText("41 answers so far")).toBeInTheDocument();
  });

  it("says the results are on the big screen when the organiser hides them from guests", () => {
    card(choice({ results: { responses: 41 }, results_hidden: true }, { hide_results: true }));
    expect(screen.getByText("The results show on the screen at the front.")).toBeInTheDocument();
  });

  it("shows only the percentages, or only the counts", () => {
    const first = card(choice({}, { show: "percent" }));
    expect(screen.getByText("73%")).toBeInTheDocument();
    expect(screen.queryByText("30 votes")).toBeNull();
    first.unmount();
    card(choice({}, { show: "count" }));
    expect(screen.getByText("30 votes")).toBeInTheDocument();
    expect(screen.queryByText("73%")).toBeNull();
  });

  it("draws a donut with a legend that says each share in words", () => {
    const { container } = card(choice({}, { chart: "donut" }));
    expect(container.querySelectorAll(".lt-donut circle")).toHaveLength(4);
    const legend = within(screen.getByRole("list", { name: "Results" })).getAllByRole("listitem");
    expect(legend.map((li) => li.textContent)).toEqual(["Tea73% · 30 votes", "Coffee20% · 8 votes", "Juice7% · 3 votes"]);
    // The buttons carry no bars of their own then.
    expect(container.querySelector(".live-fill")).toBeNull();
  });

  it("draws columns", () => {
    const { container } = card(choice({}, { chart: "column", show: "count" }));
    const cols = within(screen.getByRole("list", { name: "Results" })).getAllByRole("listitem");
    expect(cols.map((li) => li.textContent)).toEqual(["30 votesTea", "8 votesCoffee", "3 votesJuice"]);
    expect(container.querySelector(".lt-col-bar").style.transform).toBe("scaleY(1)");
  });

  it("draws a word poll as bars when the organiser chose bars over the cloud", () => {
    card({ ...choice({}, { chart: "bar" }), kind: "words", options: [], results: { responses: 13, words: [{ word: "Rust", count: 9 }, { word: "Go", count: 4 }] } });
    expect(screen.queryByLabelText("What the room said")).toBeNull();
    const rows = within(screen.getByRole("list", { name: "Results" })).getAllByRole("listitem");
    expect(rows.map((li) => li.textContent)).toEqual(["Rust69% · 9 times", "Go31% · 4 times"]);
  });

  it("shows a closed poll's results, with nothing left to answer", () => {
    card(choice({ status: "closed", closed_at: "2026-11-29T10:05:00Z", my_response: "Tea" }));
    expect(screen.getByText("Poll closed")).toBeInTheDocument();
    expect(screen.getByText("73%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tea/ })).toBeDisabled();
    expect(screen.getByText(/You voted for/).textContent).toBe("You voted for Tea.");
  });
});

describe("voting", () => {
  it("locks a poll that takes one answer once it is in", () => {
    card(choice({ my_response: "Coffee" }, { change_vote: false }));
    expect(screen.getByRole("button", { name: /Tea/ })).toBeDisabled();
    expect(screen.getByText(/You voted for/).textContent).toBe("You voted for Coffee.");
  });

  it("says the API's refusal of a second answer", async () => {
    liveApi.respond.mockRejectedValue({ response: { status: 409, data: { message: "You already answered this poll.", error_code: "POLL_ANSWERED" } } });
    card(choice());
    fireEvent.click(screen.getByRole("button", { name: /Coffee/ }));
    expect(await screen.findByText("You already answered this poll.")).toBeInTheDocument();
  });

  describe("on a timer", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-29T10:00:00Z"));
    });
    afterEach(() => vi.useRealTimers());

    it("counts down and stops taking answers when the time is up", async () => {
      card(choice({ closes_at: "2026-11-29T10:01:05Z" }, { seconds: 65 }));
      expect(screen.getByText(/closes in 1:05/)).toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(screen.getByText(/closes in 1:00/)).toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(60000));
      expect(screen.getByText(/time is up/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Tea/ })).toBeDisabled();
    });
  });

  it("puts each option's picture beside it, the label still saying what it is", () => {
    const { container } = card(choice({ option_images: [null, { thumbnail: "https://media.myotherapp.in/c240.jpg", medium: "https://media.myotherapp.in/c960.jpg", large: "https://media.myotherapp.in/c1920.jpg" }, null] }));
    const imgs = container.querySelectorAll("img.lt-option-img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toBe("https://media.myotherapp.in/c960.jpg");
    expect(imgs[0].getAttribute("alt")).toBe("");
    expect(screen.getByRole("button", { name: /Coffee/ })).toContainElement(imgs[0]);
  });
});

describe("ratings", () => {
  const rating = (st, over = {}) => ({ ...choice({}, st), kind: "rating", options: [], results: { responses: 20, rating: { average: 7.4, histogram: [] }, scale: st.scale }, ...over });

  it("rates from 1 to 10 on numbers", async () => {
    liveApi.respond.mockResolvedValue(rating({ scale: 10, style: "numbers" }, { my_response: "8" }));
    card(rating({ scale: 10, style: "numbers" }));
    const group = screen.getByRole("group", { name: "Rate from 1 to 10" });
    expect(within(group).getAllByRole("button")).toHaveLength(10);
    expect(screen.getByText("Room average 7.4 of 10")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "8 of 10" }));
    await waitFor(() => expect(liveApi.respond).toHaveBeenCalledWith("68", "p1", "8"));
  });

  it("marks the one number picked", () => {
    card(rating({ scale: 5, style: "numbers" }, { my_response: "4" }));
    const buttons = within(screen.getByRole("group", { name: "Rate from 1 to 5" })).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "true", "false"]);
  });
});

describe("ranking", () => {
  const ranking = (over = {}) => ({ ...choice(), kind: "ranking", results: { responses: 0, ranking: [] }, ...over });

  it("puts the options in order and sends the order", async () => {
    liveApi.respond.mockResolvedValue(ranking({ my_response: "2,0,1", my_values: ["Juice", "Tea", "Coffee"] }));
    card(ranking());
    fireEvent.click(screen.getByRole("button", { name: "Move Juice up" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Juice up" }));
    fireEvent.click(screen.getByRole("button", { name: "Send my order" }));
    await waitFor(() => expect(liveApi.respond).toHaveBeenCalledWith("68", "p1", { order: ["Juice", "Tea", "Coffee"] }));
  });

  it("starts from the player's own order, and shows the room's", () => {
    card(ranking({ my_response: "2,0,1", my_values: ["Juice", "Tea", "Coffee"], results: { responses: 12, ranking: [{ label: "Tea", average: 1.4, points: 20, first: 8 }, { label: "Juice", average: 2.1, points: 10, first: 3 }, { label: "Coffee", average: 2.5, points: 6, first: 1 }] } }));
    const mine = within(screen.getByRole("list", { name: "Your ranking" })).getAllByRole("listitem");
    expect(mine.map((li) => li.querySelector(".lt-order-label").textContent)).toEqual(["Juice", "Tea", "Coffee"]);
    expect(screen.getByText("Your order is in. Move them and send again to change it.")).toBeInTheDocument();
    const room = screen.getByRole("heading", { name: "The room’s order" }).nextElementSibling;
    expect(within(room).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Teaaverage place 1.4", "Juiceaverage place 2.1", "Coffeeaverage place 2.5"]);
  });
});

describe("open text", () => {
  const text = (st = {}, over = {}) => ({ ...choice({}, st), kind: "text", options: [], results: { responses: 3, texts: [{ id: "t1", text: "More chai at the break", name: null, at: "2026-11-29T10:02:00Z" }] }, ...over });

  it("sends a line, and says it shows once the host lets it through", async () => {
    liveApi.respond.mockResolvedValue(text({}, { my_response: "Longer demos" }));
    card(text());
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: " Longer demos " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(liveApi.respond).toHaveBeenCalledWith("68", "p1", "Longer demos"));
    expect(await screen.findByText(/Sent — it shows once the host lets it through./)).toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toHaveValue("");
    // What the room said: only what the host let through.
    expect(within(screen.getByRole("list", { name: "What the room said" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["More chai at the break"]);
  });

  it("asks for a name only on a poll that shows names, and sends it with the line", async () => {
    liveApi.respond.mockResolvedValue(text({ anonymous: false }));
    const first = card(text());
    expect(screen.queryByLabelText("Your name")).toBeNull();
    first.unmount();
    card(text({ anonymous: false, moderate: false }, { results: { responses: 1, texts: [{ id: "t1", text: "Great talk", name: "Asha", at: "2026-11-29T10:02:00Z" }] } }));
    expect(screen.getByText("Asha")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "Loved it" } });
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Kiran" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(liveApi.respond).toHaveBeenCalledWith("68", "p1", { value: "Loved it", name: "Kiran" }));
  });
});

describe("a poll kind this page does not know", () => {
  it("asks for a reload", () => {
    card({ ...choice(), kind: "sliders" });
    expect(screen.getByText("This kind of poll needs a newer version of this page.")).toBeInTheDocument();
  });
});
