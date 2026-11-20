import { siteHref } from "@/lib/href";
import { androidIntentUrl } from "./profiles";
import { eventPath } from "./eventpage";
import { plural } from "./format";
import { atWhen, desksLine, milestoneAt, minutesWord, outsideWindow, rewardList, unitWord, whenShort, windowLine } from "./questwords";
import { apiFailure } from "./ticketing";

/**
 * Event quests, as the guest sees them (feature-register/quests/CONTRACT.md
 * §8): the card the API sends (GET /events/{id}/quest) read into a safe
 * shape (parseQuestCard), then into what the card says (questView), and
 * what each refusal of a code or a size means. Nothing here touches the page.
 *
 * An API without quests answers 404 with no code; an event without a quest,
 * or with it off, answers {enabled: false}: both read as "off", and the
 * pages show nothing more than they did.
 */

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const whole = (v, d = 0) => {
  const n = num(v);
  return n === null ? d : Math.max(0, Math.round(n));
};
const iso = (v) => {
  const s = str(v);
  return s && !Number.isNaN(new Date(s).getTime()) ? s : null;
};
const id = (v) => (typeof v === "string" && v ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null);

/** The kinds of task the API knows (§3.1); anything else is shown by its title, with nothing to open. */
export const TASK_KINDS = new Set([
  "checked_in",
  "network",
  "quiz_played",
  "quiz_score",
  "quiz_top",
  "polls",
  "qa_question",
  "feedback",
  "poster_made",
  "poster_link",
  "follow_club",
  "profile_complete",
  "station",
  "code",
  "manual",
]);

const ACTIONS = new Set(["ticket", "network_scan", "live_room", "feedback", "poster", "follow", "profile", "station", "code"]);
const CLAIM_STATES = new Set(["reserved", "waitlisted", "sold_out", "collected", "released"]);

function readMe(v) {
  const m = obj(v);
  if (!m) return null;
  return { count: whole(m.count), done: m.done === true, doneAt: iso(m.done_at), source: str(m.source) };
}

function readTask(v) {
  const t = obj(v);
  const tid = id(t?.id);
  if (!t || !tid) return null;
  const kind = str(t.kind);
  const action = str(t.action);
  const station = obj(t.station);
  return {
    id: tid,
    kind: kind && TASK_KINDS.has(kind) ? kind : "other",
    title: str(t.title) || "A task",
    description: str(t.description),
    points: whole(t.points),
    required: t.required === true,
    startsAt: iso(t.starts_at),
    endsAt: iso(t.ends_at),
    target: Math.max(1, whole(t.target, 1)),
    action: action && ACTIONS.has(action) ? action : null,
    station: station ? { name: str(station.name) } : null,
    me: readMe(t.me),
  };
}

function readClaim(v) {
  const c = obj(v);
  const cid = id(c?.claim_id);
  const status = str(c?.status);
  if (!c || !cid || !status || !CLAIM_STATES.has(status)) return null;
  const choices = arr(c.choices)
    .map((x) => {
      const o = obj(x);
      const label = str(o?.label);
      return label ? { label, free: num(o.free) === null ? null : whole(o.free) } : null;
    })
    .filter(Boolean);
  return {
    id: cid,
    status,
    needsSize: c.needs_size === true,
    size: str(c.variant_label),
    choices,
    waitlistPosition: num(c.waitlist_position) === null ? null : whole(c.waitlist_position),
    collectedAt: iso(c.collected_at),
  };
}

function readReward(v) {
  const r = obj(v);
  const rid = id(r?.reward_id);
  if (!r || !rid) return null;
  const photo = str(r.photo_url);
  return {
    id: rid,
    name: str(r.name) || "A reward",
    photo: photo && /^(https?:)?\/\//i.test(photo) ? photo : null,
    sizes: r.sizes === true,
    soldOut: r.sold_out === true,
    claim: readClaim(r.claim),
  };
}

function readMilestone(v) {
  const m = obj(v);
  const mid = id(m?.id);
  if (!m || !mid) return null;
  return {
    id: mid,
    title: str(m.title) || "Milestone",
    threshold: whole(m.threshold),
    unlocked: m.unlocked === true,
    unlockedAt: iso(m.unlocked_at),
    rewards: arr(m.rewards).map(readReward).filter(Boolean),
  };
}

function readGuest(v) {
  const m = obj(v);
  if (!m) return null;
  const next = obj(m.next);
  return {
    points: whole(m.points),
    tasksDone: whole(m.tasks_done),
    requiredLeft: whole(m.required_left),
    next: next ? { milestoneId: id(next.milestone_id), title: str(next.title) || "the next milestone", threshold: whole(next.threshold), left: whole(next.left) } : null,
    rank: num(m.rank) === null ? null : whole(m.rank),
    codeAttemptsLeft: num(m.code_attempts_left) === null ? null : whole(m.code_attempts_left),
  };
}

/**
 * GET /events/{id}/quest (§8.1), or the `card` a code's answer carries:
 * the card in a safe shape, or null for "off" (no quest, switched off, an
 * API without quests, or a body that isn't a card).
 */
export function parseQuestCard(raw) {
  const c = obj(raw);
  if (!c || c.enabled !== true) return null;
  const links = obj(c.links) || {};
  return {
    id: id(c.id),
    title: str(c.title),
    intro: str(c.intro),
    mode: c.mode === "points" ? "points" : "checkmarks",
    startsAt: iso(c.starts_at),
    endsAt: iso(c.ends_at),
    open: c.open === true,
    leaderboard: c.leaderboard === true,
    tasks: arr(c.tasks).map(readTask).filter(Boolean),
    milestones: arr(c.milestones)
      .map(readMilestone)
      .filter(Boolean)
      .sort((a, b) => a.threshold - b.threshold),
    me: readGuest(c.me),
    desks: arr(c.collect_at)
      .map((d) => str(obj(d)?.name))
      .filter(Boolean),
    links: {
      liveRoom: siteHref(links.live_room),
      feedback: siteHref(links.feedback),
      poster: siteHref(links.poster),
      club: siteHref(links.club),
    },
  };
}

/** GET …/quest/leaderboard (§8.4): `{rows: [{rank, name, points, me}], me: {rank, points} | null}`. */
export function parseLeaderboard(raw) {
  const b = obj(raw);
  const rows = arr(b?.rows)
    .map((r) => {
      const o = obj(r);
      const name = str(o?.name);
      return o && name ? { rank: Math.max(1, whole(o.rank, 1)), name, points: whole(o.score), me: o.me === true } : null;
    })
    .filter(Boolean);
  const me = obj(b?.me);
  return { rows, me: me && num(me.rank) !== null ? { rank: whole(me.rank), points: whole(me.score) } : null };
}

/* ---------- where the quest stands ---------- */

/**
 * "open" (inside its window now, as the API says), "upcoming" (not started),
 * "ended" (its window is over), or "closed" (shut for another reason).
 */
export function questStatus(card, now = Date.now()) {
  if (card.open) return "open";
  const s = card.startsAt ? new Date(card.startsAt).getTime() : null;
  const e = card.endsAt ? new Date(card.endsAt).getTime() : null;
  if (s !== null && s > now) return "upcoming";
  if (e !== null && e <= now) return "ended";
  return "closed";
}


/* ---------- the way to do each task ---------- */

const isAbsolute = (href) => /^https?:/i.test(href);
const link = (kind, label, href) => (href ? { kind, label, href, external: isAbsolute(href) } : null);

/** What to do for each kind, when the organisers wrote no description of their own. */
const HOW = {
  checked_in: () => "Show your ticket's QR at the entrance.",
  network: (t) =>
    `Scan the personal QR of ${t.target === 1 ? "someone" : plural(t.target, "person", "people")} you meet, in the MyOtherApp app (Network, then Scan). Only checked-in guests count.`,
  quiz_played: () => "Join the quiz in the live room, signed in, when it's on.",
  quiz_score: () => "Play the quiz in the live room, signed in.",
  quiz_top: () => "Finish near the top of the quiz in the live room.",
  polls: (t) => (t.target === 1 ? "Answer a poll in the live room, signed in." : `Answer ${t.target} polls in the live room, signed in.`),
  qa_question: (t) => (t.target === 1 ? "Ask the speakers a question in the live room." : `Ask ${t.target} questions in the live room.`),
  feedback: () => "Tell the organisers how it went.",
  poster_made: () => "Make your “I'm attending” poster.",
  poster_link: () => "Share your poster's link: people who open it count.",
  follow_club: () => "Follow the club that runs the event.",
  profile_complete: () => "In the MyOtherApp app, give your profile a headline, a photo, a link and a project.",
  station: (t) => (t.station?.name ? `Get your ticket scanned at ${t.station.name}.` : "Get your ticket scanned at the station."),
  code: () => "Find the code at the event and enter it below.",
  manual: () => "The organisers tick this one for you.",
};

/**
 * The one button for a task (CONTRACT §3.2), from what the page knows
 * (`ctx`): the ticket (the ticket's page has its id; the event's page knows
 * it only for someone signed in), the event (for its live room), the club,
 * and whether the browser is Android's (an intent link reaches the app
 * there; on an iPhone a link to the site stays in Safari, so the site's
 * /network page says where the scanner is).
 */
function actionFor(task, ctx) {
  const links = ctx.links || {};
  switch (task.action) {
    case "ticket":
      // Under the ticket, the ticket is right there; on the event's page, the ticket (or My tickets, signed in).
      if (ctx.where === "ticket") return null;
      if (ctx.ticketId) return link("ticket", "Your ticket", `/tickets/${encodeURIComponent(ctx.ticketId)}`);
      return ctx.signedIn ? link("ticket", "My tickets", "/me/tickets") : null;
    case "network_scan": {
      const path = ctx.eventId ? `/network?event=${encodeURIComponent(ctx.eventId)}&scan=1` : "/network?scan=1";
      return ctx.android ? { kind: "network_scan", label: "Open the app to scan", href: androidIntentUrl(path), external: true } : link("network_scan", "Open the app to scan", path);
    }
    case "live_room":
      return link("live_room", "Open the live room", links.liveRoom || (ctx.event ? eventPath(ctx.event, "live") : null));
    case "feedback":
      return link("feedback", "Give feedback", links.feedback);
    case "poster":
      return link("poster", task.kind === "poster_link" ? "Share your poster" : "Make your poster", links.poster || (ctx.ticketId ? `/posters/${encodeURIComponent(ctx.ticketId)}` : null));
    case "follow":
      return link("follow", "Follow the club", links.club || (ctx.clubSlug ? `/clubs/${encodeURIComponent(ctx.clubSlug)}` : null));
    default:
      return null;
  }
}

function howLine(task, ctx) {
  if (task.kind === "feedback" && !ctx.links?.feedback) return task.description || "The feedback form opens near the end: its link comes by email.";
  if (task.description) return task.description;
  const say = HOW[task.kind];
  return say ? say(task) : null;
}

/* ---------- rewards ---------- */

function rewardState(reward, milestone) {
  const c = reward.claim;
  if (c && c.status !== "released") {
    if (c.status === "reserved") return "unlocked";
    if (c.status === "waitlisted") return "waitlist";
    return c.status; // sold_out, collected
  }
  if (!milestone.unlocked && reward.soldOut) return "sold_out";
  return "locked";
}

function rewardLine(state, reward, desks, now, open) {
  const c = reward.claim;
  const at = desksLine(desks);
  switch (state) {
    case "unlocked":
      if (c?.needsSize) return open ? `Pick your size, then collect it at ${at}: show your ticket there.` : `Collect it at ${at}: show your ticket there and say your size.`;
      return `Collect it at ${at}: show your ticket there.`;
    case "waitlist":
      return c?.waitlistPosition
        ? `None free right now. You're number ${c.waitlistPosition} in line: one is kept for you as soon as one frees up.`
        : "None free right now: one is kept for you as soon as one frees up.";
    case "sold_out":
      return c ? "These ran out just before you unlocked it." : "All gone: first come, first served.";
    case "collected":
      return c?.collectedAt ? `Collected ${atWhen(c.collectedAt, now)}.` : "Collected.";
    default:
      return null;
  }
}

/** The sizes a guest can pick for a reserved reward: theirs (if any), then every size with a unit free. */
function sizesFor(claim) {
  if (!claim || claim.status !== "reserved") return [];
  const out = claim.choices.map((c) => ({ id: c.label, label: c.label, left: c.free }));
  if (claim.size && !out.some((s) => s.id.toLowerCase() === claim.size.toLowerCase())) out.unshift({ id: claim.size, label: claim.size, left: null });
  return out;
}

/* ---------- the whole card, in words ---------- */

/**
 * What the card says, from a parsed card and what the page knows:
 *
 *   where        "ticket" (under the ticket) or "event" (the event's page)
 *   eventId, event, clubSlug, ticketId   for the tasks' buttons
 *   android      the browser is Android's (the app's intent link works)
 *   signedIn     someone is signed in here
 *   canRegister  the event is taking registrations (for the "no ticket" line)
 *
 * `now` for the times it says. A card with no `me` (a visitor, or someone
 * with no ticket for the event) is the overview: the tasks and rewards, no
 * ticks, no buttons, a line on how to take part.
 */
export function questView(card, ctx = {}, now = Date.now()) {
  const c = { ...ctx, links: card.links };
  const status = questStatus(card, now);
  const me = card.me;
  const points = card.mode === "points";
  const total = card.tasks.length;
  const top = card.milestones.length ? Math.max(...card.milestones.map((m) => m.threshold)) : points ? card.tasks.reduce((s, t) => s + t.points, 0) : total;
  const value = me ? (points ? me.points : me.tasksDone) : 0;
  const open = status === "open";

  const tasks = card.tasks.map((t) => {
    const done = Boolean(me && t.me?.done);
    const shut = !done && outsideWindow(t.startsAt, t.endsAt, now);
    return {
      id: t.id,
      kind: t.kind,
      title: t.title,
      points: t.points,
      required: t.required,
      done,
      count: me && !done && t.target > 1 ? { have: Math.min(t.target, t.me?.count || 0), need: t.target, unit: t.kind === "network" ? (t.target === 1 ? "person" : "people") : null } : null,
      how: done || status === "ended" ? null : howLine(t, c),
      when: done || status === "ended" ? null : windowLine(t.startsAt, t.endsAt, now),
      locked: shut,
      action: me && open && !done && !shut ? actionFor(t, c) : null,
      doneLine: done && t.me?.doneAt && whenShort(t.me.doneAt, now) ? `Done ${atWhen(t.me.doneAt, now)}` : null,
    };
  });

  const milestones = card.milestones.map((m) => {
    const need = me && !m.unlocked ? Math.max(0, m.threshold - value) : 0;
    return {
      id: m.id,
      title: m.title,
      atLine: milestoneAt(card.mode, m.threshold),
      unlocked: Boolean(me) && m.unlocked,
      need,
      needLine: need > 0 ? `${unitWord(card.mode, need)} to go` : null,
      rewards: m.rewards.map((r) => {
        const state = me ? rewardState(r, m) : r.soldOut ? "sold_out" : "locked";
        const sizes = sizesFor(r.claim);
        return {
          id: r.id,
          claimId: r.claim?.id || null,
          name: r.name,
          photo: r.photo,
          state,
          size: r.claim?.size || null,
          sizeId: r.claim?.size || null,
          sizes,
          canPickSize: state === "unlocked" && r.sizes && sizes.length > 0,
          needsSize: Boolean(r.claim?.needsSize),
          line: rewardLine(state, r, card.desks, now, open),
        };
      }),
    };
  });

  /* The lines at the top: where the quest stands, how to take part, what's waiting to be collected. */
  const notes = [];
  if (status === "upcoming") notes.push({ key: "upcoming", icon: "clock", line: card.startsAt ? `The quest starts ${atWhen(card.startsAt, now)}. Tasks count from then.` : "The quest hasn't started yet." });
  if (status === "ended") notes.push({ key: "ended", icon: "clock", line: card.endsAt ? `The quest ended ${atWhen(card.endsAt, now)}.` : "The quest has ended." });
  if (status === "closed") notes.push({ key: "closed", icon: "clock", line: "The quest isn't open right now." });
  if (!me && status !== "ended") {
    let line;
    if (ctx.signedIn) line = ctx.canRegister ? "Register for the event to take part: your tasks and rewards show here once you have a ticket." : "Guests with a ticket take part: your progress shows here once you have one.";
    else line = `${ctx.canRegister ? "Register to take part. Already have a ticket? " : "Guests with a ticket take part. "}Sign in, or open your ticket from its email, to see your progress.`;
    notes.push({ key: "noticket", icon: "lock", line });
  }
  const ready = milestones.flatMap((m) => m.rewards.filter((r) => r.state === "unlocked"));
  if (ready.length) {
    notes.push({
      key: "collect",
      icon: "gift",
      tone: "good",
      line: `You've unlocked ${rewardList(ready.map((r) => r.name))}: collect ${ready.length === 1 ? "it" : "them"} at ${desksLine(card.desks)}.`,
    });
  }

  /* The bar, and the line under it. */
  let next = null;
  if (me && status !== "upcoming" && card.milestones.length) {
    if (me.requiredLeft > 0) {
      const names = card.tasks.filter((t) => t.required && !t.me?.done).map((t) => `“${t.title}”`);
      next = `Rewards unlock once the required ${me.requiredLeft === 1 ? "task is" : "tasks are"} done: ${rewardList(names) || plural(me.requiredLeft, "task")}.`;
    } else if (me.next && me.next.left > 0) {
      const m = card.milestones.find((x) => x.id === me.next.milestoneId);
      const what = m && m.rewards.length ? `: ${rewardList(m.rewards.map((r) => r.name))}` : "";
      next = `${unitWord(card.mode, me.next.left).replace(/^([\d,.k]+) /, "$1 more ")} to unlock ${me.next.title}${what}.`;
    } else if (card.milestones.every((m) => m.unlocked)) {
      next = card.milestones.length === 1 ? "You've reached the milestone." : "You've reached every milestone.";
    }
  }
  const meter = me && top > 0 && status !== "upcoming" ? { value, max: top, marks: card.milestones.map((m) => m.threshold), label: points ? `${plural(value, "point")} of ${top}` : `${value} of ${top} tasks done` } : null;

  // The box stays while the quest is on and has codes, so what it just said stays with it.
  const codeTasks = card.tasks.filter((t) => t.kind === "code");
  const codesLeft = codeTasks.some((t) => !t.me?.done);
  const attempts = me?.codeAttemptsLeft ?? null;

  return {
    status,
    mode: card.mode,
    title: card.title || "Event quest",
    intro: card.intro,
    signedUp: Boolean(me),
    score: me && status !== "upcoming" ? (points ? { value, unit: value === 1 ? "point" : "points" } : { value: `${value}/${total}`, unit: "done" }) : null,
    rank: card.leaderboard && me?.rank ? me.rank : null,
    notes,
    meter,
    next,
    tasks,
    hasCodes: Boolean(me) && open && codeTasks.length > 0,
    codeLock: codesLeft && attempts === 0 ? "No tries left for now: wrong codes are limited each hour. Try again later." : null,
    codeHint: !codesLeft ? "You've entered every code." : attempts !== null && attempts > 0 && attempts <= 3 ? `${plural(attempts, "try", "tries")} left this hour.` : null,
    milestones,
    leaderboard: card.leaderboard && Boolean(me),
  };
}

/* ---------- answers and refusals ---------- */

/** A code that counted (§8.2, 200): `{tone: "good", line}`. */
export function codeDoneLine(answer, mode = "checkmarks") {
  const t = obj(answer?.task);
  const title = str(t?.title);
  if (answer?.result === "ALREADY_DONE") return { tone: "good", line: title ? `You've already done “${title}”.` : "You've already done that one." };
  const pts = mode === "points" ? whole(t?.points) : 0;
  return { tone: "good", line: title ? `Done: ${title}${pts > 0 ? ` (+${plural(pts, "point")})` : ""}.` : "Done." };
}

/**
 * A code refused (§8.2, §11): `{tone: "bad", line, lockFor?, reload?}`.
 * `lockFor` (seconds): no more tries from here until then. `reload`: the
 * card has changed (the quest closed): read it again.
 */
export function describeCodeRefusal(error, now = Date.now()) {
  const f = apiFailure(error);
  const errors = obj(f.errors) || {};
  switch (f.code) {
    case "QUEST_CODE_WRONG": {
      const left = num(errors.left);
      if (left === 0) return { tone: "bad", line: "That isn't one of this quest's codes, and that was the last try for now. Try again later.", lockFor: 600 };
      return { tone: "bad", line: `That isn't one of this quest's codes.${left !== null ? ` ${plural(left, "try", "tries")} left this hour.` : " Check it and try again."}` };
    }
    case "QUEST_CODE_NOT_OPEN": {
      const opens = iso(errors.opens_at);
      const closes = iso(errors.closes_at);
      if (opens && new Date(opens).getTime() > now) return { tone: "bad", line: `Right code, but it counts from ${whenShort(opens, now)}. Enter it again then.` };
      if (closes) return { tone: "bad", line: `Right code, but it stopped counting ${atWhen(closes, now)}.` };
      return { tone: "bad", line: "Right code, but it doesn't count right now." };
    }
    case "QUEST_CODE_LOCKED": {
      const wait = num(errors.retry_after) ?? f.retryAfter ?? 600;
      return { tone: "bad", line: `Too many wrong codes. Try again in ${minutesWord(wait)}.`, lockFor: wait };
    }
    case "QUEST_NOT_REGISTERED":
      return { tone: "bad", line: "Codes count for guests with a ticket. Sign in with the account you registered with, or open your ticket from its email." };
    case "QUEST_CLOSED":
      return { tone: "bad", line: "The quest isn't open right now, so codes don't count.", reload: true };
    default:
      break;
  }
  if (f.status === 429) return { tone: "bad", line: `Too many tries in a row. Wait ${minutesWord(f.retryAfter || 60)}, then try again.`, lockFor: f.retryAfter || 60 };
  if (f.authExpired) return { tone: "bad", line: "Your sign-in has expired. Sign in again, then enter the code." };
  if (f.network) return { tone: "bad", line: "We couldn't check the code. Check your connection and try again." };
  return { tone: "bad", line: "That didn't go through. Try again in a moment." };
}

/** Picking a size refused (§8.3): `{tone: "bad", line, choices?, reload?}`. */
export function describeSizeRefusal(error) {
  const f = apiFailure(error);
  if (f.code === "QUEST_SIZE_GONE") {
    const choices = arr(obj(f.errors)?.choices)
      .map((x) => {
        const o = obj(x) || (typeof x === "string" ? { label: x } : null);
        const label = str(o?.label);
        return label ? { label, free: num(o?.free) === null ? null : whole(o.free) } : null;
      })
      .filter(Boolean);
    return { tone: "bad", line: choices.length ? "That size just ran out. Pick another." : "That size just ran out, and no other is free right now.", choices };
  }
  if (f.code === "QUEST_CLAIM_NOT_RESERVED" || f.status === 404) return { tone: "bad", line: "This reward changed meanwhile: here it is as it stands now.", reload: true };
  if (f.code === "QUEST_CLOSED") return { tone: "bad", line: "The quest isn't open right now.", reload: true };
  if (f.status === 429) return { tone: "bad", line: "Too many tries in a row. Wait a minute, then try again." };
  if (f.authExpired) return { tone: "bad", line: "Your sign-in has expired. Sign in again." };
  if (f.network) return { tone: "bad", line: "That didn't reach us. Check your connection and try again." };
  return { tone: "bad", line: "That didn't go through. Try again in a moment." };
}

/** A claim from a size's answer (§8.3), or null. */
export const parseClaim = (raw) => readClaim(raw);

/** The card with one reward's claim replaced (a size picked). */
export function withClaim(card, rewardId, claim) {
  if (!card || !claim) return card;
  return {
    ...card,
    milestones: card.milestones.map((m) => ({ ...m, rewards: m.rewards.map((r) => (r.id === rewardId ? { ...r, claim } : r)) })),
  };
}

/** The card with one reward's free sizes replaced (a size that just ran out). */
export function withChoices(card, rewardId, choices) {
  if (!card) return card;
  return {
    ...card,
    milestones: card.milestones.map((m) => ({
      ...m,
      rewards: m.rewards.map((r) => (r.id === rewardId && r.claim ? { ...r, claim: { ...r.claim, choices } } : r)),
    })),
  };
}

/** What became done (tasks) or unlocked (milestones) between two reads of the card: ids, and the words to say it. */
export function whatsNew(before, after) {
  if (!before?.me || !after?.me) return { ids: new Set(), line: "" };
  const was = new Set(before.tasks.filter((t) => t.me?.done).map((t) => t.id));
  const tasks = after.tasks.filter((t) => t.me?.done && !was.has(t.id));
  const unlockedBefore = new Set(before.milestones.filter((m) => m.unlocked).map((m) => m.id));
  const milestones = after.milestones.filter((m) => m.unlocked && !unlockedBefore.has(m.id));
  const parts = [];
  if (tasks.length) parts.push(`Done: ${rewardList(tasks.map((t) => t.title))}.`);
  if (milestones.length) parts.push(`Unlocked: ${rewardList(milestones.map((m) => m.title))}.`);
  return { ids: new Set([...tasks.map((t) => t.id), ...milestones.map((m) => m.id)]), line: parts.join(" ") };
}
