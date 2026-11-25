import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { parseCollect, parseDeck, parseHunt, parseNames, parseScan, parseScreen, parseSession } from "@/utils/games";

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
const fail = (status, code, errors = {}) => ({ __apiFailure: true, status, code, errors, message: null, network: false });
const Where = () => <p data-testid="at">{useLocation().pathname + useLocation().search}</p>;
const wrap = (ui) => render(<MemoryRouter>{ui}<Where /></MemoryRouter>);
const hero = (n, tier, extra = {}) => ({ id: `h${n}`, number: n, name: `Hero ${n}`, tagline: "tag", tier, ...extra });
// Documented deck cards: an owned one carries the hero, a locked one has no name or art.
const owned = (n, tier) => ({ ...hero(n, tier), art: null, art_url: null, emblem_key: null, holders: null, owned: true, source: "reveal", got_at: "2026-11-28T05:00:00Z" });
const lockedCard = (n, tier) => ({ id: `h${n}`, number: n, tier, locked: true, owned: false });
const documentedDeck = (cards, extra = {}) => ({ revealed: true, cards, deck_count: cards.filter((c) => c.owned).length, total: cards.length, missing: {}, complete: false, completed_at: null, rank: null, ...extra });
const gotOf = (h, isNew = true, message = `You collected ${h.name}!`) => ({ hero: h, new: isNew, message });
const collectAnswer = (got, gave = null) => ({ got, gave, deck_count: 2, total: 4, complete: false, rank: { rank: 3, of: 10, score: 2 } });

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
    const a = api({ pin: vi.fn().mockResolvedValue(parseSession({ token: "sess-token-123", session: 5, event: { id: 77 }, expires_at: null, player: {} })) });
    wrap(<BadgeLanding token={TOKEN} api={a} />);
    fireEvent.change(await pinField(), { target: { value: "4821" } });
    fireEvent.click(screen.getByRole("button", { name: "Let me in" }));
    await waitFor(() => expect(screen.getByTestId("at")).toHaveTextContent("/play/devfest"));
    expect(a.pin).toHaveBeenCalledWith(TOKEN, "4821");
    expect(readSession("77").token).toBe("sess-token-123");
  });

  it("wrong PIN: attempts left", async () => {
    wrap(<BadgeLanding token={TOKEN} api={api({ pin: vi.fn().mockRejectedValue(fail(403, "PIN_WRONG", { attempts_left: 2 })) })} />);
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
  const deck = parseDeck(documentedDeck([owned(1, "common"), owned(2, "rare"), lockedCard(3, "uncommon"), lockedCard(4, "legendary")], { missing: { common: 0, uncommon: 1, rare: 0, legendary: 1 }, rank: { rank: 14, of: 300, score: 2 } }));
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
    const full = parseDeck(documentedDeck([owned(1, "common")], { complete: true }));
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
    deck: vi.fn().mockResolvedValue(parseDeck(documentedDeck([owned(1, "common"), lockedCard(2, "rare")], { total: 4 }))),
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
    ["collected", collectAnswer(gotOf(hero(2, "rare", { name: "Solar Warden" }))), "You collected Solar Warden!"],
    ["collected, two-way: the other player got your hero too", collectAnswer(gotOf(hero(2, "rare", { name: "Solar Warden" })), { hero: hero(1, "common"), new: true }), "You collected Solar Warden! They got Hero 1 from you too."],
    ["already in the deck", collectAnswer(gotOf(hero(2, "rare"), false, "Already in your deck")), "Already in your deck"],
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
    ["RATE_LIMITED", /Try again in 7 seconds/],
    ["COLLECT_OFF", /switched off/],
    ["NOT_REVEALED", /Unlock your own hero/],
  ])("refusal %s in plain words", async (c, re) => {
    const api = base();
    api.collect.mockRejectedValue({ ...fail(c === "RATE_LIMITED" ? 429 : 409, c, c === "RATE_LIMITED" ? { retry_after: 7 } : {}), retryAfter: c === "RATE_LIMITED" ? 7 : null });
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
  const point = (id, extra = {}) => ({ point_id: id, number: id, clue: `clue ${id}`, zone: null, points: 50, has_hint: true, hint: null, hint_cost: 10, found: false, ...extra });

  it("not started", () => {
    view({ status: "scheduled" });
    expect(screen.getByRole("status")).toHaveTextContent("Not started yet");
    expect(screen.queryByRole("button", { name: /Scan a hunt code/ })).toBeNull();
  });
  it("live, ordered: the countdown, points, found, rank and the one clue", () => {
    view({ status: "live", mode: "ordered", ends_at: new Date(Date.now() + 600000).toISOString(), server_now: new Date().toISOString(), points: 90, found: 3, total_points: 300, rank: 2, of: 40, hint_cost: 10, current: point(4, { clue: "Under the big staircase" }), clues: [{ number: 1, found: true, earned: 30 }], recent: [{ name: "Ravi K.", at: "2026-11-28T05:09:00Z" }] });
    expect(screen.getByRole("timer")).toHaveTextContent(/^(09|10):\d\d$/);
    expect(screen.getByText("90")).toBeInTheDocument();
    expect(screen.getByText("Points of 300")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("Under the big staircase")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan a hunt code" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Buy a hint \(-10 pts\)/ })).toBeEnabled();
    expect(screen.getByText("Ravi K. found a code")).toBeInTheDocument();
  });
  it("live, free: every clue listed, found ones marked", () => {
    view({ status: "live", mode: "free", current: null, clues: [point(1, { clue: "Near the gate", found: true, earned: 50 }), point(2, { clue: "By the stage" })] });
    expect(screen.getByRole("heading", { name: "All clues" })).toBeInTheDocument();
    expect(screen.getByText("1. Near the gate")).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getByText("Found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hint for clue 2" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Hint for clue 1" })).toBeNull();
  });
  it("free: a hint names its clue's point_id", () => {
    const onHint = vi.fn();
    view({ status: "live", mode: "free", current: null, clues: [point(7, { clue: "By the stage" })] }, { onHint });
    fireEvent.click(screen.getByRole("button", { name: "Hint for clue 7" }));
    expect(onHint).toHaveBeenCalledWith("7");
  });
  it("ordered: the hint button asks for the current clue", () => {
    const onHint = vi.fn();
    view({ status: "live", mode: "ordered", current: point(4), clues: [] }, { onHint });
    fireEvent.click(screen.getByRole("button", { name: /Buy a hint/ }));
    expect(onHint).toHaveBeenCalledWith("4");
  });
  it("paused: says so and scanning is off", () => {
    view({ status: "paused", mode: "ordered", current: point(1, { clue: "x" }) });
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
    const api = { hunt: vi.fn().mockResolvedValue(parseHunt({ status: "live", points: 30 })), scan: vi.fn().mockResolvedValue(parseScan({ awarded: 30, base: 10, bonus: 20, claim_rank: 1, total: 30, found: 1, total_points: 100, complete: false, rank: 1, message: "Found it! +30 points (incl. +20 early bonus)" })), hint: vi.fn() };
    wrap(<HuntGame eventId="77" eventRef="devfest" token="t" names={NAMES} end={() => {}} api={api} pollMs={1e9} storage={storage} />);
    expect(await screen.findByText("Found it! +30 points (incl. +20 early bonus)")).toBeInTheDocument();
    expect(api.scan).toHaveBeenCalledWith("77", "t", "p.77.1.mac");
  });
});

describe("the venue screen", () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ rank: i + 1, name: `P${i + 1}`, score: 100 - i, move: i === 0 ? 2 : i === 1 ? "down" : 0 }));
  const data = (over = {}) => ({
    event: { id: 77, name: "DevFest", slug: "devfest" },
    theme: "neon_arcade",
    accent: null,
    logo_url: null,
    board_layout: "podium",
    board_rows: 10,
    ticker_on: true,
    join_box_on: true,
    cards: { on: true, name: "Hero Cards" },
    hunt: null,
    version: 1,
    boards: { cards: { rows: rows(10) }, hunt: null },
    feed: [1, 2, 3].map((i) => ({ id: i, game: "cards", type: "reveal", message: `Feed ${i}`, created_at: "2026-11-28T05:00:00Z" })),
    hunt_timer: null,
    server_now: new Date().toISOString(),
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
    const s = parseScreen(data({ board_layout: "list", board_rows: 5, ticker_on: false, join_box_on: false }));
    const { container } = render(<ScreenView screen={s} />);
    expect(container.querySelectorAll(".gms-pod")).toHaveLength(0);
    expect(container.querySelectorAll('.gms-rows[data-layout="list"] li')).toHaveLength(5);
    expect(screen.queryByRole("list", { name: "Live feed" })).toBeNull();
    expect(screen.queryByText("Scan to join")).toBeNull();
  });
  it("one board per game that's on, with the hunt timer", () => {
    const s = parseScreen(data({ hunt: { on: true, name: "Treasure Run" }, boards: { cards: { rows: rows(3) }, hunt: { rows: rows(3) } }, hunt_timer: { status: "live", starts_at: null, ends_at: new Date(Date.now() + 90000).toISOString(), paused_at: null, server_now: new Date().toISOString(), duration_minutes: 60, mode: "ordered" } }));
    render(<ScreenView screen={s} />);
    expect(screen.getByRole("heading", { name: "Hero Cards" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Treasure Run" })).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Treasure Run timer" })).toBeInTheDocument();
  });
  it("everyone (board_rows 0): podium plus every other player in one scrollable list", () => {
    const s = parseScreen(data({ board_rows: 0, boards: { cards: { rows: rows(400), of: 400 }, hunt: null } }));
    expect(s.rows).toBe(0);
    const { container } = render(<ScreenView screen={s} />);
    expect(container.querySelectorAll(".gms-pod")).toHaveLength(3);
    const list = container.querySelector('.gms-rows[data-layout="rest"]');
    expect(list.querySelectorAll("li")).toHaveLength(397);
    expect(list).toHaveAttribute("tabindex", "0");
  });
  it("both games: two boards side by side, each with its own podium", () => {
    const s = parseScreen(data({ board_rows: 0, hunt: { on: true, name: "Treasure Run" }, boards: { cards: { rows: rows(20) }, hunt: { rows: rows(12) } } }));
    const { container } = render(<ScreenView screen={s} />);
    expect(container.querySelectorAll(".gms-board--compact")).toHaveLength(2);
    expect(container.querySelectorAll(".gms-pod")).toHaveLength(6);
    expect(screen.getByText("Hero Cards · Treasure Run")).toBeInTheDocument();
  });
  it("custom colours become CSS variables over the theme; bad ones are dropped", () => {
    const s = parseScreen(data({ colors: { background: "#101010", surface: "#202020", text: "#fafafa", accent: "#ff0066", gold: "#ffd700", silver: "nope", bronze: null } }));
    expect(s.colors.silver).toBeNull();
    const { container } = render(<ScreenView screen={s} />);
    const shell = container.querySelector(".gm--screen");
    expect(shell.style.getPropertyValue("--gm-bg")).toBe("#101010");
    expect(shell.style.getPropertyValue("--gm-card")).toBe("#202020");
    expect(shell.style.getPropertyValue("--gm-ink")).toBe("#fafafa");
    expect(shell.style.getPropertyValue("--gm-accent")).toBe("#ff0066");
    expect(shell.style.getPropertyValue("--gms-gold")).toBe("#ffd700");
    expect(shell.style.getPropertyValue("--gms-silver")).toBe("");
  });
  it("an empty board invites people to join", () => {
    render(<ScreenView screen={parseScreen(data({ boards: { cards: { rows: [] }, hunt: null }, feed: [] }))} />);
    expect(screen.getByText("No scores yet")).toBeInTheDocument();
    expect(screen.getByText("Scan the code to get on the board")).toBeInTheDocument();
    expect(screen.getByText("The latest moves show up here")).toBeInTheDocument();
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

describe("entry points: Play <game name>, decided by /public's me.can_play", () => {
  const publicOf = (me, over = {}) => parseNames({ event: { id: 77, name: "DevFest", slug: "devfest" }, cards: { on: true, name: "Hero Cards" }, hunt: { on: true, name: "Treasure Run" }, theme: "neon_arcade", logo_url: null, accent: null, me, ...over });
  const CAN = { can_play: true, reason: null };
  const api = (over = {}) => ({
    names: vi.fn().mockResolvedValue(publicOf(CAN)),
    openSession: vi.fn().mockResolvedValue(parseSession({ token: "opened-session-1", session: 9, expires_at: null, event: { id: 77 } })),
    code: vi.fn().mockResolvedValue({ url: "https://myotherapp.in/g/b.77.r.0.m", token: "b.77.r.0.m", pin: "4821" }),
    ...over,
  });
  const entry = (a, props = {}) => render(<MemoryRouter><PlayEntry eventId="77" eventRef="devfest" api={a} {...props} /></MemoryRouter>);

  it("shows one link per game that is on, by name, when me.can_play, and makes no session", async () => {
    const a = api();
    entry(a);
    expect(await screen.findByRole("link", { name: "Play Hero Cards" })).toHaveAttribute("href", "/play/devfest/cards");
    expect(screen.getByRole("link", { name: "Play Treasure Run" })).toHaveAttribute("href", "/play/devfest/hunt");
    expect(a.openSession).not.toHaveBeenCalled();
  });
  it("only the game that is on", async () => {
    entry(api({ names: vi.fn().mockResolvedValue(publicOf(CAN, { cards: { on: false, name: "Hero Cards" } })) }));
    expect(await screen.findByRole("link", { name: "Play Treasure Run" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Hero Cards/ })).toBeNull();
  });
  it("nothing when no game is on (404)", async () => {
    const a = api({ names: vi.fn().mockResolvedValue(null) });
    const { container } = entry(a);
    await waitFor(() => expect(a.names).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
  it.each(["NOT_CHECKED_IN", "NOT_REGISTERED", "PLAN_FEATURE_REQUIRED"])("nothing when me.can_play is false (%s), and no session call", async (reason) => {
    const a = api({ names: vi.fn().mockResolvedValue(publicOf({ can_play: false, reason })) });
    const { container } = entry(a);
    await waitFor(() => expect(a.names).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(a.openSession).not.toHaveBeenCalled();
  });
  it("nothing for a visitor who is not known (me is null)", async () => {
    const a = api({ names: vi.fn().mockResolvedValue(publicOf(null)) });
    const { container } = entry(a);
    await waitFor(() => expect(a.names).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(a.openSession).not.toHaveBeenCalled();
  });
  it("on the ticket, a held session shows the game QR and PIN with no new session", async () => {
    saveSession("77", { token: "kept-session-1" });
    const a = api();
    entry(a, { withCode: true });
    expect(await screen.findByText("4821")).toBeInTheDocument();
    expect(screen.getByTitle("Your game QR code")).toBeInTheDocument();
    expect(a.code).toHaveBeenCalledWith("77", "kept-session-1");
    expect(a.openSession).not.toHaveBeenCalled();
  });
  it("on the ticket with no session, the session is made only when the guest taps Show my game QR", async () => {
    const a = api();
    entry(a, { withCode: true });
    const button = await screen.findByRole("button", { name: "Show my game QR" });
    expect(a.openSession).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(await screen.findByText("4821")).toBeInTheDocument();
    expect(a.openSession).toHaveBeenCalledTimes(1);
    expect(a.code).toHaveBeenCalledWith("77", "opened-session-1");
    expect(readSession("77").token).toBe("opened-session-1");
  });
  it("is not about quests: no quest wording", async () => {
    saveSession("77", { token: "kept-session-1" });
    const { container } = entry(api(), { withCode: true });
    await screen.findByText("4821");
    expect(container.textContent).not.toMatch(/quest/i);
  });
});

describe("the play gate reads me too", () => {
  const Probe = ({ names, openSession }) => {
    const a = useGameAccess("77", { api: { names: async () => names, openSession } });
    return <p data-testid="s">{a.status}:{a.reason ?? "-"}</p>;
  };
  const pub = (me) => parseNames({ event: { id: 77, slug: "devfest" }, cards: { on: true, name: "Hero Cards" }, hunt: null, me });
  it("a reader /public says is not checked in is not sent to make a session", async () => {
    localStorage.setItem("moa.guest", "x");
    const openSession = vi.fn();
    render(<Probe names={pub({ can_play: false, reason: "NOT_CHECKED_IN" })} openSession={openSession} />);
    await waitFor(() => expect(screen.getByTestId("s")).toHaveTextContent("out:notin"));
    expect(openSession).not.toHaveBeenCalled();
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
