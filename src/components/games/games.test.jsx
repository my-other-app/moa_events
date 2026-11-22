import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { parseCollect, parseDeck, parseHunt, parseNames, parseScreen } from "@/utils/games";

/*
 * The games add-on in the browser, with the API handed in: the badge landing's PIN states,
 * the reveal per tier, the deck and collect results, the hunt's states, the venue screen
 * (podium, list, stream and poll), the entry points, and the app's #gs= hand-off.
 */
const { BadgeLanding } = await import("./badge.jsx");
const { Reveal, Deck, CardsGame, MyCode } = await import("./cards.jsx");
const { HuntView, HuntGame } = await import("./hunt.jsx");
const { ScreenView, BoardView, useScreen } = await import("./screen.jsx");
const { default: PlayEntry } = await import("./entry.jsx");
const { default: HeroCard } = await import("./herocard.jsx");
const { takeFragmentSession, readSession, saveSession } = await import("./store.js");
const { useGameAccess } = await import("./access.jsx");

const NAMES = parseNames({ event: { id: 77, name: "DevFest", slug: "devfest" }, cards: { on: true, name: "Hero Cards" }, hunt: { on: true, name: "Treasure Run" }, theme: "neon_arcade", needs_pin: true });
const fail = (status, code, data = {}) => ({ __apiFailure: true, status, code, data, message: null, network: false });
const Where = () => <p data-testid="at">{useLocation().pathname + useLocation().search}</p>;
const wrap = (ui) => render(<MemoryRouter>{ui}<Where /></MemoryRouter>);
const hero = (n, tier, extra = {}) => ({ id: `h${n}`, number: n, name: `Hero ${n}`, tagline: "tag", tier, ...extra });

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe("/g/{token}: badge landing and PIN", () => {
  const TOKEN = "b.77.reg1.0.MACMACMAC";
  const api = (over = {}) => ({ badge: vi.fn().mockResolvedValue(NAMES), pin: vi.fn(), openSession: vi.fn().mockRejectedValue(fail(401)), names: vi.fn(), ...over });
  const pinField = () => screen.findByLabelText("Enter your PIN");

  it("found: shows the event, the games by their names, and the PIN box", async () => {
    wrap(<BadgeLanding token={TOKEN} api={api()} />);
    expect(await pinField()).toBeInTheDocument();
    expect(screen.getByText("DevFest")).toBeInTheDocument();
    expect(screen.getByText("Hero Cards and Treasure Run")).toBeInTheDocument();
  });

  it("a right PIN keeps the session and goes to the hub", async () => {
    const a = api({ pin: vi.fn().mockResolvedValue({ token: "sess-token-123", event: { id: "77" } }) });
    wrap(<BadgeLanding token={TOKEN} api={a} />);
    fireEvent.change(await pinField(), { target: { value: "4821" } });
    fireEvent.click(screen.getByRole("button", { name: "Let me in" }));
    await waitFor(() => expect(screen.getByTestId("at")).toHaveTextContent("/play/devfest"));
    expect(a.pin).toHaveBeenCalledWith(TOKEN, "4821");
    expect(readSession("77").token).toBe("sess-token-123");
  });

  it("wrong PIN: attempts left", async () => {
    wrap(<BadgeLanding token={TOKEN} api={api({ pin: vi.fn().mockRejectedValue(fail(401, "PIN_WRONG", { attempts_left: 2 })) })} />);
    fireEvent.change(await pinField(), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: "Let me in" }));
    expect(await screen.findByText("That PIN isn't right. 2 tries left.")).toBeInTheDocument();
  });

  it("locked: until when", async () => {
    const until = new Date(Date.now() + 9.5 * 60000).toISOString();
    wrap(<BadgeLanding token={TOKEN} api={api({ pin: vi.fn().mockRejectedValue(fail(423, "PIN_LOCKED", { locked_until: until })) })} />);
    fireEvent.change(await pinField(), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: "Let me in" }));
    expect(await screen.findByText(/Try again in 10 minutes/)).toBeInTheDocument();
  });

  it("not checked in", async () => {
    wrap(<BadgeLanding token={TOKEN} api={api({ badge: vi.fn().mockRejectedValue(fail(409, "NOT_CHECKED_IN")) })} />);
    expect(await screen.findByText("Check in at the desk first")).toBeInTheDocument();
    expect(screen.queryByLabelText("Enter your PIN")).toBeNull();
  });

  it("a browser already in goes straight on, with no PIN", async () => {
    saveSession("77", { token: "kept-session-1" });
    const a = api();
    wrap(<BadgeLanding token={TOKEN} api={a} />);
    await waitFor(() => expect(screen.getByTestId("at").textContent).toMatch(/^\/play\/devfest\/cards\?collect=/));
    expect(a.pin).not.toHaveBeenCalled();
  });

  it("a code that is not ours", async () => {
    wrap(<BadgeLanding token="garbagegarbage" api={api()} />);
    expect(await screen.findByText("That code isn't one of ours.")).toBeInTheDocument();
  });
});

describe("the reveal, per tier", () => {
  it.each([
    ["common", "NEW CARD"],
    ["uncommon", "NICE PULL!"],
    ["rare", "RARE PULL!"],
    ["legendary", "LEGENDARY PULL!"],
  ])("%s shows its banner and frame", (tier, banner) => {
    const { container } = render(<Reveal hero={{ ...hero(1, tier), holders: 12 }} gameName="Hero Cards" onAdd={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent(banner);
    expect(container.querySelector(`.gm-reveal--${tier}`)).not.toBeNull();
    expect(container.querySelector(`.hc--${tier}`)).not.toBeNull();
    expect(screen.getByText("About 12 players hold this card.")).toBeInTheDocument();
  });

  it("Add to my deck, and Share", async () => {
    const onAdd = vi.fn();
    const share = vi.fn().mockResolvedValue("Copied. Paste it anywhere.");
    render(<Reveal hero={hero(1, "rare", { name: "Solar Warden" })} gameName="Hero Cards" onAdd={onAdd} share={share} />);
    fireEvent.click(screen.getByRole("button", { name: "Add to my deck" }));
    expect(onAdd).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Share my card" }));
    expect(await screen.findByText("Copied. Paste it anywhere.")).toBeInTheDocument();
    expect(share.mock.calls[0][0].text).toMatch(/Solar Warden \(Rare\)/);
  });

  it("a locked hero card hides who it is", () => {
    render(<HeroCard hero={hero(9, "legendary", { name: "Secret" })} locked />);
    expect(screen.getByRole("img", { name: "Locked Legendary card" })).toBeInTheDocument();
    expect(screen.queryByText("Secret")).toBeNull();
  });
});

describe("my deck", () => {
  const deck = parseDeck({
    total: 4,
    deck_count: 2,
    rank: 14,
    of: 300,
    heroes: [{ ...hero(1, "common"), owned: true }, { ...hero(2, "rare"), owned: true }, { ...hero(3, "uncommon"), owned: false }, { ...hero(4, "legendary"), owned: false }],
  });
  it("shows progress, rank, the missing Legendary, locked cards and a tier filter", () => {
    const onTier = vi.fn();
    const { rerender } = render(<Deck deck={deck} tier="all" onTier={onTier} onScan={() => {}} onCode={() => {}} />);
    expect(screen.getByRole("progressbar", { name: "Deck progress" })).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("Rank #14 of 300")).toBeInTheDocument();
    expect(screen.getByText("You're missing a Legendary card.")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /^Locked/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Rare" }));
    expect(onTier).toHaveBeenCalledWith("rare");
    rerender(<Deck deck={deck} tier="rare" onTier={onTier} onScan={() => {}} onCode={() => {}} />);
    expect(screen.getByRole("button", { name: "Rare" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Hero 1")).toBeNull();
    expect(screen.getByText("Hero 2")).toBeInTheDocument();
  });
  it("a complete deck says so", () => {
    const full = parseDeck({ total: 1, heroes: [hero(1, "common")] });
    render(<Deck deck={full} tier="all" onTier={() => {}} onScan={() => {}} onCode={() => {}} />);
    expect(screen.getByText("Deck complete! You have every hero.")).toBeInTheDocument();
  });
  it("my code shows the QR's PIN and the name opt-out", () => {
    const onPublic = vi.fn();
    render(<MyCode code={{ url: "https://myotherapp.in/g/b.77.r.0.m", pin: "4821" }} isPublic onPublic={onPublic} onClose={() => {}} />);
    expect(screen.getByText("4821")).toBeInTheDocument();
    expect(screen.getByTitle("My game QR code")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Show my name on the boards"));
    expect(onPublic).toHaveBeenCalledWith(false);
  });
});

describe("the card game: collect results", () => {
  const base = () => ({
    me: vi.fn().mockResolvedValue({ name: "Anjali R.", playerNo: 5, public: true, cards: { hero: hero(1, "common"), deck: 1, total: 4, rank: 3, of: 10 }, hunt: {} }),
    deck: vi.fn().mockResolvedValue(parseDeck({ total: 4, deck_count: 1, heroes: [{ ...hero(1, "common"), owned: true }, { ...hero(2, "rare"), owned: false }] })),
    collect: vi.fn(),
    code: vi.fn().mockResolvedValue({ url: "u", pin: "1234" }),
    setPublic: vi.fn().mockResolvedValue(true),
    reveal: vi.fn(),
  });
  const open = async (api, collectToken) => {
    wrap(<CardsGame eventId="77" eventRef="devfest" token="t" names={NAMES} end={() => {}} api={api} collectToken={collectToken} pollMs={1e9} />);
    await screen.findByText("My deck");
  };
  const code = "b.77.other.0.MACMAC";

  it.each([
    ["collected", { you: hero(2, "rare", { name: "Solar Warden" }) }, "You collected Solar Warden!"],
    ["already in the deck", { you: null, result: "ALREADY_IN_DECK" }, "Already in your deck."],
  ])("%s", async (_n, answer, text) => {
    const api = base();
    api.collect.mockResolvedValue(parseCollect(answer));
    await open(api, code);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(api.collect).toHaveBeenCalledWith("77", "t", code);
  });

  it.each([
    ["ALREADY_MET", /already met/],
    ["OWNER_NOT_REVEALED", /haven't unlocked/],
    ["BAD_CODE", /isn't one of ours/],
    ["RATE_LIMITED", /Slow down/],
  ])("refusal %s in plain words", async (c, re) => {
    const api = base();
    api.collect.mockRejectedValue(fail(409, c));
    await open(api, code);
    expect(await screen.findByText(re)).toBeInTheDocument();
  });

  it("scanning your own code from a link is silent; from the camera it says so", async () => {
    const api = base();
    api.collect.mockRejectedValue(fail(409, "SELF_SCAN"));
    await open(api, code);
    await waitFor(() => expect(api.collect).toHaveBeenCalled());
    expect(screen.queryByText(/your own/)).toBeNull();
  });

  it("before a reveal: the button asks the server, then the banner shows", async () => {
    const api = base();
    api.me.mockResolvedValueOnce({ name: "A", playerNo: 1, public: true, cards: { hero: null, deck: 0, total: 4, rank: null, of: 10 }, hunt: {} });
    api.reveal.mockResolvedValue({ ...hero(3, "legendary", { name: "Star Titan" }) });
    wrap(<CardsGame eventId="77" eventRef="devfest" token="t" names={NAMES} end={() => {}} api={api} pollMs={1e9} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reveal my hero" }));
    expect(await screen.findByText("LEGENDARY PULL!")).toBeInTheDocument();
    expect(api.reveal).toHaveBeenCalledWith("77", "t");
  });

  it("an ended session drops it", async () => {
    const api = base();
    api.me.mockRejectedValue(fail(401, null));
    const end = vi.fn();
    wrap(<CardsGame eventId="77" eventRef="devfest" token="t" names={NAMES} end={end} api={api} pollMs={1e9} />);
    await waitFor(() => expect(end).toHaveBeenCalled());
  });
});

describe("the hunt's states", () => {
  const view = (h, extra = {}) => render(<HuntView hunt={parseHunt(h)} onScan={() => {}} onHint={() => {}} hinting={false} pending={0} {...extra} />);

  it("not started", () => {
    view({ status: "scheduled" });
    expect(screen.getByRole("status")).toHaveTextContent("Not started yet");
    expect(screen.queryByRole("button", { name: /Scan a hunt code/ })).toBeNull();
  });
  it("live, ordered: the countdown, points, found, rank and the one clue", () => {
    view({ status: "live", mode: "ordered", ends_at: new Date(Date.now() + 600000).toISOString(), server_now: new Date().toISOString(), points: 90, found: 3, total_points: 8, rank: 2, of: 40, hint_cost: 10, current_clue: { id: 4, clue: "Under the big staircase" }, recent: [{ name: "Ravi K.", label: "the library", points: 50 }] });
    expect(screen.getByRole("timer")).toHaveTextContent(/^(09|10):\d\d$/);
    expect(screen.getByText("90")).toBeInTheDocument();
    expect(screen.getByText("3/8")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("Under the big staircase")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan a hunt code" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Buy a hint \(-10 pts\)/ })).toBeEnabled();
    expect(screen.getByText("Ravi K. found the library")).toBeInTheDocument();
  });
  it("live, free: every clue listed, found ones marked", () => {
    view({ status: "live", mode: "free", clues: [{ id: 1, number: 1, clue: "Near the gate", found: true }, { id: 2, number: 2, clue: "By the stage" }] });
    expect(screen.getByRole("heading", { name: "All clues" })).toBeInTheDocument();
    expect(screen.getByText("1. Near the gate")).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getByText("Found")).toBeInTheDocument();
  });
  it("paused: says so and scanning is off", () => {
    view({ status: "paused", mode: "ordered", current_clue: { id: 1, clue: "x" } });
    expect(screen.getByRole("status")).toHaveTextContent("Hunt paused");
    expect(screen.getByRole("button", { name: "Scan a hunt code" })).toBeDisabled();
  });
  it("ended: the hunt is over, with the final rank", () => {
    view({ status: "ended", rank: 4, of: 40 });
    expect(screen.getByRole("status")).toHaveTextContent("Hunt is over");
    expect(screen.getByText("Rank #4 of 40")).toBeInTheDocument();
  });
  it("shows 'Saved, sending...' while scans wait", () => {
    view({ status: "live" }, { pending: 2 });
    expect(screen.getByText("Saved, sending... (2)")).toBeInTheDocument();
  });

  it("a scan resumed from storage is sent and answered, with the server's points", async () => {
    const storage = { _m: new Map([["moa.game.queue.77", JSON.stringify([{ code: "p.77.1.mac" }])]]), getItem(k) { return this._m.get(k) ?? null; }, setItem(k, v) { this._m.set(k, v); } };
    const api = { hunt: vi.fn().mockResolvedValue(parseHunt({ status: "live", points: 30 })), scan: vi.fn().mockResolvedValue({ points: 30, bonus: 20, total: 30, found: 1, complete: false }), hint: vi.fn() };
    wrap(<HuntGame eventId="77" eventRef="devfest" token="t" names={NAMES} end={() => {}} api={api} pollMs={1e9} storage={storage} />);
    expect(await screen.findByText("Found it! +30 points (incl. +20 early bonus)")).toBeInTheDocument();
    expect(api.scan).toHaveBeenCalledWith("77", "t", "p.77.1.mac");
  });
});

describe("the venue screen", () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ rank: i + 1, name: `P${i + 1}`, score: 100 - i, move: i === 0 ? 2 : i === 1 ? "down" : 0 }));
  const data = (over = {}) => ({
    event: { id: 77, name: "DevFest", slug: "devfest" },
    settings: { theme: "neon_arcade", board_layout: "podium", board_rows: 10, ticker_on: true, join_box_on: true, cards_on: true, cards_name: "Hero Cards", hunt_on: false },
    boards: { cards: { rows: rows(10) }, hunt: { rows: [] } },
    feed: [1, 2, 3].map((i) => ({ id: i, message: `Feed ${i}` })),
    ...over,
  });

  it("podium: top 3 on a podium, 4-10 below, with ▲/▼", () => {
    const { container } = render(<ScreenView screen={parseScreen(data())} />);
    expect(container.querySelectorAll(".gms-pod")).toHaveLength(3);
    expect(container.querySelectorAll('.gms-rows[data-layout="rest"] li')).toHaveLength(7);
    expect(container.querySelector(".gms-up")).toHaveTextContent("▲2");
    expect(container.querySelector(".gms-down")).toHaveTextContent("▼");
    expect(screen.getByRole("list", { name: "Live feed" }).querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByText("Scan to join")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hero Cards" })).toBeInTheDocument();
  });
  it("list: the top rows only, no podium; ticker and join box can be off", () => {
    const s = parseScreen(data({ settings: { ...data().settings, board_layout: "list", board_rows: 5, ticker_on: false, join_box_on: false } }));
    const { container } = render(<ScreenView screen={s} />);
    expect(container.querySelectorAll(".gms-pod")).toHaveLength(0);
    expect(container.querySelectorAll('.gms-rows[data-layout="list"] li')).toHaveLength(5);
    expect(screen.queryByRole("list", { name: "Live feed" })).toBeNull();
    expect(screen.queryByText("Scan to join")).toBeNull();
  });
  it("one board per game that's on, with the hunt timer", () => {
    const s = parseScreen(data({ settings: { ...data().settings, hunt_on: true, hunt_name: "Treasure Run" }, boards: { cards: { rows: rows(3) }, hunt: { rows: rows(3) } }, hunt: { status: "live", ends_at: new Date(Date.now() + 90000).toISOString() } }));
    render(<ScreenView screen={s} />);
    expect(screen.getByRole("heading", { name: "Hero Cards" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Treasure Run" })).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Treasure Run timer" })).toBeInTheDocument();
  });
  it("an empty board says so", () => {
    render(<BoardView title="Hero Cards" rows={[]} layout="podium" limit={10} />);
    expect(screen.getByText("No scores yet")).toBeInTheDocument();
  });

  describe("live updates", () => {
    const fakeSource = () => {
      const handlers = {};
      const src = { addEventListener: (n, f) => (handlers[n] = f), close: vi.fn(), onopen: null, onerror: null, handlers };
      return src;
    };
    const Probe = ({ api, open, gapMs = 0 }) => {
      const { screen: s, live } = useScreen("tok-12345678", { api, open, pollMs: 10000, gapMs });
      return <p data-testid="p">{s ? s.event.name : "none"}|{live ? "live" : "poll"}</p>;
    };

    it("polls every 10 s while no stream is connected, and stops when it connects", async () => {
      vi.useFakeTimers();
      const api = { screen: vi.fn().mockResolvedValue(parseScreen(data())) };
      const src = fakeSource();
      render(<Probe api={api} open={() => src} />);
      await act(async () => {});
      expect(api.screen).toHaveBeenCalledTimes(1);
      await act(async () => { vi.advanceTimersByTime(10000); });
      expect(api.screen).toHaveBeenCalledTimes(2);
      // The stream opens: one re-fetch for the reconnect, then no more polling.
      await act(async () => { src.onopen(); });
      expect(screen.getByTestId("p")).toHaveTextContent("DevFest|live");
      const n = api.screen.mock.calls.length;
      await act(async () => { vi.advanceTimersByTime(30000); });
      expect(api.screen.mock.calls.length).toBe(n);
      // A push re-reads the screen.
      await act(async () => { src.handlers.board(); vi.advanceTimersByTime(10); });
      expect(api.screen.mock.calls.length).toBe(n + 1);
      // The stream drops: polling is back.
      await act(async () => { src.onerror(); });
      await act(async () => { vi.advanceTimersByTime(10000); });
      expect(api.screen.mock.calls.length).toBe(n + 2);
      expect(screen.getByTestId("p")).toHaveTextContent("|poll");
    });

    it("with no EventSource at all it just polls", async () => {
      vi.useFakeTimers();
      const api = { screen: vi.fn().mockResolvedValue(parseScreen(data())) };
      render(<Probe api={api} open={() => null} />);
      await act(async () => {});
      await act(async () => { vi.advanceTimersByTime(20000); });
      expect(api.screen).toHaveBeenCalledTimes(3);
    });
  });
});

describe("entry points: Play <game name>", () => {
  const api = (over = {}) => ({ names: vi.fn().mockResolvedValue(NAMES), openSession: vi.fn().mockRejectedValue(fail(401)), code: vi.fn().mockResolvedValue({ url: "https://myotherapp.in/g/b.77.r.0.m", pin: "4821" }), ...over });
  const entry = (a, props = {}) => render(<MemoryRouter><PlayEntry eventId="77" eventRef="devfest" api={a} {...props} /></MemoryRouter>);

  it("shows one link per game that is on, by name, when checked in", async () => {
    saveSession("77", { token: "kept-session-1" });
    entry(api());
    expect(await screen.findByRole("link", { name: "Play Hero Cards" })).toHaveAttribute("href", "/play/devfest/cards");
    expect(screen.getByRole("link", { name: "Play Treasure Run" })).toHaveAttribute("href", "/play/devfest/hunt");
  });
  it("only the game that is on", async () => {
    saveSession("77", { token: "kept-session-1" });
    entry(api({ names: vi.fn().mockResolvedValue(parseNames({ event: { id: 77, slug: "devfest" }, cards: { on: false, name: "Hero Cards" }, hunt: { on: true, name: "Treasure Run" } })) }));
    expect(await screen.findByRole("link", { name: "Play Treasure Run" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Hero Cards/ })).toBeNull();
  });
  it("nothing when no game is on", async () => {
    saveSession("77", { token: "kept-session-1" });
    const a = api({ names: vi.fn().mockResolvedValue(null) });
    const { container } = entry(a);
    await waitFor(() => expect(a.names).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
  it("nothing when the guest is not checked in (no session can be made)", async () => {
    localStorage.setItem("moa.guest", "x");
    const a = api({ openSession: vi.fn().mockRejectedValue(fail(409, "NOT_CHECKED_IN")) });
    const { container } = entry(a);
    await waitFor(() => expect(a.names).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("link", { name: /Play/ })).toBeNull();
  });
  it("nothing for a visitor with no session at all", async () => {
    const a = api();
    const { container } = entry(a);
    await waitFor(() => expect(a.names).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(a.openSession).not.toHaveBeenCalled();
  });
  it("on the ticket it also shows the game QR and PIN", async () => {
    saveSession("77", { token: "kept-session-1" });
    entry(api(), { withCode: true });
    expect(await screen.findByText("4821")).toBeInTheDocument();
    expect(screen.getByTitle("Your game QR code")).toBeInTheDocument();
  });
  it("is not about quests: no quest wording", async () => {
    saveSession("77", { token: "kept-session-1" });
    const { container } = entry(api(), { withCode: true });
    await screen.findByText("4821");
    expect(container.textContent).not.toMatch(/quest/i);
  });
});

describe("the app's #gs= hand-off", () => {
  const at = (url) => {
    const win = { location: new URL(url), history: { state: null, replaceState: vi.fn((_s, _t, next) => (win.location = new URL(next, "https://myotherapp.in"))) } };
    return win;
  };

  it("stores the token as the game session and takes it off the address at once", () => {
    const win = at("https://myotherapp.in/play/devfest/cards?x=1#gs=app-session-token-9");
    expect(takeFragmentSession("77", win)).toBe("app-session-token-9");
    expect(readSession("77").token).toBe("app-session-token-9");
    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", "/play/devfest/cards?x=1");
    expect(win.location.hash).toBe("");
  });
  it("leaves other fragment parts alone, and ignores a bad or missing token", () => {
    const win = at("https://myotherapp.in/play/devfest#a=1&gs=app-session-token-9");
    takeFragmentSession("77", win);
    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", "/play/devfest#a=1");
    expect(takeFragmentSession("78", at("https://myotherapp.in/play/devfest#gs=x"))).toBeNull();
    expect(takeFragmentSession("78", at("https://myotherapp.in/play/devfest"))).toBeNull();
    expect(readSession("78")).toBeNull();
  });
  it("every /play page takes it: the gate reads it before anything else and is signed in with it", async () => {
    window.history.replaceState(null, "", "/play/devfest/hunt#gs=app-session-token-9");
    const Probe = () => {
      const a = useGameAccess("77", { api: { names: async () => NAMES, openSession: async () => null } });
      return <p data-testid="s">{a.status}:{a.token}</p>;
    };
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("in:app-session-token-9"));
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/play/devfest/hunt");
  });
});
