/**
 * The games add-on (Hero Cards and the Scavenger Hunt), as the browser reads
 * the API (feature-register/games/CONTRACT.md section 3). Everything the
 * server decides stays the server's: nothing here scores, ranks or rolls.
 * Parsers are strict only on what a screen relies on and ignore the rest.
 */

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const str = (v) => (typeof v === "string" && v.trim() ? v : null);
const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : d);

export const TIERS = ["common", "uncommon", "rare", "legendary"];
export const TIER_LABEL = { common: "Common", uncommon: "Uncommon", rare: "Rare", legendary: "Legendary" };
/** The banner a reveal shows per tier. */
export const TIER_BANNER = { common: "NEW CARD", uncommon: "NICE PULL!", rare: "RARE PULL!", legendary: "LEGENDARY PULL!" };

export const THEMES = ["neon_arcade", "sunset_pop", "ocean_glow", "mono_night"];
export const themeOf = (v) => (THEMES.includes(v) ? v : "neon_arcade");

export const tierOf = (v) => {
  const t = String(v || "").toLowerCase();
  return TIERS.includes(t) ? t : "common";
};

/* ---------- tokens ---------- */

/** What a scanned QR holds: a bare token, or a link ending in one (https://myotherapp.in/g/{token}). */
export function tokenFromScan(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let candidate = text;
  if (/^https?:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      candidate = u.searchParams.get("t") || u.pathname.split("/").filter(Boolean).pop() || "";
    } catch {
      return null;
    }
  }
  candidate = decodeURIComponent(candidate);
  return /^[A-Za-z0-9._-]{8,200}$/.test(candidate) ? candidate : null;
}

/** "b.<event>.<registration>.<version>.<mac>" is a badge, "p...." a hunt point. */
export const tokenKind = (t) => (String(t).startsWith("p.") ? "point" : String(t).startsWith("b.") ? "badge" : "unknown");

/** Badge and point tokens carry the event's id as their second part. */
export function eventIdOfToken(t) {
  const m = /^[bps]\.(\d{1,12})\./.exec(String(t || ""));
  return m ? m[1] : null;
}

/* ---------- parsers ---------- */

export function parseNames(d) {
  const x = obj(d) || {};
  const ev = obj(x.event) || {};
  const game = (g) => {
    const o = obj(g);
    return o && o.on !== false ? { on: true, name: str(o.name) } : null;
  };
  return {
    event: { id: ev.id != null ? String(ev.id) : null, name: str(ev.name), slug: str(ev.slug) },
    cards: game(x.cards) && { on: true, name: str(x.cards?.name) || "Hero Cards" },
    hunt: game(x.hunt) && { on: true, name: str(x.hunt?.name) || "Scavenger Hunt" },
    theme: themeOf(x.theme),
    logo: str(x.logo_url),
    needsPin: x.needs_pin !== false,
  };
}

export const eventRefOf = (names) => names?.event?.slug || names?.event?.id || "";

export function parseSession(d) {
  const x = obj(d) || {};
  const token = str(x.token) || str(x.session) || str(x.session_token);
  if (!token) return null;
  return { token, expires_at: str(x.expires_at), event: parseNames(x).event };
}

export function parseHero(h) {
  const x = obj(h);
  if (!x) return null;
  return {
    id: x.id != null ? String(x.id) : String(x.number ?? x.name ?? ""),
    number: num(x.number, 0),
    name: str(x.name) || "Hero",
    tagline: str(x.tagline) || "",
    tier: tierOf(x.tier),
    art: str(x.art_url),
    emblem: str(x.emblem_key),
    holders: x.holders == null ? null : num(x.holders, 0),
  };
}

export function parseMe(d) {
  const x = obj(d) || {};
  const c = obj(x.cards) || {};
  const h = obj(x.hunt) || {};
  const p = obj(x.player) || {};
  return {
    name: str(p.name) || "Player",
    playerNo: p.player_no == null ? null : num(p.player_no),
    public: p.public !== false,
    cards: { hero: parseHero(c.revealed), deck: num(c.deck_count), total: num(c.total), rank: c.rank == null ? null : num(c.rank), of: num(c.of) },
    hunt: { status: str(h.status) || "draft", points: num(h.points), found: num(h.found), rank: h.rank == null ? null : num(h.rank), of: num(h.of) },
  };
}

export function parseReveal(d) {
  const x = obj(d) || {};
  const hero = parseHero(x.hero);
  if (!hero) return null;
  if (x.tier) hero.tier = tierOf(x.tier);
  if (x.holders != null) hero.holders = num(x.holders);
  return hero;
}

/** The deck: every hero of the event, held or locked. */
export function parseDeck(d) {
  const x = obj(d) || {};
  const list = x.heroes || x.items || x.cards || [];
  const cards = (Array.isArray(list) ? list : [])
    .map((c) => {
      const hero = parseHero(c);
      if (!hero) return null;
      const held = c.owned != null ? Boolean(c.owned) : c.locked != null ? !c.locked : true;
      return { ...hero, held };
    })
    .filter(Boolean);
  const held = cards.filter((c) => c.held).length;
  const total = num(x.total, cards.length);
  const deck = num(x.deck_count ?? x.owned, held);
  return {
    cards,
    total,
    deck,
    percent: total > 0 ? Math.round((deck / total) * 100) : 0,
    rank: x.rank == null ? null : num(x.rank),
    of: num(x.of),
    complete: x.complete === true || (total > 0 && deck >= total),
    missingLegendary: cards.filter((c) => !c.held && c.tier === "legendary").length,
  };
}

export const filterDeck = (cards, tier) => (tier && tier !== "all" ? cards.filter((c) => c.tier === tier) : cards);

export const rankLine = (rank, of) => (rank == null ? "Not ranked yet" : of > 0 ? `Rank #${rank} of ${of}` : `Rank #${rank}`);

/** What a collect gave, by what the server said. */
export function parseCollect(d) {
  const x = obj(d) || {};
  const mine = parseHero(x.you ?? x.you_got ?? x.hero ?? x.collected);
  const theirs = parseHero(x.they ?? x.they_got ?? x.gave);
  const already = x.result === "ALREADY_IN_DECK" || x.already_in_deck === true || (!mine && x.result !== "COLLECTED");
  return { kind: already ? "in_deck" : "collected", hero: mine, gave: theirs, complete: x.deck_complete === true || x.complete === true };
}

/** A refusal in plain words, by the API's error code. */
export function describeRefusal(code, f = {}) {
  switch (code) {
    case "SELF_SCAN":
      return "That's your own code. Scan someone else's.";
    case "OWNER_NOT_REVEALED":
      return "They haven't unlocked their hero yet.";
    case "ALREADY_MET":
      return "You've already met this player.";
    case "RATE_LIMITED":
      return f.retryAfter ? `Slow down a little. Try again in ${f.retryAfter} seconds.` : "Slow down a little and try again in a moment.";
    case "BAD_CODE":
      return "That code isn't one of ours for this event.";
    case "NOT_CHECKED_IN":
      return "Check in at the desk first.";
    case "HUNT_NOT_LIVE":
      return "The hunt isn't live right now.";
    case "HUNT_PAUSED":
      return "Hunt paused. Hold on, it'll be back shortly.";
    case "ALREADY_CLAIMED":
      return "You already found this one.";
    case "OUT_OF_ORDER":
      return "Not this one yet. Follow your clue.";
    case "NOT_ENOUGH_POINTS":
      return "You don't have enough points for a hint.";
    case "PLAN_FEATURE_REQUIRED":
      return "This game isn't available for this event.";
    default:
      return f.network ? "No connection. Try again." : f.message || "That didn't work. Try again.";
  }
}

/** The error code of a failed call (utils/ticketing's apiFailure shape, or axios's). */
export const failureCode = (f) => f?.code || null;

/** A collect's result as a toast: {tone, text}. */
export function collectToast(result) {
  if (result.kind === "collected") {
    const gave = result.gave ? ` ${result.gave.name} went to them too.` : "";
    return { tone: "good", text: `You collected ${result.hero?.name || "a new hero"}!${gave}` };
  }
  return { tone: "info", text: "Already in your deck." };
}

/* ---------- PIN ---------- */

/** The landing's state from a PIN attempt's refusal. */
export function pinState(f) {
  const code = f?.code;
  const d = obj(f?.data) || obj(f) || {};
  if (code === "PIN_WRONG") return { kind: "wrong", attemptsLeft: d.attempts_left != null && Number.isFinite(Number(d.attempts_left)) ? Number(d.attempts_left) : null };
  if (code === "PIN_LOCKED") return { kind: "locked", until: str(d.locked_until) };
  if (code === "NOT_CHECKED_IN") return { kind: "notin" };
  return { kind: "error", message: f?.network ? "No connection. Try again." : f?.message || "Something went wrong. Try again." };
}

export const lockedFor = (until, now = Date.now()) => {
  const ms = Date.parse(until || "") - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const min = Math.ceil(ms / 60000);
  return min <= 1 ? "less than a minute" : `${min} minutes`;
};

/* ---------- hunt ---------- */

export function parseClue(c) {
  const x = obj(c);
  if (!x) return null;
  return {
    id: x.id != null ? String(x.id) : x.number != null ? String(x.number) : null,
    number: x.number == null ? null : num(x.number),
    clue: str(x.clue) || "",
    zone: str(x.zone),
    hint: str(x.hint),
    found: x.found === true,
  };
}

export function parseHunt(d, now = Date.now()) {
  const x = obj(d) || {};
  const serverNow = Date.parse(x.server_now || "");
  return {
    status: ["draft", "scheduled", "live", "paused", "ended"].includes(x.status) ? x.status : "draft",
    startsAt: str(x.starts_at),
    endsAt: str(x.ends_at),
    // Add this to the device's clock to get the server's.
    offset: Number.isFinite(serverNow) ? serverNow - now : 0,
    mode: x.mode === "free" ? "free" : "ordered",
    points: num(x.points),
    found: num(x.found),
    total: num(x.total_points ?? x.total),
    rank: x.rank == null ? null : num(x.rank),
    of: num(x.of),
    hintCost: num(x.hint_cost, 0),
    clue: parseClue(x.current_clue ?? x.clue),
    clues: (Array.isArray(x.clues) ? x.clues : []).map(parseClue).filter(Boolean),
    recent: (Array.isArray(x.recent) ? x.recent : []).slice(0, 8).map((r) => ({ name: str(r?.name) || "A player", label: str(r?.label || r?.point), points: r?.points == null ? null : num(r.points) })),
  };
}

/** Milliseconds left by the server's clock; null when there is no end. */
export function msLeft(hunt, now = Date.now()) {
  const end = Date.parse(hunt?.endsAt || "");
  if (!Number.isFinite(end)) return null;
  return Math.max(0, end - (now + (hunt.offset || 0)));
}

export function clock(ms) {
  if (ms == null) return "--:--";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
}

export function parseScan(d) {
  const x = obj(d) || {};
  return { points: num(x.points_awarded ?? x.points), bonus: num(x.bonus), total: x.total == null ? null : num(x.total), found: x.found == null ? null : num(x.found), complete: x.complete === true || x.hunt_complete === true };
}

export const scanToast = (r) => ({ tone: "good", text: `Found it! +${r.points} points${r.bonus > 0 ? ` (incl. +${r.bonus} early bonus)` : ""}${r.complete ? ". Hunt complete!" : ""}` });

/* ---------- boards and the screen ---------- */

export const moveOf = (m) => {
  if (m === "up" || (typeof m === "number" && m > 0)) return { dir: "up", by: typeof m === "number" ? m : null };
  if (m === "down" || (typeof m === "number" && m < 0)) return { dir: "down", by: typeof m === "number" ? Math.abs(m) : null };
  return { dir: "same", by: null };
};

export function parseBoard(d) {
  const x = obj(d) || {};
  const rows = (Array.isArray(x.rows) ? x.rows : []).map((r, i) => ({ rank: num(r?.rank, i + 1), name: str(r?.name) || "Player", score: num(r?.score), move: moveOf(r?.move) }));
  const me = obj(x.me);
  return { rows, me: me ? { rank: me.rank == null ? null : num(me.rank), of: num(me.of), score: num(me.score) } : null };
}

export function parseScreen(d, now = Date.now()) {
  const x = obj(d) || {};
  const s = obj(x.settings) || {};
  const ev = obj(x.event) || {};
  const boards = obj(x.boards) || {};
  const gameOn = (on, name, dflt) => (on === true ? { name: str(name) || dflt } : null);
  return {
    event: { id: ev.id != null ? String(ev.id) : null, name: str(ev.name) || str(s.event_name) || "", slug: str(ev.slug) },
    theme: themeOf(s.theme),
    accent: /^#[0-9a-fA-F]{6}$/.test(s.accent || "") ? s.accent : null,
    logo: str(s.logo_url),
    layout: s.board_layout === "list" ? "list" : "podium",
    rows: [5, 7, 10].includes(Number(s.board_rows)) ? Number(s.board_rows) : 10,
    ticker: s.ticker_on !== false,
    joinBox: s.join_box_on !== false,
    joinUrl: str(x.join_url) || str(s.join_url),
    games: { cards: gameOn(s.cards_on, s.cards_name, "Hero Cards"), hunt: gameOn(s.hunt_on, s.hunt_name, "Scavenger Hunt") },
    boards: { cards: parseBoard(boards.cards), hunt: parseBoard(boards.hunt) },
    feed: (Array.isArray(x.feed) ? x.feed : []).slice(0, 3).map((f, i) => ({ id: f?.id ?? i, message: str(f?.message) || "" })).filter((f) => f.message),
    hunt: x.hunt ? parseHunt(x.hunt, now) : null,
  };
}

/* ---------- entry points ---------- */

/** The games a "Play" button may name: only the ones that are on. */
export const playableGames = (names) => [names?.cards && { kind: "cards", name: names.cards.name }, names?.hunt && { kind: "hunt", name: names.hunt.name }].filter(Boolean);

export const playPath = (ref, kind) => `/play/${encodeURIComponent(ref)}${kind ? `/${kind}` : ""}`;
