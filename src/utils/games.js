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
    accent: /^#[0-9a-fA-F]{6}$/.test(x.accent || "") ? x.accent : null,
    logo: str(x.logo_url),
    needsPin: x.needs_pin !== false,
    // GET /public with a signed-in or guest reader: whether a session can be made for them. null for a stranger.
    me: obj(x.me) ? { canPlay: x.me.can_play === true, reason: str(x.me.reason) } : null,
  };
}

/** Whether the event page or the ticket shows "Play": only what /public says about this reader (me.can_play). */
export const canPlay = (names) => Boolean(names?.me?.canPlay) && playableGames(names).length > 0;

/** What a closed door says, by /public's me.reason. */
export const notPlayingReason = (names) => (names?.me?.reason === "NOT_CHECKED_IN" ? "notin" : null);

export const eventRefOf = (names) => names?.event?.slug || names?.event?.id || "";

export function parseSession(d) {
  const x = obj(d) || {};
  const token = str(x.token);
  if (!token) return null;
  return { token, session: x.session ?? null, expires_at: str(x.expires_at), event: parseNames(x).event };
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
  hero.already = x.already === true;
  return hero;
}

/**
 * The deck (GET /cards/deck): `cards` is every hero of the event. An owned card
 * carries the hero's fields (`owned: true`); a locked one is `{id, number, tier,
 * locked: true}` with no name or art. `rank` is `{rank, of, score}` or null,
 * `missing` is a count per tier.
 */
export function parseDeck(d) {
  const x = obj(d) || {};
  const cards = (Array.isArray(x.cards) ? x.cards : [])
    .map((c) => {
      const hero = parseHero(c);
      if (!hero) return null;
      const held = c.locked === true ? false : c.owned != null ? Boolean(c.owned) : true;
      return { ...hero, held };
    })
    .filter(Boolean);
  const held = cards.filter((c) => c.held).length;
  const total = num(x.total, cards.length);
  const deck = num(x.deck_count, held);
  const r = obj(x.rank);
  const missing = obj(x.missing) || {};
  return {
    cards,
    total,
    deck,
    percent: total > 0 ? Math.round((deck / total) * 100) : 0,
    rank: r && r.rank != null ? num(r.rank) : null,
    of: r ? num(r.of) : 0,
    score: r && r.score != null ? num(r.score) : null,
    complete: x.complete === true,
    missing: Object.fromEntries(TIERS.map((t) => [t, num(missing[t])])),
    missingLegendary: num(missing.legendary, cards.filter((c) => !c.held && c.tier === "legendary").length),
  };
}

export const filterDeck = (cards, tier) => (tier && tier !== "all" ? cards.filter((c) => c.tier === tier) : cards);

export const rankLine = (rank, of) => (rank == null ? "Not ranked yet" : of > 0 ? `Rank #${rank} of ${of}` : `Rank #${rank}`);

/**
 * What a collect gave (POST /cards/collect): `got` is what I collected
 * ({hero, new, message}); `gave` is what they got from me ({hero, new}) or null.
 */
export function parseCollect(d) {
  const x = obj(d) || {};
  const got = obj(x.got) || {};
  const gave = obj(x.gave);
  const rank = obj(x.rank);
  return {
    kind: got.new === false ? "in_deck" : "collected",
    hero: parseHero(got.hero),
    message: str(got.message),
    gave: gave ? parseHero(gave.hero) : null,
    gaveNew: gave ? gave.new !== false : false,
    complete: x.complete === true,
    deck: x.deck_count == null ? null : num(x.deck_count),
    total: x.total == null ? null : num(x.total),
    rank: rank && rank.rank != null ? num(rank.rank) : null,
  };
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
      return f.errors?.hunt_status === "ended" ? "Hunt is over." : "The hunt isn't live right now.";
    case "HUNT_PAUSED":
      return "Hunt paused. Hold on, it'll be back shortly.";
    case "ALREADY_CLAIMED":
      return "You already found this one.";
    case "OUT_OF_ORDER":
      return "Not this one yet. Follow your clue.";
    case "NOT_ENOUGH_POINTS":
      return f.errors?.cost ? `A hint costs ${f.errors.cost} points. You don't have enough yet.` : "You don't have enough points for a hint.";
    case "NOT_REVEALED":
      return "Unlock your own hero first, then scan.";
    case "COLLECT_OFF":
      return "Swapping cards is switched off for this event.";
    case "NO_HINT":
      return "This clue has no hint.";
    case "POINT_REQUIRED":
      return "Pick a clue to get a hint for.";
    case "TICKET_REVOKED":
      return "This ticket is no longer valid.";
    case "NOT_REGISTERED":
      return "You're not registered for this event.";
    case "GAME_NOT_ON":
    case "PLAN_FEATURE_REQUIRED":
      return "This game isn't available for this event.";
    default:
      return f.network ? "No connection. Try again." : f.message || "That didn't work. Try again.";
  }
}

/** The error code of a failed call (utils/ticketing's apiFailure shape, or axios's). */
export const failureCode = (f) => f?.code || null;

/** A collect's result as a toast: {tone, text}. The server's own words first, then what the other player got. */
export function collectToast(result) {
  const said = result.message || (result.kind === "collected" ? `You collected ${result.hero?.name || "a new hero"}!` : "Already in your deck");
  const gave = result.gave && result.gaveNew ? ` They got ${result.gave.name} from you too.` : "";
  return { tone: result.kind === "collected" ? "good" : "info", text: `${said}${gave}` };
}

/* ---------- PIN ---------- */

/** The landing's state from a PIN attempt's refusal. */
export function pinState(f) {
  const code = f?.code;
  const d = obj(f?.errors) || {};
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

/** One clue, in the shape of `current` (and of every free-mode clue): {point_id, number, clue, zone, points, has_hint, hint, hint_cost, found}. */
export function parseClue(c) {
  const x = obj(c);
  if (!x) return null;
  const id = x.point_id ?? x.id ?? x.number;
  return {
    id: id != null ? String(id) : null,
    number: x.number == null ? null : num(x.number),
    clue: str(x.clue) || "",
    zone: str(x.zone),
    points: x.points == null ? null : num(x.points),
    hasHint: x.has_hint === true,
    hint: str(x.hint),
    hintCost: x.hint_cost == null ? null : num(x.hint_cost),
    found: x.found === true,
    earned: x.earned == null ? null : num(x.earned),
  };
}

const huntStatus = (v) => (["draft", "scheduled", "live", "paused", "ended"].includes(v) ? v : "draft");

/** The clock fields shared by GET /hunt and the screen's hunt_timer. */
export function parseTimer(x, now = Date.now(), fallbackServerNow = null) {
  const t = obj(x) || {};
  const serverNow = Date.parse(t.server_now || fallbackServerNow || "");
  return {
    status: huntStatus(t.status),
    startsAt: str(t.starts_at),
    endsAt: str(t.ends_at),
    pausedAt: str(t.paused_at),
    durationMinutes: t.duration_minutes == null ? null : num(t.duration_minutes),
    mode: t.mode === "free" ? "free" : "ordered",
    // Add this to the device's clock to get the server's.
    offset: Number.isFinite(serverNow) ? serverNow - now : 0,
  };
}

/**
 * GET /hunt. Ordered mode: `current` is the one clue to find and `clues` holds
 * the found ones only. Free mode: `current` is null and `clues` is every clue.
 */
export function parseHunt(d, now = Date.now()) {
  const x = obj(d) || {};
  const timer = parseTimer(x, now);
  const clues = (Array.isArray(x.clues) ? x.clues : []).map(parseClue).filter(Boolean);
  return {
    ...timer,
    points: num(x.points),
    found: num(x.found),
    totalPoints: x.total_points == null ? null : num(x.total_points),
    // Only free mode shows every clue, so only it knows how many there are.
    total: timer.mode === "free" ? clues.length : null,
    complete: x.complete === true,
    rank: x.rank == null ? null : num(x.rank),
    of: num(x.of),
    bonusN: num(x.bonus_n),
    bonusPts: num(x.bonus_pts),
    hintCost: num(x.hint_cost, 0),
    name: str(x.name),
    clue: parseClue(x.current),
    clues,
    recent: (Array.isArray(x.recent) ? x.recent : []).slice(0, 8).map((r) => ({ name: str(r?.name) || "A player", at: str(r?.at) })),
  };
}

/** Milliseconds left by the server's clock; null when there is no end. */
export function msLeft(hunt, now = Date.now()) {
  const end = Date.parse(hunt?.endsAt || "");
  if (!Number.isFinite(end)) return null;
  // A paused hunt's clock is held at the moment it was paused.
  const paused = hunt.status === "paused" ? Date.parse(hunt.pausedAt || "") : NaN;
  const at = Number.isFinite(paused) ? paused : now + (hunt.offset || 0);
  return Math.max(0, end - at);
}

export function clock(ms) {
  if (ms == null) return "--:--";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
}

/** POST /hunt/scan: {awarded, base, bonus, claim_rank, total, found, total_points, complete, rank, message}. */
export function parseScan(d) {
  const x = obj(d) || {};
  return {
    points: num(x.awarded),
    base: num(x.base),
    bonus: num(x.bonus),
    claimRank: x.claim_rank == null ? null : num(x.claim_rank),
    total: x.total == null ? null : num(x.total),
    found: x.found == null ? null : num(x.found),
    totalPoints: x.total_points == null ? null : num(x.total_points),
    rank: x.rank == null ? null : num(x.rank),
    complete: x.complete === true,
    message: str(x.message),
  };
}

export const scanToast = (r) => ({
  tone: "good",
  text: r.message || `Found it! +${r.points} points${r.bonus > 0 ? ` (incl. +${r.bonus} early bonus)` : ""}${r.complete ? ". Hunt complete!" : ""}`,
});

/* ---------- boards and the screen ---------- */

export const moveOf = (m) => {
  if (m === "up" || (typeof m === "number" && m > 0)) return { dir: "up", by: typeof m === "number" ? m : null };
  if (m === "down" || (typeof m === "number" && m < 0)) return { dir: "down", by: typeof m === "number" ? Math.abs(m) : null };
  return { dir: "same", by: null };
};

export function parseBoard(d) {
  const x = obj(d) || {};
  const rows = (Array.isArray(x.rows) ? x.rows : []).map((r, i) => ({ rank: num(r?.rank, i + 1), name: str(r?.name) || "Player", score: num(r?.score), move: moveOf(r?.move), me: r?.me === true }));
  const me = obj(x.me);
  return { rows, me: me ? { rank: me.rank == null ? null : num(me.rank), of: num(me.of), score: num(me.score) } : null };
}

/**
 * GET /screen/{token}: the settings sit at the top level; `cards` and `hunt`
 * say which games are on (`{on, name}` or null); `boards.<game>.rows`; `feed`
 * is the latest three {id, message}; `hunt_timer` carries the clock.
 */
const SCREEN_ROWS = [0, 5, 7, 10, 25, 50];
export const SCREEN_COLOR_KEYS = ["background", "surface", "text", "accent", "gold", "silver", "bronze"];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** The organiser's own screen colours: only valid hex values survive; null keys keep the theme's. */
export function colorsOf(c) {
  const x = obj(c) || {};
  const out = {};
  for (const k of SCREEN_COLOR_KEYS) out[k] = HEX.test(x[k] || "") ? x[k] : null;
  return out;
}

const lum = (hex) => {
  const ch = (i) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
};
/** WCAG contrast ratio of two #RRGGBB colours. */
export const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};
/** Black or white, whichever reads better on `fill`. */
export const inkOn = (fill) => (contrast(fill, "#000000") >= contrast(fill, "#FFFFFF") ? "#000000" : "#FFFFFF");

/** The CSS variables a set of custom colours sets over the theme. */
export function colorVars(colors) {
  const c = colorsOf(colors);
  const v = {};
  if (c.background) Object.assign(v, { "--gm-bg": c.background, "--gm-bg2": c.background });
  if (c.surface) Object.assign(v, { "--gm-card": c.surface, "--gm-line": `color-mix(in srgb, ${c.surface} 70%, ${inkOn(c.surface)} 30%)` });
  const text = c.text || (c.background ? inkOn(c.background) : null);
  if (text) Object.assign(v, { "--gm-ink": text, "--gm-soft": `color-mix(in srgb, ${text} 75%, transparent)` });
  if (c.accent) Object.assign(v, { "--gm-accent": c.accent, "--gm-on-accent": inkOn(c.accent) });
  for (const m of ["gold", "silver", "bronze"]) if (c[m]) v[`--gms-${m}`] = c[m];
  return v;
}

export function parseScreen(d, now = Date.now()) {
  const x = obj(d) || {};
  const ev = obj(x.event) || {};
  const boards = obj(x.boards) || {};
  const game = (g, dflt) => {
    const o = obj(g);
    return o && o.on !== false ? { name: str(o.name) || dflt } : null;
  };
  const timer = obj(x.hunt_timer);
  return {
    event: { id: ev.id != null ? String(ev.id) : null, name: str(ev.name) || "", slug: str(ev.slug) },
    theme: themeOf(x.theme),
    accent: /^#[0-9a-fA-F]{6}$/.test(x.accent || "") ? x.accent : null,
    logo: str(x.logo_url),
    layout: x.board_layout === "list" ? "list" : "podium",
    // 0 is "everyone": the screen lists the whole board and scrolls it.
    rows: SCREEN_ROWS.includes(Number(x.board_rows)) ? Number(x.board_rows) : 10,
    colors: colorsOf(x.colors),
    ticker: x.ticker_on !== false,
    joinBox: x.join_box_on !== false,
    joinUrl: str(x.join_url),
    version: x.version ?? null,
    games: { cards: game(x.cards, "Hero Cards"), hunt: game(x.hunt, "Scavenger Hunt") },
    boards: { cards: parseBoard(boards.cards), hunt: parseBoard(boards.hunt) },
    feed: (Array.isArray(x.feed) ? x.feed : []).slice(0, 3).map((f, i) => ({ id: f?.id ?? i, message: str(f?.message) || "" })).filter((f) => f.message),
    hunt: timer ? parseTimer(timer, now, x.server_now) : null,
  };
}

/* ---------- entry points ---------- */

/** The games a "Play" button may name: only the ones that are on. */
export const playableGames = (names) => [names?.cards && { kind: "cards", name: names.cards.name }, names?.hunt && { kind: "hunt", name: names.hunt.name }].filter(Boolean);

export const playPath = (ref, kind) => `/play/${encodeURIComponent(ref)}${kind ? `/${kind}` : ""}`;
