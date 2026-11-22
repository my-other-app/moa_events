import { describe, expect, it } from "vitest";
import {
  clock,
  collectToast,
  describeRefusal,
  eventIdOfToken,
  filterDeck,
  lockedFor,
  moveOf,
  msLeft,
  parseCollect,
  parseDeck,
  parseHunt,
  parseNames,
  parseScreen,
  pinState,
  rankLine,
  tokenFromScan,
  tokenKind,
} from "./games";

const hero = (n, tier, extra = {}) => ({ id: `h${n}`, number: n, name: `Hero ${n}`, tagline: "t", tier, ...extra });

describe("the PIN states", () => {
  it("wrong PIN says how many tries are left", () => {
    expect(pinState({ code: "PIN_WRONG", data: { attempts_left: 3 } })).toEqual({ kind: "wrong", attemptsLeft: 3 });
    expect(pinState({ code: "PIN_WRONG", data: {} })).toEqual({ kind: "wrong", attemptsLeft: null });
  });
  it("locked says until when", () => {
    expect(pinState({ code: "PIN_LOCKED", data: { locked_until: "2026-11-28T05:10:00Z" } })).toEqual({ kind: "locked", until: "2026-11-28T05:10:00Z" });
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

describe("deck states", () => {
  const deck = parseDeck({
    total: 4,
    deck_count: 2,
    rank: 14,
    of: 300,
    heroes: [
      { ...hero(1, "common"), owned: true },
      { ...hero(2, "rare"), owned: true },
      { ...hero(3, "uncommon"), owned: false },
      { ...hero(4, "legendary"), owned: false },
    ],
  });
  it("counts progress, rank and what is missing", () => {
    expect(deck.percent).toBe(50);
    expect(rankLine(deck.rank, deck.of)).toBe("Rank #14 of 300");
    expect(deck.missingLegendary).toBe(1);
    expect(deck.complete).toBe(false);
    expect(deck.cards.map((c) => c.held)).toEqual([true, true, false, false]);
  });
  it("filters by tier and marks a full deck complete", () => {
    expect(filterDeck(deck.cards, "rare").map((c) => c.name)).toEqual(["Hero 2"]);
    expect(filterDeck(deck.cards, "all")).toHaveLength(4);
    expect(parseDeck({ total: 2, heroes: [hero(1, "common"), hero(2, "rare")] }).complete).toBe(true);
    expect(rankLine(null, 0)).toBe("Not ranked yet");
  });
});

describe("collect results", () => {
  it("collected, two-way, and already in the deck", () => {
    const got = parseCollect({ you: hero(5, "rare", { name: "Solar Warden" }), they: hero(1, "common") });
    expect(got.kind).toBe("collected");
    expect(collectToast(got).text).toBe("You collected Solar Warden! Hero 1 went to them too.");
    const dup = parseCollect({ you: null });
    expect(dup.kind).toBe("in_deck");
    expect(collectToast(dup)).toEqual({ tone: "info", text: "Already in your deck." });
  });
  it("says each refusal in plain words", () => {
    expect(describeRefusal("SELF_SCAN")).toMatch(/your own/);
    expect(describeRefusal("OWNER_NOT_REVEALED")).toBe("They haven't unlocked their hero yet.");
    expect(describeRefusal("ALREADY_MET")).toMatch(/already met/);
    expect(describeRefusal("RATE_LIMITED", { retryAfter: 5 })).toMatch(/5 seconds/);
    expect(describeRefusal("BAD_CODE")).toMatch(/isn't one of ours/);
    expect(describeRefusal("HUNT_PAUSED")).toBe("Hunt paused. Hold on, it'll be back shortly.");
    expect(describeRefusal("OUT_OF_ORDER")).toMatch(/Follow your clue/);
    expect(describeRefusal("NOT_ENOUGH_POINTS")).toMatch(/enough points/);
  });
});

describe("hunt", () => {
  it("counts down by the server's clock, not the phone's", () => {
    const phoneNow = Date.parse("2026-11-28T05:00:00Z");
    const hunt = parseHunt({ status: "live", ends_at: "2026-11-28T06:00:00Z", server_now: "2026-11-28T05:10:00Z" }, phoneNow);
    expect(msLeft(hunt, phoneNow)).toBe(50 * 60 * 1000);
    expect(clock(msLeft(hunt, phoneNow))).toBe("50:00");
    expect(clock(3725000)).toBe("1:02:05");
    expect(clock(null)).toBe("--:--");
  });
  it("reads ordered (one clue) and free (all clues)", () => {
    const o = parseHunt({ status: "live", mode: "ordered", current_clue: { id: 3, clue: "Where the coffee is" } });
    expect(o.clue.clue).toBe("Where the coffee is");
    const f = parseHunt({ status: "live", mode: "free", clues: [{ id: 1, clue: "a", found: true }, { id: 2, clue: "b" }] });
    expect(f.clues.map((c) => c.found)).toEqual([true, false]);
    expect(parseHunt({ status: "nonsense" }).status).toBe("draft");
  });
});

describe("the screen", () => {
  it("reads settings, games that are on, boards and the 3-line feed", () => {
    const s = parseScreen({
      event: { name: "DevFest" },
      settings: { theme: "ocean_glow", board_layout: "list", board_rows: 7, cards_on: true, cards_name: "Hero Cards", hunt_on: false, ticker_on: true, join_box_on: false },
      boards: { cards: { rows: [{ rank: 1, name: "Anjali R.", score: 9, move: 2 }, { rank: 2, name: "Player #3", score: 8, move: "down" }] } },
      feed: [1, 2, 3, 4].map((i) => ({ id: i, message: `m${i}` })),
    });
    expect(s.theme).toBe("ocean_glow");
    expect(s.games.cards.name).toBe("Hero Cards");
    expect(s.games.hunt).toBeNull();
    expect(s.rows).toBe(7);
    expect(s.boards.cards.rows[0].move).toEqual({ dir: "up", by: 2 });
    expect(s.boards.cards.rows[1].move.dir).toBe("down");
    expect(s.feed).toHaveLength(3);
    expect(moveOf(0).dir).toBe("same");
  });
  it("falls back to Neon Arcade and default names", () => {
    expect(parseScreen({}).theme).toBe("neon_arcade");
    expect(parseNames({ event: { id: 1 }, cards: { on: true } }).cards.name).toBe("Hero Cards");
  });
});
