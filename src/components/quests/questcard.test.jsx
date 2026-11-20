import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { overviewCard, questCard } from "@/test/questFixture";

/*
 * The quest card where guests see it: under the ticket (TicketQuests) and
 * on the event's page (EventQuests), with the API mocked: what shows for
 * each state, entering a code (counted, wrong, locked), picking a size, the
 * leaderboard, and reading the card again when the guest comes back to it.
 */
vi.mock("@/api/quests", () => ({ questsApi: { card: vi.fn(), code: vi.fn(), size: vi.fn(), leaderboard: vi.fn() } }));

const { questsApi } = await import("@/api/quests");
const { parseQuestCard, parseClaim } = await import("@/utils/quests");
const { AuthContext } = await import("@/auth/context");
const { TicketQuests, EventQuests, REVISIT_MS } = await import("./questcard.jsx");

const NOW = new Date("2026-11-28T05:00:00Z"); // 10:30 AM IST, the quest on
const EVENT = { id: 77, slug: "campus-devdays", name: "Campus DevDays" };
const failure = (status, code, errors = null, extra = {}) => ({ __apiFailure: true, status, code, errors, message: null, network: false, authExpired: false, retryAfter: null, ...extra });
const SIGNED_IN = { enabled: true, ready: true, status: "signed-in", user: { email: "meera@example.org" } };

const onTicket = (props = {}) =>
  render(
    <MemoryRouter>
      <TicketQuests ticketId="MOA-DEMO-7Q2K" event={EVENT} {...props} />
    </MemoryRouter>,
  );
const onEvent = (props = {}, auth = null) => {
  const page = (
    <MemoryRouter>
      <EventQuests event={{ id: 77, slug: "campus-devdays", status: "live" }} clubSlug="riverside-dev-circle" canRegister {...props} />
    </MemoryRouter>
  );
  return render(auth ? <AuthContext.Provider value={auth}>{page}</AuthContext.Provider> : page);
};
const card = () => screen.findByRole("region", { name: "DevDays Quest" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  questsApi.card.mockReset();
  questsApi.code.mockReset();
  questsApi.size.mockReset();
  questsApi.leaderboard.mockReset();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("under the ticket", () => {
  it("shows the holder's quest: score, progress, what to collect, tasks and rewards", async () => {
    questsApi.card.mockResolvedValue(parseQuestCard(questCard()));
    onTicket();
    const box = await card();
    expect(questsApi.card).toHaveBeenCalledWith("77");
    expect(box).toHaveAttribute("id", "quests");
    expect(within(box).getByText("10", { selector: ".qs-score strong" })).toBeInTheDocument();
    expect(within(box).getByText("#14")).toBeInTheDocument();
    expect(within(box).getByRole("progressbar")).toHaveAttribute("aria-valuetext", "10 points of 30");
    expect(within(box).getByText("20 more points to unlock Tier 2: DevDays T-shirt.")).toBeInTheDocument();
    expect(within(box).getByText("You've unlocked Sticker pack: collect it at Swag desk.")).toBeInTheDocument();

    const tasks = within(box).getByRole("list", { name: "Tasks" });
    const rows = within(tasks).getAllByRole("listitem");
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent("Done: Check in");
    expect(rows[0]).toHaveTextContent("Required");
    expect(rows[1]).toHaveTextContent("To do: Meet 5 people");
    expect(rows[1]).toHaveTextContent("2 of 5 people");
    expect(within(rows[1]).getByRole("link", { name: "Open the app to scan" })).toHaveAttribute("href", "/network?event=77&scan=1");
    expect(within(rows[4]).getByRole("link", { name: "Open the live room" })).toHaveAttribute("href", "/events/campus-devdays/live");
    expect(rows[1]).toHaveTextContent("+10 points");

    const rewards = within(box).getByRole("list", { name: "Rewards" });
    expect(within(rewards).getByText("Sticker pack").closest("li")).toHaveTextContent("Unlocked");
    expect(within(rewards).getByText("DevDays T-shirt").closest("li")).toHaveTextContent("Locked");
    expect(within(rewards).getByText("20 points to go")).toBeInTheDocument();

    expect(within(box).getByLabelText("Enter a code")).toBeEnabled();
    expect(within(box).getByRole("button", { name: "Leaderboard" })).toBeInTheDocument();
  });

  it("a link to #quests lands on the card once it's there", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    window.location.hash = "#quests";
    questsApi.card.mockResolvedValue(parseQuestCard(questCard()));
    onTicket();
    await card();
    expect(scroll).toHaveBeenCalledWith({ block: "start" });
    window.location.hash = "";
    delete Element.prototype.scrollIntoView;
  });

  it("shows nothing for a quest that's off, a card that isn't the holder's, or a ticket that doesn't count", async () => {
    questsApi.card.mockResolvedValue(null);
    const { container, unmount } = onTicket();
    await waitFor(() => expect(questsApi.card).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();

    questsApi.card.mockResolvedValue(parseQuestCard(overviewCard()));
    const second = onTicket();
    await waitFor(() => expect(questsApi.card).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
    second.unmount();

    onTicket({ skip: true });
    expect(questsApi.card).toHaveBeenCalledTimes(2);
  });

  it("keeps the card when a read fails", async () => {
    questsApi.card.mockRejectedValue(failure(502, null));
    const { container } = onTicket();
    await waitFor(() => expect(questsApi.card).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("entering a code", () => {
  const type = async (box, code) => {
    fireEvent.change(within(box).getByLabelText("Enter a code"), { target: { value: code } });
    fireEvent.click(within(box).getByRole("button", { name: "Check" }));
  };

  it("a code that counts ticks its task, from the card the answer carries", async () => {
    questsApi.card.mockResolvedValue(parseQuestCard(questCard()));
    const after = questCard();
    after.tasks[3].me = { count: 1, done: true, done_at: "2026-11-28T05:00:00Z", source: "code" };
    after.me.points = 15;
    questsApi.code.mockResolvedValue({ result: "DONE", task: { title: "Keynote secret word", points: 5 }, card: parseQuestCard(after) });
    onTicket();
    const box = await card();
    await type(box, "cloud 24");
    expect(await within(box).findByText("Done: Keynote secret word (+5 points).")).toBeInTheDocument();
    expect(questsApi.code).toHaveBeenCalledWith("77", "cloud 24");
    expect(within(box).getByText("15", { selector: ".qs-score strong" })).toBeInTheDocument();
    // Every code task done: the box stays, with what it said.
    expect(within(box).getByLabelText("Enter a code")).toHaveValue("");
    expect(within(box).getByText("Done: Keynote secret word (+5 points).")).toBeInTheDocument();
  });

  it("a wrong one says how many tries are left", async () => {
    questsApi.card.mockResolvedValue(parseQuestCard(questCard()));
    questsApi.code.mockRejectedValue(failure(404, "QUEST_CODE_WRONG", { left: 4 }));
    onTicket();
    const box = await card();
    await type(box, "nope");
    expect(await within(box).findByText("That isn't one of this quest's codes. 4 tries left this hour.")).toBeInTheDocument();
    expect(within(box).getByLabelText("Enter a code")).toHaveValue("nope");
  });

  it("too many wrong codes lock the box until the wait is over, then the card is read again", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    vi.setSystemTime(NOW);
    questsApi.card.mockResolvedValue(parseQuestCard(questCard()));
    questsApi.code.mockRejectedValue(failure(429, "QUEST_CODE_LOCKED", { retry_after: 120 }));
    onTicket();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const box = screen.getByRole("region", { name: "DevDays Quest" });
    await act(async () => {
      fireEvent.change(within(box).getByLabelText("Enter a code"), { target: { value: "guess" } });
      fireEvent.click(within(box).getByRole("button", { name: "Check" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(within(box).getByLabelText("Enter a code")).toBeDisabled();
    expect(box).toHaveTextContent("Too many wrong codes. Try again in 2 minutes.");
    expect(questsApi.card).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(121 * 1000);
    });
    expect(questsApi.card).toHaveBeenCalledTimes(2);
    expect(within(box).getByLabelText("Enter a code")).toBeEnabled();
  });
});

describe("picking a size", () => {
  const sized = () => {
    const c = questCard();
    c.milestones[1].rewards = [{ reward_id: "r-mug", name: "Mug", photo_url: null, sizes: false, sold_out: false, claim: null }];
    c.milestones[0].rewards[0] = {
      reward_id: "r-tee",
      name: "DevDays T-shirt",
      photo_url: null,
      sizes: true,
      sold_out: false,
      claim: { claim_id: "c-9", status: "reserved", needs_size: true, variant_label: null, choices: [{ label: "S", free: 3 }, { label: "M", free: 1 }, { label: "L", free: 0 }], waitlist_position: null, collected_at: null },
    };
    return c;
  };

  it("keeps the size picked, and says so", async () => {
    questsApi.card.mockResolvedValue(parseQuestCard(sized()));
    questsApi.size.mockResolvedValue(parseClaim({ claim_id: "c-9", status: "reserved", needs_size: false, variant_label: "M", choices: [{ label: "S", free: 3 }] }));
    onTicket();
    const box = await card();
    const group = within(box).getByRole("group", { name: "Pick your size for the DevDays T-shirt" });
    expect(within(group).getByRole("button", { name: "L, none left" })).toBeDisabled();
    fireEvent.click(within(group).getByRole("button", { name: "M" }));
    expect(await within(box).findByText("Size M kept for you.")).toBeInTheDocument();
    expect(questsApi.size).toHaveBeenCalledWith("77", "c-9", "M");
    expect(within(box).getByRole("button", { name: "M" })).toHaveAttribute("aria-pressed", "true");
    expect(within(box).getByText("DevDays T-shirt").closest("p")).toHaveTextContent("DevDays T-shirt · size M");
  });

  it("a size that just ran out: says so, and shows what's left", async () => {
    questsApi.card.mockResolvedValue(parseQuestCard(sized()));
    questsApi.size.mockRejectedValue(failure(409, "QUEST_SIZE_GONE", { choices: [{ label: "S", free: 3 }] }));
    onTicket();
    const box = await card();
    fireEvent.click(within(box).getByRole("button", { name: "M" }));
    expect(await within(box).findByText("That size just ran out. Pick another.")).toBeInTheDocument();
    expect(within(box).queryByRole("button", { name: "M" })).toBeNull();
    expect(within(box).getByRole("button", { name: "S" })).toBeEnabled();
  });
});

describe("the leaderboard", () => {
  it("is read for the event when opened", async () => {
    questsApi.card.mockResolvedValue(parseQuestCard(questCard()));
    questsApi.leaderboard.mockResolvedValue({ rows: [{ rank: 1, name: "Rohan K.", points: 31, me: false }], me: { rank: 14, points: 10 } });
    onTicket();
    const box = await card();
    fireEvent.click(within(box).getByRole("button", { name: "Leaderboard" }));
    expect(await within(box).findByText("Rohan K.")).toBeInTheDocument();
    expect(questsApi.leaderboard).toHaveBeenCalledWith("77");
  });

  it("isn't offered where the organisers left it off", async () => {
    questsApi.card.mockResolvedValue(parseQuestCard(questCard({ leaderboard: false })));
    onTicket();
    const box = await card();
    expect(within(box).queryByRole("button", { name: "Leaderboard" })).toBeNull();
    expect(within(box).queryByText("#14")).toBeNull();
  });
});

describe("reading it again", () => {
  it("on coming back to the tab, and says what was just done", async () => {
    questsApi.card.mockResolvedValueOnce(parseQuestCard(questCard()));
    const after = questCard();
    after.tasks[2].me = { count: 1, done: true, done_at: "2026-11-28T05:01:00Z", source: "station" };
    questsApi.card.mockResolvedValueOnce(parseQuestCard(after));
    onTicket();
    const box = await card();
    // Too soon: not read again.
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(questsApi.card).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(NOW.getTime() + REVISIT_MS + 1000));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(questsApi.card).toHaveBeenCalledTimes(2));
    expect(await within(box).findByText("Done: Visit the Cloud booth.")).toBeInTheDocument();
    const row = within(box).getByText("Visit the Cloud booth").closest("li");
    expect(row).toHaveTextContent("Done: Visit the Cloud booth");
    expect(row.querySelector(".qs-tick")).toHaveClass("is-new");
  });
});

describe("on the event's page", () => {
  it("a visitor sees what the quest is and how to take part, the lists folded", async () => {
    questsApi.card.mockResolvedValue(parseQuestCard(overviewCard()));
    onEvent();
    const box = await card();
    expect(box).toHaveTextContent("Register to take part. Already have a ticket? Sign in, or open your ticket from its email, to see your progress.");
    expect(within(box).getByText("See the 7 tasks and the rewards")).toBeInTheDocument();
    expect(within(box).queryByRole("progressbar")).toBeNull();
    expect(within(box).queryByLabelText("Enter a code")).toBeNull();
    expect(within(box).queryAllByRole("link", { name: /Open/ })).toHaveLength(0);
  });

  it("a guest with a ticket sees their own, with My tickets for the check-in", async () => {
    const c = questCard();
    c.tasks[0].me = { count: 0, done: false };
    questsApi.card.mockResolvedValue(parseQuestCard(c));
    onEvent({}, SIGNED_IN);
    const box = await card();
    expect(within(box).getByRole("progressbar")).toBeInTheDocument();
    expect(within(box).getByRole("link", { name: "My tickets" })).toHaveAttribute("href", "/me/tickets");
  });

  it("asks nothing for a called-off event, or an ended one nobody here could have taken part in", async () => {
    questsApi.card.mockResolvedValue(parseQuestCard(questCard()));
    const { unmount } = onEvent({ event: { id: 77, slug: "x", status: "cancelled" } });
    unmount();
    const second = onEvent({ event: { id: 77, slug: "x", status: "ended" } });
    second.unmount();
    expect(questsApi.card).not.toHaveBeenCalled();
    // Holding a registration's guest token, the ended quest's card is read (what's left to collect).
    localStorage.setItem("access_token", "guest-a");
    onEvent({ event: { id: 77, slug: "x", status: "ended" } });
    await waitFor(() => expect(questsApi.card).toHaveBeenCalledTimes(1));
  });

  it("shows nothing for an event without a quest", async () => {
    questsApi.card.mockResolvedValue(null);
    const { container } = onEvent();
    await waitFor(() => expect(questsApi.card).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
