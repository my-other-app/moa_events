import { describe, expect, it } from "vitest";
import {
  codeDoneLine,
  describeCodeRefusal,
  describeSizeRefusal,
  parseLeaderboard,
  parsePausedCard,
  parseQuestCard,
  pausedView,
  questStatus,
  questView,
  whatsNew,
  withChoices,
  withClaim,
} from "./quests";
import { atWhen, windowLine } from "./questwords";
import { overviewCard, questCard, questTask } from "@/test/questFixture";

/*
 * The guest's quest card (feature-register/quests/CONTRACT.md §8): the
 * API's card read safely, what the card says from it, and what each refusal
 * of a code or a size means. Times are said in India time.
 */
const NOW = Date.parse("2026-11-28T05:00:00Z"); // 10:30 AM IST, the quest on (9 AM – 6 PM)
const ctx = { where: "ticket", eventId: "77", event: { id: 77, slug: "campus-devdays" }, ticketId: "MOA-DEMO-7Q2K", android: false, signedIn: false };
const view = (card = questCard(), c = ctx, now = NOW) => questView(parseQuestCard(card), c, now);
const task = (v, id) => v.tasks.find((t) => t.id === id);
const fail = (status, data, headers = {}) => ({ response: { status, data, headers } });

describe("reading the card", () => {
  it("is off for no quest, a switched-off one, or anything that isn't a card", () => {
    for (const raw of [null, undefined, "x", [], {}, { enabled: false }, { enabled: "true" }]) expect(parseQuestCard(raw)).toBeNull();
  });

  it("keeps what the card needs, safely", () => {
    const c = parseQuestCard(questCard());
    expect(c.mode).toBe("points");
    expect(c.open).toBe(true);
    expect(c.tasks.map((t) => t.kind)).toEqual(["checked_in", "network", "station", "code", "quiz_played", "feedback", "poster_made"]);
    expect(c.tasks[1]).toMatchObject({ target: 5, action: "network_scan", me: { count: 2, done: false } });
    expect(c.tasks[2].station).toEqual({ name: "Cloud booth" });
    expect(c.milestones.map((m) => m.threshold)).toEqual([10, 30]);
    expect(c.milestones[0].rewards[0].claim).toMatchObject({ id: "c-1", status: "reserved", needsSize: false });
    expect(c.me).toMatchObject({ points: 10, tasksDone: 2, requiredLeft: 0, rank: 14, codeAttemptsLeft: 10, next: { milestoneId: "m-2", left: 20 } });
    expect(c.desks).toEqual(["Swag desk"]);
    // The site's own links become its paths, so they open wherever the site runs.
    expect(c.links).toEqual({ liveRoom: "/events/campus-devdays/live", feedback: null, poster: "/posters/MOA-DEMO-7Q2K", club: "/clubs/riverside-dev-circle" });
  });

  it("reads checkmarks as the default mode, and drops broken rows", () => {
    const c = parseQuestCard(
      questCard({
        mode: "weird",
        tasks: [{ title: "no id" }, questTask({ kind: "teleport", action: "beam" })],
        milestones: [{ title: "no id" }, { id: "m", threshold: "3", rewards: [{ name: "no id" }, { reward_id: "r", photo_url: "javascript:alert(1)", claim: { claim_id: "c", status: "stolen" } }] }],
      }),
    );
    expect(c.mode).toBe("checkmarks");
    expect(c.tasks).toHaveLength(1);
    expect(c.tasks[0]).toMatchObject({ kind: "other", action: null });
    expect(c.milestones).toHaveLength(1);
    expect(c.milestones[0].threshold).toBe(3);
    expect(c.milestones[0].rewards).toEqual([{ id: "r", name: "A reward", photo: null, sizes: false, soldOut: false, claim: null }]);
  });

  it("orders milestones by their threshold", () => {
    const card = questCard();
    card.milestones.reverse();
    expect(parseQuestCard(card).milestones.map((m) => m.id)).toEqual(["m-1", "m-2"]);
  });

  it("reads the leaderboard", () => {
    expect(parseLeaderboard({ mode: "points", rows: [{ rank: 1, name: "Asha K.", score: 120, me: false }, { rank: 2, score: 3 }], me: { rank: 14, score: 40 } })).toEqual({
      rows: [{ rank: 1, name: "Asha K.", points: 120, me: false }],
      me: { rank: 14, points: 40 },
    });
    expect(parseLeaderboard(null)).toEqual({ rows: [], me: null });
  });
});

describe("where the quest stands", () => {
  const c = (o) => parseQuestCard(questCard(o));
  it("is open when the API says so, else not started, ended or closed by its window", () => {
    expect(questStatus(c(), NOW)).toBe("open");
    expect(questStatus(c({ open: false }), Date.parse("2026-11-28T02:00:00Z"))).toBe("upcoming");
    expect(questStatus(c({ open: false }), Date.parse("2026-11-28T13:00:00Z"))).toBe("ended");
    expect(questStatus(c({ open: false, starts_at: null, ends_at: null }), NOW)).toBe("closed");
  });
});

describe("what the card says", () => {
  it("gives the score, the progress to the next milestone and what to collect", () => {
    const v = view();
    expect(v.title).toBe("DevDays Quest");
    expect(v.score).toEqual({ value: 10, unit: "points" });
    expect(v.rank).toBe(14);
    expect(v.meter).toEqual({ value: 10, max: 30, marks: [10, 30], label: "10 points of 30" });
    expect(v.next).toBe("20 more points to unlock Tier 2: DevDays T-shirt.");
    expect(v.notes.map((n) => n.key)).toEqual(["collect"]);
    expect(v.notes[0].line).toBe("You've unlocked Sticker pack: collect it at Swag desk.");
  });

  it("says each task's progress, what to do and the way to do it", () => {
    const v = view();
    expect(task(v, "t-in")).toMatchObject({ done: true, action: null, doneLine: "Done at 9:12 AM" });
    expect(task(v, "t-net")).toMatchObject({ done: false, count: { have: 2, need: 5, unit: "people" } });
    expect(task(v, "t-net").how).toMatch(/Scan the personal QR of 5 people you meet, in the MyOtherApp app/);
    // On an iPhone or a desk, the site's own page says where the scanner is.
    expect(task(v, "t-net").action).toEqual({ kind: "network_scan", label: "Open the app to scan", href: "/network?event=77&scan=1", external: false });
    expect(task(v, "t-booth")).toMatchObject({ how: "Get your ticket scanned at Cloud booth.", action: null });
    expect(task(v, "t-code")).toMatchObject({ how: "Find the code at the event and enter it below.", action: null });
    expect(task(v, "t-quiz").action).toMatchObject({ label: "Open the live room", href: "/events/campus-devdays/live" });
    // No survey link yet: no button, and a word on when it comes.
    expect(task(v, "t-fb")).toMatchObject({ action: null, how: "The feedback form opens near the end: its link comes by email." });
    expect(task(v, "t-poster")).toMatchObject({ done: true, action: null });
  });

  it("opens the app itself on Android", () => {
    const v = view(questCard(), { ...ctx, android: true });
    expect(task(v, "t-net").action.href).toBe(
      "intent://myotherapp.in/network?event=77&scan=1#Intent;scheme=https;package=app.myotherapp.in;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dapp.myotherapp.in;end",
    );
    expect(task(v, "t-net").action.external).toBe(true);
  });

  it("links the survey once it's open, and the ticket from the event's page", () => {
    const card = questCard({ links: { ...questCard().links, feedback: "https://myotherapp.in/feedback/77/reg-1?k=abc" } });
    card.tasks[0].me = { count: 0, done: false, done_at: null, source: null };
    const onEvent = view(card, { ...ctx, where: "event", ticketId: null, signedIn: true });
    expect(task(onEvent, "t-fb").action).toMatchObject({ label: "Give feedback", href: "/feedback/77/reg-1?k=abc" });
    expect(task(onEvent, "t-in").action).toMatchObject({ label: "My tickets", href: "/me/tickets" });
    // Under the ticket, the ticket is right there.
    expect(task(view(card), "t-in").action).toBeNull();
  });

  it("builds the live room and poster links when the card has none", () => {
    const v = view(questCard({ links: {} }));
    expect(task(v, "t-quiz").action.href).toBe("/events/campus-devdays/live");
    const p = questCard({ links: {} });
    p.tasks[6].me = { count: 0, done: false };
    expect(task(view(p), "t-poster").action).toMatchObject({ label: "Make your poster", href: "/posters/MOA-DEMO-7Q2K" });
  });

  it("uses the organisers' own description when they wrote one", () => {
    const card = questCard();
    card.tasks[2].description = "Find us next to the coffee.";
    expect(task(view(card), "t-booth").how).toBe("Find us next to the coffee.");
  });

  it("says a task's own time, and offers no button outside it", () => {
    const card = questCard();
    card.tasks[4] = { ...card.tasks[4], starts_at: "2026-11-28T08:30:00Z", ends_at: "2026-11-28T09:30:00Z" };
    const t = task(view(card), "t-quiz");
    expect(t.when).toBe("2:00 PM – 3:00 PM");
    expect(t.locked).toBe(true);
    expect(t.action).toBeNull();
    expect(windowLine("2026-11-28T08:30:00Z", null, NOW)).toBe("Opens at 2:00 PM");
    expect(windowLine(null, "2026-11-28T09:30:00Z", NOW)).toBe("Until 3:00 PM");
    expect(windowLine(null, "2026-11-28T04:00:00Z", NOW)).toBe("Closed");
    expect(atWhen("2026-11-29T04:00:00Z", NOW)).toBe("on Sun, 29 Nov at 9:30 AM");
  });

  it("holds rewards back until the required tasks are done, and says which", () => {
    const card = questCard();
    card.tasks[0].me = { count: 0, done: false };
    card.me.required_left = 1;
    expect(view(card).next).toBe("Rewards unlock once the required task is done: “Check in”.");
  });

  it("says when every milestone is reached", () => {
    const card = questCard();
    card.milestones[1].unlocked = true;
    card.me.next = null;
    expect(view(card).next).toBe("You've reached every milestone.");
  });

  it("counts tasks in checkmarks mode", () => {
    const card = questCard({ mode: "checkmarks", milestones: [{ ...questCard().milestones[0], threshold: 2 }, { ...questCard().milestones[1], threshold: 5 }] });
    card.me.next = { milestone_id: "m-2", title: "Tier 2", threshold: 5, left: 3 };
    const v = view(card);
    expect(v.score).toEqual({ value: "2/7", unit: "done" });
    expect(v.meter).toMatchObject({ value: 2, max: 5, label: "2 of 5 tasks done" });
    expect(v.next).toBe("3 more tasks to unlock Tier 2: DevDays T-shirt.");
    expect(v.milestones[1]).toMatchObject({ atLine: "After 5 tasks", needLine: "3 tasks to go" });
  });

  it("before the start: when it starts, no score, no bar, no code box", () => {
    const v = view(questCard({ open: false }), ctx, Date.parse("2026-11-27T12:00:00Z"));
    expect(v.status).toBe("upcoming");
    expect(v.notes[0].line).toBe("The quest starts on Sat, 28 Nov at 9:00 AM. Tasks count from then.");
    expect(v.score).toBeNull();
    expect(v.meter).toBeNull();
    expect(v.hasCodes).toBe(false);
    expect(v.tasks.every((t) => t.action === null && t.count === null)).toBe(true);
    expect(v.milestones.every((m) => m.needLine === null)).toBe(true);
    expect(v.leaderboard).toBe(false);
  });

  it("after the end: when it ended, what to collect still, and nothing to do", () => {
    const v = view(questCard({ open: false }), ctx, Date.parse("2026-11-28T13:00:00Z"));
    expect(v.status).toBe("ended");
    expect(v.notes.map((n) => n.line)).toEqual(["The quest ended at 6:00 PM.", "You've unlocked Sticker pack: collect it at Swag desk."]);
    expect(v.hasCodes).toBe(false);
    expect(v.tasks.every((t) => t.action === null && t.how === null)).toBe(true);
    // Nothing more counts: no "more to unlock", no "to go"; the leaderboard stays (the final standings).
    expect(v.next).toBeNull();
    expect(v.milestones.every((m) => m.needLine === null)).toBe(true);
    expect(v.leaderboard).toBe(true);
  });

  it("a task the organisers took back: said so, with nothing to do", () => {
    const card = questCard();
    card.tasks[2].me = { count: 1, done: false, done_at: null, source: null, revoked: true };
    expect(task(view(card), "t-booth")).toMatchObject({ done: false, action: null, how: "The organisers took this one back. Ask them if you think that's a mistake." });
  });

  it("never says a task's title over again as what to do", () => {
    const card = questCard();
    card.tasks[6] = { ...card.tasks[6], title: "Make your “I'm attending” poster", me: { count: 0, done: false } };
    expect(task(view(card), "t-poster").how).toBeNull();
  });

  it("without a ticket: no ticks or buttons, and how to take part", () => {
    const signedOut = view(overviewCard(), { ...ctx, where: "event", canRegister: true });
    expect(signedOut.signedUp).toBe(false);
    expect(signedOut.score).toBeNull();
    expect(signedOut.meter).toBeNull();
    expect(signedOut.tasks.every((t) => !t.done && t.action === null && t.count === null)).toBe(true);
    expect(signedOut.milestones.every((m) => m.rewards.every((r) => r.state === "locked"))).toBe(true);
    expect(signedOut.notes[0].line).toBe("Register to take part. Already have a ticket? Sign in, or open your ticket from its email, to see your progress.");
    expect(signedOut.leaderboard).toBe(false);
    const signedIn = view(overviewCard(), { ...ctx, where: "event", signedIn: true, canRegister: true });
    expect(signedIn.notes[0].line).toBe("Register for the event to take part: your tasks and rewards show here once you have a ticket.");
    const closed = view(overviewCard(), { ...ctx, where: "event", signedIn: true, canRegister: false });
    expect(closed.notes[0].line).toBe("Guests with a ticket take part: your progress shows here once you have one.");
  });

  it("the code box: while a code task is left, with the tries left when few, and locked at none", () => {
    expect(view()).toMatchObject({ hasCodes: true, codeHint: null, codeLock: null });
    const few = questCard();
    few.me.code_attempts_left = 2;
    expect(view(few).codeHint).toBe("2 tries left this hour.");
    const none = questCard();
    none.me.code_attempts_left = 0;
    expect(view(none).codeLock).toMatch(/No tries left for now/);
    const done = questCard();
    done.tasks[3].me = { count: 1, done: true };
    expect(view(done)).toMatchObject({ hasCodes: true, codeHint: "You've entered every code.", codeLock: null });
    expect(view(questCard({ tasks: [questTask()] })).hasCodes).toBe(false);
  });
});

describe("rewards", () => {
  const reward = (claim, over = {}) => {
    const card = questCard();
    card.milestones[0].rewards[0] = { ...card.milestones[0].rewards[0], sizes: true, ...over, claim };
    return view(card).milestones[0].rewards[0];
  };
  const claim = (o) => ({ claim_id: "c-1", status: "reserved", needs_size: false, variant_label: null, choices: [], waitlist_position: null, collected_at: null, ...o });

  it("reserved: where to collect it, and its size", () => {
    expect(reward(claim({ variant_label: "M", choices: [{ label: "L", free: 4 }] }))).toMatchObject({
      state: "unlocked",
      size: "M",
      canPickSize: true,
      line: "Collect it at Swag desk: show your ticket there.",
      sizes: [
        { id: "M", label: "M", left: null },
        { id: "L", label: "L", left: 4 },
      ],
    });
  });

  it("reserved without a size: pick one first", () => {
    const r = reward(claim({ needs_size: true, choices: [{ label: "S", free: 1 }, { label: "M", free: 0 }] }));
    expect(r).toMatchObject({ needsSize: true, canPickSize: true, line: "Pick your size, then collect it at Swag desk: show your ticket there." });
  });

  it("waiting list, sold out, collected", () => {
    expect(reward(claim({ status: "waitlisted", waitlist_position: 3 }))).toMatchObject({ state: "waitlist", canPickSize: false });
    expect(reward(claim({ status: "waitlisted", waitlist_position: 3 })).line).toMatch(/number 3 in line/);
    expect(reward(claim({ status: "sold_out" }))).toMatchObject({ state: "sold_out", line: "These ran out just before you unlocked it." });
    expect(reward(claim({ status: "collected", variant_label: "M", collected_at: "2026-11-28T04:44:00Z" }))).toMatchObject({ state: "collected", line: "Collected at 10:14 AM." });
    // Where it was handed over, never by whom.
    expect(reward(claim({ status: "collected", collected_at: "2026-11-28T04:44:00Z", door: "Swag desk" })).line).toBe("Collected at Swag desk at 10:14 AM.");
    expect(reward(claim({ status: "released" })).state).toBe("locked");
  });

  it("a locked reward that's gone says so (first come, first served)", () => {
    const card = questCard();
    card.milestones[1].rewards[0].sold_out = true;
    expect(view(card).milestones[1].rewards[0]).toMatchObject({ state: "sold_out", line: "All gone: first come, first served." });
  });

  it("names every swag desk", () => {
    const card = questCard({ collect_at: [{ name: "Desk A" }, { name: "Desk B" }] });
    expect(view(card).notes[0].line).toBe("You've unlocked Sticker pack: collect it at Desk A and Desk B.");
    expect(view(questCard({ collect_at: [] })).notes[0].line).toBe("You've unlocked Sticker pack: collect it at the swag desk.");
  });

  it("replaces a claim or its free sizes in place", () => {
    const c = parseQuestCard(questCard());
    const next = withClaim(c, "r-stick", { id: "c-1", status: "reserved", size: "L", choices: [], needsSize: false });
    expect(next.milestones[0].rewards[0].claim.size).toBe("L");
    expect(c.milestones[0].rewards[0].claim.size).toBeNull();
    expect(withChoices(c, "r-stick", [{ label: "XL", free: 1 }]).milestones[0].rewards[0].claim.choices).toEqual([{ label: "XL", free: 1 }]);
  });
});

describe("what's new since the last read", () => {
  it("names the tasks just done and the milestones just reached", () => {
    const before = parseQuestCard(questCard());
    const raw = questCard();
    raw.tasks[2].me = { count: 1, done: true, done_at: "2026-11-28T05:00:00Z" };
    raw.milestones[1].unlocked = true;
    const n = whatsNew(before, parseQuestCard(raw));
    expect([...n.ids]).toEqual(["t-booth", "m-2"]);
    expect(n.line).toBe("Done: Visit the Cloud booth. Unlocked: Tier 2.");
    expect(whatsNew(null, before).ids.size).toBe(0);
  });
});

describe("codes", () => {
  it("says what counted", () => {
    expect(codeDoneLine({ result: "DONE", task: { title: "Keynote secret word", points: 5 } }, "points")).toEqual({ tone: "good", line: "Done: Keynote secret word (+5 points)." });
    expect(codeDoneLine({ result: "DONE", task: { title: "Keynote secret word", points: 5 } }, "checkmarks").line).toBe("Done: Keynote secret word.");
    expect(codeDoneLine({ result: "ALREADY_DONE", task: { title: "Keynote secret word" } }).line).toBe("You've already done “Keynote secret word”.");
  });

  it("says why one didn't, with the tries left and the locks", () => {
    expect(describeCodeRefusal(fail(404, { error_code: "QUEST_CODE_WRONG", errors: { left: 4 } }))).toEqual({ tone: "bad", line: "That isn't one of this quest's codes. 4 tries left this hour." });
    expect(describeCodeRefusal(fail(404, { error_code: "QUEST_CODE_WRONG", errors: { left: 0 } }))).toMatchObject({ lockFor: 600 });
    // The last try with the server's wait: locked for that long, not a guess.
    expect(describeCodeRefusal(fail(404, { error_code: "QUEST_CODE_WRONG", errors: { left: 0, retry_after: 3540 } }))).toMatchObject({ lockFor: 3540 });
    expect(describeCodeRefusal(fail(429, { error_code: "QUEST_CODE_LOCKED", errors: { retry_after: 1500 } }))).toEqual({ tone: "bad", line: "Too many wrong codes. Try again in 25 minutes.", lockFor: 1500 });
    expect(describeCodeRefusal(fail(409, { error_code: "QUEST_CODE_NOT_OPEN", errors: { opens_at: "2026-11-28T08:30:00Z" } }), NOW).line).toBe("Right code, but it counts from 2:00 PM. Enter it again then.");
    expect(describeCodeRefusal(fail(409, { error_code: "QUEST_CODE_NOT_OPEN", errors: { closes_at: "2026-11-28T04:30:00Z" } }), NOW).line).toBe("Right code, but it stopped counting at 10:00 AM.");
    expect(describeCodeRefusal(fail(409, { error_code: "QUEST_CLOSED" }))).toMatchObject({ reload: true });
    expect(describeCodeRefusal(fail(403, { error_code: "QUEST_NOT_REGISTERED" })).line).toMatch(/guests with a ticket/);
    expect(describeCodeRefusal(fail(429, null, { "retry-after": "30" }))).toMatchObject({ line: "Too many tries in a row. Wait a minute, then try again.", lockFor: 30 });
    expect(describeCodeRefusal(new Error("offline")).line).toBe("We couldn't check the code. Check your connection and try again.");
    expect(describeCodeRefusal({ authExpired: true }).line).toMatch(/sign-in has expired/);
    expect(describeCodeRefusal(fail(500, {})).line).toBe("That didn't go through. Try again in a moment.");
    expect(describeCodeRefusal(fail(409, { error_code: "QUEST_TASK_REVOKED" })).line).toMatch(/took that task back/);
  });
});

describe("sizes", () => {
  it("says why a size didn't go, with what's left", () => {
    expect(describeSizeRefusal(fail(409, { error_code: "QUEST_SIZE_GONE", errors: { choices: [{ label: "L", free: 2 }, "XL"] } }))).toEqual({
      tone: "bad",
      line: "That size just ran out. Pick another.",
      choices: [
        { label: "L", free: 2 },
        { label: "XL", free: null },
      ],
    });
    expect(describeSizeRefusal(fail(409, { error_code: "QUEST_SIZE_GONE", errors: {} })).line).toBe("That size just ran out, and no other is free right now.");
    expect(describeSizeRefusal(fail(409, { error_code: "QUEST_CLAIM_NOT_RESERVED" }))).toMatchObject({ reload: true });
    expect(describeSizeRefusal(fail(422, { errors: { choices: [{ label: "S", free: 1 }] } }))).toEqual({ tone: "bad", line: "That isn't one of the sizes. Pick one of these.", choices: [{ label: "S", free: 1 }] });
    expect(describeSizeRefusal(new Error("offline")).line).toMatch(/connection/);
  });
});

describe("tidy-ups after the screenshots", () => {
  it("says a task the organisers marked done was marked by them", () => {
    const card = questCard();
    card.tasks[0].me = { count: 1, done: true, done_at: "2026-11-28T03:42:00Z", source: "grant" };
    expect(task(view(card), "t-in").doneLine).toBe("Marked done by the organisers at 9:12 AM");
    card.tasks[0].me = { count: 1, done: true, done_at: null, source: "grant" };
    expect(task(view(card), "t-in").doneLine).toBe("Marked done by the organisers");
    // Earned ones are as they were.
    card.tasks[0].me = { count: 1, done: true, done_at: "2026-11-28T03:42:00Z", source: "station" };
    expect(task(view(card), "t-in").doneLine).toBe("Done at 9:12 AM");
  });

  const paused = (rewards, over = {}) => ({ enabled: false, paused: { title: "DevDays Quest", rewards, collect_at: [{ door_id: "d-9", name: "Swag desk" }], ...over } });
  const row = (o) => ({ claim_id: "c-1", reward_id: "r-1", milestone: "Tier 2", name: "T-shirt", status: "reserved", needs_size: false, variant_label: "M", choices: [], waitlist_position: null, collected_at: null, collected_by: null, door: null, ...o });

  it("reads a quest switched off with something held as a paused card, and nothing else", () => {
    expect(parsePausedCard(paused([row()]))).toEqual({ paused: true, title: "DevDays Quest", held: [{ name: "T-shirt", size: "M", needsSize: false }], waiting: [], desks: ["Swag desk"] });
    for (const raw of [null, { enabled: false }, { enabled: false, paused: null }, paused([]), paused([row({ status: "collected" })]), { ...questCard(), paused: { rewards: [row()] } }]) expect(parsePausedCard(raw)).toBeNull();
    // Never read as a live card.
    expect(parseQuestCard(paused([row()]))).toBeNull();
  });

  it("says what is still held and where, and the place in line", () => {
    expect(pausedView(parsePausedCard(paused([row()])))).toEqual({
      title: "DevDays Quest",
      line: "Quests are paused.",
      lines: [{ key: "held", icon: "gift", tone: "good", line: "Your T-shirt (M) is still held for you — collect it at Swag desk." }],
    });
    const two = pausedView(parsePausedCard(paused([row({ name: "Sticker pack", variant_label: null }), row({ claim_id: "c-2", needs_size: true, variant_label: null }), row({ claim_id: "c-3", name: "Hoodie", status: "waitlisted", variant_label: null, waitlist_position: 2 })], { collect_at: [] })));
    expect(two.lines.map((l) => l.line)).toEqual([
      "Your Sticker pack and T-shirt are still held for you — collect them at the swag desk. Say your size there.",
      "You're still number 2 in line for the Hoodie: one is kept for you as soon as one frees up.",
    ]);
  });

  it("keeps the leaderboard's ranks as the server gives them", () => {
    const b = parseLeaderboard({ rows: [{ rank: 1, name: "A K.", score: 40 }, { rank: 2, name: "B K.", score: 40 }, { rank: 3, name: "C K.", score: 40 }], me: { rank: 2, score: 40 } });
    expect(b.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(b.me).toEqual({ rank: 2, points: 40 });
  });
});
