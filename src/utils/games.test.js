import { describe, expect, it } from "vitest";
import {
  canPlay,
  clock,
  collectToast,
  describeRefusal,
  eventIdOfToken,
  filterDeck,
  lockedFor,
  moveOf,
  notPlayingReason,
  msLeft,
  parseCollect,
  parseDeck,
  parseHunt,
  parseNames,
  parseScan,
  parseScreen,
  parseSession,
  pinState,
  rankLine,
  scanToast,
  tokenFromScan,
  tokenKind,
} from "./games";

const hero = (n, tier, extra = {}) => ({ id: `h${n}`, number: n, name: `Hero ${n}`, tagline: "t", tier, ...extra });

describe("the PIN states", () => {
  it("wrong PIN (403 PIN_WRONG) says how many tries are left, from the body's errors", () => {
    expect(pinState({ status: 403, code: "PIN_WRONG", errors: { attempts_left: 3 } })).toEqual({ kind: "wrong", attemptsLeft: 3 });
    expect(pinState({ status: 403, code: "PIN_WRONG", errors: {} })).toEqual({ kind: "wrong", attemptsLeft: null });
  });
  it("locked (423 PIN_LOCKED) says until when", () => {
    expect(pinState({ status: 423, code: "PIN_LOCKED", errors: { locked_until: "2026-11-28T05:10:00Z" } })).toEqual({ kind: "locked", until: "2026-11-28T05:10:00Z" });
    expect(lockedFor("2026-11-28T05:10:00Z", Date.parse("2026-11-28T05:00:00Z"))).toBe("10 minutes");
    expect(lockedFor("2026-11-28T05:00:30Z", Date.parse("2026-11-28T05:00:00Z"))).toBe("less than a minute");
    expect(lockedFor("2026-11-28T04:00:00Z", Date.parse("2026-11-28T05:00:00Z"))).toBeNull();
  });
  it("not checked in, and anything else", () => {
    expect(pinState({ code: "NOT_CHECKED_IN" })).toEqual({ kind: "notin" });
    expect(pinState({ code: null, network: true }).kind).toBe("error");
  });
});

describe("tokens", () => {
  it("reads a bare token or a link", () => {
    expect(tokenFromScan("b.77.abc12.0.MACMACMAC")).toBe("b.77.abc12.0.MACMACMAC");
    expect(tokenFromScan("https://myotherapp.in/g/b.77.abc12.0.MACMACMAC")).toBe("b.77.abc12.0.MACMACMAC");
    expect(tokenFromScan("hello world")).toBeNull();
    expect(tokenFromScan("")).toBeNull();
  });
  it("knows its kind and event", () => {
    expect(tokenKind("b.77.x.0.m")).toBe("badge");
    expect(tokenKind("p.77.4.m")).toBe("point");
    expect(tokenKind("zzz")).toBe("unknown");
    expect(eventIdOfToken("p.77.4.mac")).toBe("77");
    expect(eventIdOfToken("zzz")).toBeNull();
  });
});

describe("deck states (GET /cards/deck as documented)", () => {
  const owned = (n, tier) => ({ ...hero(n, tier), art: null, art_url: null, emblem_key: "bolt", holders: 7, owned: true, source: "reveal", got_at: "2026-11-28T05:00:00Z" });
  const locked = (n, tier) => ({ id: `h${n}`, number: n, tier, locked: true, owned: false });
  const deck = parseDeck({
    revealed: true,
    cards: [owned(1, "common"), owned(2, "rare"), locked(3, "uncommon"), locked(4, "legendary")],
    deck_count: 2,
    total: 4,
    missing: { common: 0, uncommon: 1, rare: 0, legendary: 1 },
    complete: false,
    completed_at: null,
    rank: { rank: 14, of: 300, score: 2 },
  });
  it("counts progress, rank (an object) and what is missing", () => {
    expect(deck.percent).toBe(50);
    expect(deck.rank).toBe(14);
    expect(deck.of).toBe(300);
    expect(rankLine(deck.rank, deck.of)).toBe("Rank #14 of 300");
    expect(deck.missingLegendary).toBe(1);
    expect(deck.missing.uncommon).toBe(1);
    expect(deck.complete).toBe(false);
    expect(deck.cards.map((c) => c.held)).toEqual([true, true, false, false]);
  });
  it("a locked card carries no name", () => {
    expect(deck.cards[2].tier).toBe("uncommon");
    expect(deck.cards[2].held).toBe(false);
  });
  it("filters by tier; complete comes from the server; no rank is null", () => {
    expect(filterDeck(deck.cards, "rare").map((c) => c.name)).toEqual(["Hero 2"]);
    expect(filterDeck(deck.cards, "all")).toHaveLength(4);
    const full = parseDeck({ cards: [owned(1, "common"), owned(2, "rare")], deck_count: 2, total: 2, missing: {}, complete: true, rank: null });
    expect(full.complete).toBe(true);
    expect(full.rank).toBeNull();
    expect(rankLine(full.rank, full.of)).toBe("Not ranked yet");
  });
});

describe("collect results (POST /cards/collect as documented)", () => {
  const got = (h, isNew = true, message = `You collected ${h.name}!`) => ({ hero: h, new: isNew, message });
  it("collected: the server's message", () => {
    const r = parseCollect({ got: got(hero(5, "rare", { name: "Solar Warden" })), gave: null, deck_count: 3, total: 10, complete: false, rank: { rank: 2, of: 40, score: 3 } });
    expect(r.kind).toBe("collected");
    expect(r.rank).toBe(2);
    expect(collectToast(r)).toEqual({ tone: "good", text: "You collected Solar Warden!" });
  });
  it("two-way: says the other person got your hero too", () => {
    const r = parseCollect({ got: got(hero(5, "rare", { name: "Solar Warden" })), gave: { hero: hero(1, "common"), new: true }, deck_count: 3, total: 10, complete: false, rank: null });
    expect(collectToast(r).text).toBe("You collected Solar Warden! They got Hero 1 from you too.");
  });
  it("already in the deck", () => {
    const r = parseCollect({ got: got(hero(5, "rare"), false, "Already in your deck"), gave: null, deck_count: 3, total: 10, complete: false, rank: null });
    expect(r.kind).toBe("in_deck");
    expect(collectToast(r)).toEqual({ tone: "info", text: "Already in your deck" });
  });
  it("says each refusal in plain words", () => {
    expect(describeRefusal("SELF_SCAN")).toMatch(/your own/);
    expect(describeRefusal("OWNER_NOT_REVEALED")).toBe("They haven't unlocked their hero yet.");
    expect(describeRefusal("ALREADY_MET")).toMatch(/already met/);
    expect(describeRefusal("RATE_LIMITED", { retryAfter: 5 })).toMatch(/5 seconds/);
    expect(describeRefusal("BAD_CODE")).toMatch(/isn't one of ours/);
    expect(describeRefusal("HUNT_PAUSED")).toBe("Hunt paused. Hold on, it'll be back shortly.");
    expect(describeRefusal("HUNT_NOT_LIVE", { errors: { hunt_status: "ended" } })).toBe("Hunt is over.");
    expect(describeRefusal("OUT_OF_ORDER")).toMatch(/Follow your clue/);
    expect(describeRefusal("NOT_ENOUGH_POINTS", { errors: { cost: 10 } })).toMatch(/costs 10 points/);
    expect(describeRefusal("COLLECT_OFF")).toMatch(/switched off/);
    expect(describeRefusal("NOT_REVEALED")).toMatch(/Unlock your own hero/);
  });
});

describe("hunt (GET /hunt and POST /hunt/scan as documented)", () => {
  const base = { status: "live", starts_at: "2026-11-28T05:00:00Z", ends_at: "2026-11-28T06:00:00Z", duration_minutes: 60, bonus_n: 3, bonus_pts: 20, hint_cost: 10, paused_at: null, server_now: "2026-11-28T05:10:00Z", name: "Treasure Run", points: 40, found: 1, total_points: 200, complete: false, rank: 3, of: 50, recent: [{ name: "Ravi K.", at: "2026-11-28T05:09:00Z" }] };
  it("counts down by the server's clock, not the phone's", () => {
    const phoneNow = Date.parse("2026-11-28T05:00:00Z");
    const hunt = parseHunt(base, phoneNow);
    expect(msLeft(hunt, phoneNow)).toBe(50 * 60 * 1000);
    expect(clock(msLeft(hunt, phoneNow))).toBe("50:00");
    expect(clock(3725000)).toBe("1:02:05");
    expect(clock(null)).toBe("--:--");
  });
  it("a paused hunt's clock stands still at the pause", () => {
    const hunt = parseHunt({ ...base, status: "paused", paused_at: "2026-11-28T05:20:00Z" }, Date.parse("2026-11-28T09:00:00Z"));
    expect(msLeft(hunt, Date.parse("2026-11-28T09:00:00Z"))).toBe(40 * 60 * 1000);
  });
  it("ordered: `current` is the one clue, `clues` only the found ones", () => {
    const o = parseHunt({
      ...base,
      mode: "ordered",
      current: { point_id: 14, number: 2, clue: "Where the coffee is", zone: "Lobby", points: 50, has_hint: true, hint: null, hint_cost: 10, found: false },
      clues: [{ number: 1, found: true, earned: 60 }],
    });
    expect(o.mode).toBe("ordered");
    expect(o.clue).toMatchObject({ id: "14", number: 2, clue: "Where the coffee is", zone: "Lobby", points: 50, hasHint: true, hint: null, hintCost: 10 });
    expect(o.clues).toHaveLength(1);
    expect(o.clues[0]).toMatchObject({ number: 1, found: true, earned: 60 });
    expect(o.totalPoints).toBe(200);
    expect(o.total).toBeNull();
    expect(o.recent).toEqual([{ name: "Ravi K.", at: "2026-11-28T05:09:00Z" }]);
  });
  it("free: every clue in the `current` shape, current is null", () => {
    const f = parseHunt({
      ...base,
      mode: "free",
      current: null,
      clues: [
        { point_id: 1, number: 1, clue: "a", zone: null, points: 50, has_hint: false, hint: null, hint_cost: 10, found: true, earned: 50 },
        { point_id: 2, number: 2, clue: "b", zone: "Stage", points: 50, has_hint: true, hint: null, hint_cost: 10, found: false },
      ],
    });
    expect(f.clue).toBeNull();
    expect(f.clues.map((c) => c.found)).toEqual([true, false]);
    expect(f.clues.map((c) => c.id)).toEqual(["1", "2"]);
    expect(f.total).toBe(2);
    expect(parseHunt({ status: "nonsense" }).status).toBe("draft");
  });
  it("a scan: awarded, base, bonus and the server's message", () => {
    const r = parseScan({ awarded: 70, base: 50, bonus: 20, claim_rank: 2, total: 110, found: 2, total_points: 200, complete: false, rank: 4, message: "Found it! +70 (incl. +20 early bonus)" });
    expect(r).toMatchObject({ points: 70, base: 50, bonus: 20, claimRank: 2, total: 110, found: 2, totalPoints: 200, rank: 4, complete: false });
    expect(scanToast(r)).toEqual({ tone: "good", text: "Found it! +70 (incl. +20 early bonus)" });
    expect(scanToast(parseScan({ awarded: 30, bonus: 0, complete: true })).text).toBe("Found it! +30 points. Hunt complete!");
  });
});

describe("the screen (GET /screen/{token} as documented)", () => {
  const doc = (over = {}) => ({
    theme: "ocean_glow",
    accent: "#ff6600",
    logo_url: null,
    board_layout: "list",
    board_rows: 7,
    ticker_on: true,
    join_box_on: false,
    event: { id: 77, name: "DevFest", slug: "devfest" },
    cards: { on: true, name: "Hero Cards" },
    hunt: null,
    version: 4,
    boards: { cards: { rows: [{ rank: 1, name: "Anjali R.", score: 9, reached_at: null, move: 2, me: false }, { rank: 2, name: "Player #3", score: 8, reached_at: null, move: -1, me: false }] }, hunt: null },
    feed: [1, 2, 3].map((i) => ({ id: i, game: "cards", type: "reveal", message: `m${i}`, created_at: "2026-11-28T05:00:00Z" })),
    hunt_timer: null,
    server_now: "2026-11-28T05:00:00Z",
    ...over,
  });
  it("reads the flat settings, games that are on, boards and the feed", () => {
    const s = parseScreen(doc());
    expect(s.theme).toBe("ocean_glow");
    expect(s.accent).toBe("#ff6600");
    expect(s.layout).toBe("list");
    expect(s.rows).toBe(7);
    expect(s.joinBox).toBe(false);
    expect(s.games.cards.name).toBe("Hero Cards");
    expect(s.games.hunt).toBeNull();
    expect(s.boards.cards.rows[0].move).toEqual({ dir: "up", by: 2 });
    expect(s.boards.cards.rows[1].move).toEqual({ dir: "down", by: 1 });
    expect(s.boards.hunt.rows).toEqual([]);
    expect(s.feed.map((f) => f.message)).toEqual(["m1", "m2", "m3"]);
    expect(s.hunt).toBeNull();
  });
  it("hunt_timer becomes the clock, by the screen's server_now", () => {
    const now = Date.parse("2026-11-28T09:00:00Z");
    const s = parseScreen(doc({ hunt: { on: true, name: "Treasure Run" }, hunt_timer: { status: "live", starts_at: "2026-11-28T05:00:00Z", ends_at: "2026-11-28T06:00:00Z", paused_at: null, server_now: "2026-11-28T05:15:00Z", duration_minutes: 60, mode: "free" } }), now);
    expect(s.games.hunt.name).toBe("Treasure Run");
    expect(msLeft(s.hunt, now)).toBe(45 * 60 * 1000);
  });
  it("falls back to Neon Arcade and default names", () => {
    expect(parseScreen({}).theme).toBe("neon_arcade");
    expect(moveOf(0).dir).toBe("same");
    expect(parseNames({ event: { id: 1 }, cards: { on: true } }).cards.name).toBe("Hero Cards");
  });
});

describe("the public read and entry by me.can_play", () => {
  const pub = (me) => ({ event: { id: 77, name: "DevFest", slug: "devfest" }, cards: { on: true, name: "Hero Cards" }, hunt: null, theme: "neon_arcade", logo_url: null, accent: "#112233", me });
  it("reads me", () => {
    expect(parseNames(pub(null)).me).toBeNull();
    expect(parseNames(pub({ can_play: true, reason: null })).me).toEqual({ canPlay: true, reason: null });
    expect(parseNames(pub({ can_play: false, reason: "NOT_CHECKED_IN" })).me).toEqual({ canPlay: false, reason: "NOT_CHECKED_IN" });
  });
  it("Play shows only for can_play, with a game on", () => {
    expect(canPlay(parseNames(pub({ can_play: true, reason: null })))).toBe(true);
    expect(canPlay(parseNames(pub({ can_play: false, reason: "NOT_REGISTERED" })))).toBe(false);
    expect(canPlay(parseNames(pub(null)))).toBe(false);
    expect(canPlay(parseNames({ ...pub({ can_play: true }), cards: null }))).toBe(false);
    expect(notPlayingReason(parseNames(pub({ can_play: false, reason: "NOT_CHECKED_IN" })))).toBe("notin");
  });
  it("a session response carries token and session", () => {
    expect(parseSession({ event: { id: 77 }, token: "g.77.r.1.9.mac", session: 12, expires_at: "2026-11-29T00:00:00Z", player: {} })).toMatchObject({ token: "g.77.r.1.9.mac", session: 12 });
    expect(parseSession({ session: 12 })).toBeNull();
  });
});
