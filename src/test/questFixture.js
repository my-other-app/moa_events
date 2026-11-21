/**
 * GET /events/{id}/quest answers for the tests (feature-register/quests/
 * CONTRACT.md §8.1): one guest's card, part way through, in points mode.
 * Invented people and swag.
 */
export const EVENT_ID = 77;

export function questTask(over = {}, me = {}) {
  return {
    id: "t-net",
    kind: "network",
    title: "Meet 5 people",
    description: null,
    points: 10,
    required: false,
    starts_at: null,
    ends_at: null,
    target: 5,
    action: "network_scan",
    station: null,
    me: me === null ? null : { count: 2, done: false, done_at: null, source: null, ...me },
    ...over,
  };
}

export function questCard(over = {}) {
  return {
    enabled: true,
    id: "q-1",
    title: "DevDays Quest",
    intro: "Do the tasks, unlock the swag.",
    mode: "points",
    starts_at: "2026-11-28T03:30:00Z",
    ends_at: "2026-11-28T12:30:00Z",
    open: true,
    leaderboard: true,
    tasks: [
      questTask({ id: "t-in", kind: "checked_in", title: "Check in", points: 5, required: true, target: 1, action: "ticket" }, { count: 1, done: true, done_at: "2026-11-28T03:42:00Z", source: "auto" }),
      questTask(),
      questTask({ id: "t-booth", kind: "station", title: "Visit the Cloud booth", points: 10, target: 1, action: "station", station: { door_id: "d-1", name: "Cloud booth" } }, { count: 0 }),
      questTask({ id: "t-code", kind: "code", title: "Keynote secret word", points: 5, target: 1, action: "code" }, { count: 0 }),
      questTask({ id: "t-quiz", kind: "quiz_played", title: "Play the quiz", points: 5, target: 1, action: "live_room" }, { count: 0 }),
      questTask({ id: "t-fb", kind: "feedback", title: "Give feedback", points: 5, target: 1, action: "feedback" }, { count: 0 }),
      questTask({ id: "t-poster", kind: "poster_made", title: "Make your poster", points: 5, target: 1, action: "poster" }, { count: 1, done: true, done_at: "2026-11-27T10:00:00Z", source: "auto" }),
    ],
    milestones: [
      {
        id: "m-1",
        title: "Tier 1",
        threshold: 10,
        unlocked: true,
        unlocked_at: "2026-11-28T03:45:00Z",
        rewards: [
          {
            reward_id: "r-stick",
            name: "Sticker pack",
            photo_url: null,
            sizes: false,
            sold_out: false,
            claim: { claim_id: "c-1", status: "reserved", needs_size: false, variant_label: null, choices: [], waitlist_position: null, collected_at: null },
          },
        ],
      },
      {
        id: "m-2",
        title: "Tier 2",
        threshold: 30,
        unlocked: false,
        unlocked_at: null,
        rewards: [{ reward_id: "r-tee", name: "DevDays T-shirt", photo_url: "https://cdn.example/tee.jpg", sizes: true, sold_out: false, claim: null }],
      },
    ],
    me: {
      registration_id: "reg-1",
      points: 10,
      tasks_done: 2,
      required_left: 0,
      next: { milestone_id: "m-2", title: "Tier 2", threshold: 30, left: 20 },
      rank: 14,
      code_attempts_left: 10,
    },
    collect_at: [{ door_id: "d-9", name: "Swag desk" }],
    links: { live_room: "https://myotherapp.in/events/campus-devdays/live", feedback: null, poster: "https://myotherapp.in/posters/MOA-DEMO-7Q2K", club: "https://myotherapp.in/clubs/riverside-dev-circle" },
    ...over,
  };
}

/** The same card as a visitor (or someone with no ticket) gets it: no `me` anywhere. */
export function overviewCard(over = {}) {
  const c = questCard(over);
  return {
    ...c,
    tasks: c.tasks.map((t) => ({ ...t, me: null })),
    milestones: c.milestones.map((m) => ({ ...m, unlocked: false, unlocked_at: null, rewards: m.rewards.map((r) => ({ ...r, claim: null })) })),
    me: null,
    ...over,
  };
}
