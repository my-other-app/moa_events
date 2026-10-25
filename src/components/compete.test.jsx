import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * The competition page (/events/{slug}/compete), a registered guest's side
 * of it: the tracks, making or joining a team, looking for teammates, the
 * team itself, the submission, the mentors' slots and the leaderboard. The
 * API is mocked; each call answers with the guest's whole state again
 * (MyState), as the API does.
 */
vi.mock("@/api/competition", () => ({
  errorLine: (e, f) => e?.response?.data?.message || f,
  competitionApi: {
    me: vi.fn(),
    makeTeam: vi.fn(),
    joinTeam: vi.fn(),
    leaveTeam: vi.fn(),
    renameTeam: vi.fn(),
    seeking: vi.fn(),
    submit: vi.fn(),
    book: vi.fn(),
    free: vi.fn(),
    leaderboard: vi.fn(),
  },
}));

const { competitionApi: api } = await import("@/api/competition");
const { default: Compete } = await import("./compete.jsx");

const TRACKS = [
  { id: 1, name: "Edge AI", description: "Models on microcontrollers", sponsor: "Espressif", prize: "₹20,000", sort_order: 0, teams: 3 },
  { id: 2, name: "Open hardware", description: null, sponsor: null, prize: null, sort_order: 1, teams: 1 },
];
const REQUIREMENTS = [
  { key: "repo", label: "Code repository", required: true },
  { key: "video", label: "Demo video", required: true },
  { key: "slides", label: "Slides", required: false },
];

/** GET /competition/me for someone without a team yet. */
const state = (over = {}) => ({
  event_id: 68,
  enabled: true,
  registration_id: "r1",
  name: "Asha Rao",
  team_min: 2,
  team_max: 4,
  teams_locked: false,
  tracks: TRACKS,
  requirements: REQUIREMENTS,
  submissions_open: true,
  submissions_close_at: "2026-10-19T12:30:00Z",
  team: null,
  open_teams: [{ id: 12, name: "Null Pointers", track: "Open hardware", members: 3, open_spots: 1 }],
  seeking: null,
  seekers: [{ registration_id: "r9", name: "Kiran", skills: ["PCB", "Rust"] }],
  mentors: [],
  board: null,
  ...over,
});

const team = (over = {}) => ({
  id: 11,
  name: "Blinkenlights",
  track_id: 1,
  track: "Edge AI",
  stage: "entered",
  members: [
    { registration_id: "r1", name: "Asha Rao" },
    { registration_id: "r2", name: "Rohan P." },
  ],
  open_spots: 2,
  submission: { fields: { repo: "https://github.com/circuit/blink" }, status: "in_progress", missing: ["video"], completed_at: null, updated_at: null },
  score: null,
  judges_scored: 0,
  created_at: "2026-10-18T10:00:00Z",
  ...over,
});

const onTeam = (over = {}, teamOver = {}) => state({ team: team(teamOver), open_teams: [], seekers: [], ...over });

const open = (props = { eventId: "68", eventSlug: "hack-night-04" }) =>
  render(
    <MemoryRouter initialEntries={["/events/hack-night-04/compete"]}>
      <Compete {...props} />
    </MemoryRouter>
  );

const section = (name) => screen.getByRole("heading", { level: 2, name }).closest("section");

// The visitor's clock is not India's: the slots and the deadline must still read in India time.
const TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Europe/London";
});
afterAll(() => {
  process.env.TZ = TZ;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loading the page", () => {
  it("has the way back to the event and says it is loading", () => {
    api.me.mockReturnValue(new Promise(() => {}));
    open();
    expect(screen.getByRole("heading", { level: 1, name: "Competition" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Event" })).toHaveAttribute("href", "/events/hack-night-04");
    expect(screen.getByRole("status")).toHaveTextContent("Loading your team…");
    expect(api.me).toHaveBeenCalledWith("68");
  });

  it("goes back by the event's id when it has no slug", () => {
    api.me.mockReturnValue(new Promise(() => {}));
    open({ eventId: "68" });
    expect(screen.getByRole("link", { name: "← Event" })).toHaveAttribute("href", "/68");
  });

  it.each([
    [403, "Register for the event first, then come back here from your ticket."],
    [404, "This event has no competition."],
    [401, "Sign in from your ticket to see your team."],
    [undefined, "Could not load. Check your connection and try again."],
  ])("says why it can't show the team (%s), and tries again", async (status, line) => {
    api.me.mockRejectedValueOnce(status ? { response: { status } } : new Error("offline")).mockResolvedValueOnce(state());
    open();
    expect(await screen.findByText(line)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Find your team" })).toBeInTheDocument();
    expect(screen.queryByText(line)).toBeNull();
  });
});

describe("the tracks", () => {
  it("lists each with what it is about, its sponsor, its prize and how many teams are on it", async () => {
    api.me.mockResolvedValue(state());
    open();
    const tracks = (await screen.findByRole("heading", { level: 2, name: "Tracks" })).closest("section");
    const items = within(tracks).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Edge AI");
    expect(items[0]).toHaveTextContent("Models on microcontrollers");
    expect(items[0]).toHaveTextContent("Sponsored by Espressif · ₹20,000 · 3 teams");
    expect(items[1]).toHaveTextContent("Open hardware");
    expect(within(items[1]).getByText("1 team")).toBeInTheDocument();
  });

  it("aren't shown when the competition has none, and then nobody is asked to pick one", async () => {
    api.me.mockResolvedValue(state({ tracks: [] }));
    open();
    await screen.findByRole("heading", { level: 2, name: "Find your team" });
    expect(screen.queryByRole("heading", { level: 2, name: "Tracks" })).toBeNull();
    expect(screen.queryByLabelText("Track")).toBeNull();
  });
});

describe("making or joining a team", () => {
  it("makes a team on the track picked, then shows it", async () => {
    api.me.mockResolvedValue(state());
    api.makeTeam.mockResolvedValue(onTeam());
    open();
    const make = await screen.findByRole("button", { name: "Make a team" });
    expect(screen.getByText(/Teams are 2 to 4 people/)).toBeInTheDocument();
    expect(make).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "  Blinkenlights " } });
    fireEvent.change(screen.getByLabelText("Track"), { target: { value: "1" } });
    fireEvent.click(make);
    await waitFor(() => expect(api.makeTeam).toHaveBeenCalledWith("68", "Blinkenlights", 1));
    expect(await screen.findByRole("heading", { level: 2, name: "Blinkenlights" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Find your team" })).toBeNull();
  });

  it("makes a team with no track when none is picked", async () => {
    api.me.mockResolvedValue(state());
    api.makeTeam.mockResolvedValue(onTeam({}, { track_id: null, track: null }));
    open();
    fireEvent.change(await screen.findByLabelText("Team name"), { target: { value: "Solo Act" } });
    fireEvent.click(screen.getByRole("button", { name: "Make a team" }));
    await waitFor(() => expect(api.makeTeam).toHaveBeenCalledWith("68", "Solo Act", null));
    expect(await screen.findByText(/No track yet · 2 of 4/)).toBeInTheDocument();
  });

  it("says a fixed team size as one number", async () => {
    api.me.mockResolvedValue(state({ team_min: 3, team_max: 3 }));
    open();
    expect(await screen.findByText(/Teams are 3 people/)).toBeInTheDocument();
  });

  it("joins an open team", async () => {
    api.me.mockResolvedValue(state());
    api.joinTeam.mockResolvedValue(onTeam({}, { id: 12, name: "Null Pointers", track: "Open hardware", track_id: 2 }));
    open();
    const row = (await screen.findByText("Null Pointers")).closest("li");
    expect(row).toHaveTextContent("Open hardware · 3 of 4");
    fireEvent.click(within(row).getByRole("button", { name: "Join" }));
    await waitFor(() => expect(api.joinTeam).toHaveBeenCalledWith("68", 12));
    expect(await screen.findByRole("heading", { level: 2, name: "Null Pointers" })).toBeInTheDocument();
  });

  it("says so when there are no open teams", async () => {
    api.me.mockResolvedValue(state({ open_teams: [] }));
    open();
    expect(await screen.findByText("No open teams yet.")).toBeInTheDocument();
  });

  it("says the server's reason when a team can't be joined, and stays", async () => {
    api.me.mockResolvedValue(state());
    api.joinTeam.mockRejectedValue({ response: { status: 409, data: { message: "That team is full" } } });
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Join" }));
    expect(await screen.findByRole("status")).toHaveTextContent("That team is full");
    expect(screen.getByRole("heading", { level: 2, name: "Find your team" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join" })).toBeEnabled();
  });

  it("falls back to a plain line when the server gives no reason", async () => {
    api.me.mockResolvedValue(state());
    api.makeTeam.mockRejectedValue(new Error("offline"));
    open();
    fireEvent.change(await screen.findByLabelText("Team name"), { target: { value: "Blinkenlights" } });
    fireEvent.click(screen.getByRole("button", { name: "Make a team" }));
    expect(await screen.findByRole("status")).toHaveTextContent("That did not go through");
  });

  it("can't make, join or look for a team once teams are locked", async () => {
    api.me.mockResolvedValue(state({ teams_locked: true }));
    open();
    expect(await screen.findByText("Teams are locked. Ask the organisers to move you.")).toBeInTheDocument();
    expect(screen.getByLabelText("Team name")).toBeDisabled();
    expect(screen.getByLabelText("Track")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Make a team" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Find me teammates/ })).toBeDisabled();
  });
});

describe("looking for teammates", () => {
  it("lists you as looking, then saves what you bring when you leave the box", async () => {
    api.me.mockResolvedValue(state());
    api.seeking.mockResolvedValueOnce(state({ seeking: { registration_id: "r1", name: "Asha Rao", skills: [] } })).mockResolvedValueOnce(state({ seeking: { registration_id: "r1", name: "Asha Rao", skills: ["ML", "PCB"] } }));
    open();
    const box = await screen.findByRole("checkbox", { name: /Find me teammates/ });
    expect(box).not.toBeChecked();
    expect(screen.queryByLabelText("Skills")).toBeNull();
    fireEvent.click(box);
    await waitFor(() => expect(api.seeking).toHaveBeenCalledWith("68", true, []));
    expect(await screen.findByRole("checkbox", { name: /Find me teammates/ })).toBeChecked();
    const skills = screen.getByLabelText("Skills");
    fireEvent.change(skills, { target: { value: " ML, PCB , ," } });
    fireEvent.blur(skills);
    await waitFor(() => expect(api.seeking).toHaveBeenLastCalledWith("68", true, ["ML", "PCB"]));
  });

  it("stops listing you, with what you said you bring", async () => {
    api.me.mockResolvedValue(state({ seeking: { registration_id: "r1", name: "Asha Rao", skills: ["ML", "PCB"] } }));
    api.seeking.mockResolvedValue(state());
    open();
    expect(await screen.findByLabelText("Skills")).toHaveValue("ML, PCB");
    fireEvent.click(screen.getByRole("checkbox", { name: /Find me teammates/ }));
    await waitFor(() => expect(api.seeking).toHaveBeenCalledWith("68", false, ["ML", "PCB"]));
    await waitFor(() => expect(screen.queryByLabelText("Skills")).toBeNull());
  });

  it("shows the others looking, with their skills", async () => {
    api.me.mockResolvedValue(state({ seekers: [...state().seekers, { registration_id: "r10", name: "Meera", skills: [] }] }));
    open();
    const others = (await screen.findByRole("heading", { level: 3, name: "Also looking" })).nextElementSibling;
    const rows = within(others).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Kiran");
    expect(rows[0]).toHaveTextContent("PCB · Rust");
    expect(rows[1]).toHaveTextContent("Meera");
    expect(rows[1]).toHaveTextContent("—");
  });
});

describe("your team", () => {
  it("shows its name, track, size, stage, members and open spots", async () => {
    api.me.mockResolvedValue(onTeam({}, { stage: "finalist" }));
    open();
    const card = (await screen.findByRole("heading", { level: 2, name: "Blinkenlights" })).closest("section");
    expect(card).toHaveTextContent("Edge AI · 2 of 4 · Finalist");
    expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Asha Rao", "Rohan P."]);
    expect(card).toHaveTextContent("2 more can join");
    expect(within(card).getByLabelText("Track")).toHaveValue("1");
  });

  it("says when the team was shortlisted", async () => {
    api.me.mockResolvedValue(onTeam({}, { stage: "shortlisted", open_spots: 0 }));
    open();
    expect(await screen.findByText("Edge AI · 2 of 4 · Shortlisted")).toBeInTheDocument();
    expect(screen.queryByText(/more can join/)).toBeNull();
  });

  it("renames the team", async () => {
    api.me.mockResolvedValue(onTeam());
    api.renameTeam.mockResolvedValue(onTeam({}, { name: "Blinken Lights" }));
    open();
    const card = (await screen.findByRole("heading", { level: 2, name: "Blinkenlights" })).closest("section");
    const rename = within(card).getByRole("button", { name: "Rename" });
    const input = within(card).getByLabelText("Team name");
    expect(input).toHaveValue("Blinkenlights");
    // Nothing to send until the name changes.
    expect(rename).toBeDisabled();
    fireEvent.change(input, { target: { value: "  " } });
    expect(rename).toBeDisabled();
    fireEvent.change(input, { target: { value: " Blinken Lights " } });
    fireEvent.click(rename);
    await waitFor(() => expect(api.renameTeam).toHaveBeenCalledWith("68", { name: "Blinken Lights" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Blinken Lights" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Team name")).toHaveValue("Blinken Lights"));
  });

  it("changes the team's track, or takes it off every track", async () => {
    api.me.mockResolvedValue(onTeam());
    api.renameTeam.mockResolvedValueOnce(onTeam({}, { track_id: 2, track: "Open hardware" })).mockResolvedValueOnce(onTeam({}, { track_id: null, track: null }));
    open();
    const card = (await screen.findByRole("heading", { level: 2, name: "Blinkenlights" })).closest("section");
    fireEvent.change(within(card).getByLabelText("Track"), { target: { value: "2" } });
    await waitFor(() => expect(api.renameTeam).toHaveBeenCalledWith("68", { track_id: 2 }));
    expect(await screen.findByText(/^Open hardware · 2 of 4/)).toBeInTheDocument();
    fireEvent.change(within(section("Blinkenlights")).getByLabelText("Track"), { target: { value: "" } });
    await waitFor(() => expect(api.renameTeam).toHaveBeenLastCalledWith("68", { track_id: null }));
    expect(await screen.findByText(/^No track yet · 2 of 4/)).toBeInTheDocument();
  });

  it("leaves the team, back to finding one", async () => {
    api.me.mockResolvedValue(onTeam());
    api.leaveTeam.mockResolvedValue(state());
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Leave the team" }));
    await waitFor(() => expect(api.leaveTeam).toHaveBeenCalledWith("68"));
    expect(await screen.findByRole("heading", { level: 2, name: "Find your team" })).toBeInTheDocument();
  });

  it("can't be renamed, moved or left once teams are locked", async () => {
    api.me.mockResolvedValue(onTeam({ teams_locked: true }));
    open();
    const card = (await screen.findByRole("heading", { level: 2, name: "Blinkenlights" })).closest("section");
    expect(within(card).queryByRole("button", { name: "Rename" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Leave the team" })).toBeNull();
    expect(within(card).getByLabelText("Track")).toBeDisabled();
  });
});

describe("the submission", () => {
  it("says what is still missing, by its label, and hands in the links", async () => {
    api.me.mockResolvedValue(onTeam());
    api.submit.mockResolvedValue(onTeam({}, { submission: { fields: { repo: "https://github.com/circuit/blink", video: "https://youtu.be/demo" }, status: "complete", missing: [], completed_at: null, updated_at: null } }));
    open();
    const card = (await screen.findByRole("heading", { level: 2, name: "Your submission" })).closest("section");
    expect(card).toHaveTextContent("Still missing: Demo video");
    // The deadline in India time: 12:30 UTC is 6 PM there.
    expect(card).toHaveTextContent("Closes Mon, 19 Oct · 6:00 PM IST.");
    expect(within(card).getByRole("textbox", { name: /Code repository/ })).toHaveValue("https://github.com/circuit/blink");
    expect(within(card).getByRole("textbox", { name: "Code repository required" })).toBeInTheDocument();
    expect(within(card).getByRole("textbox", { name: "Slides optional" })).toHaveValue("");
    fireEvent.change(within(card).getByRole("textbox", { name: /Demo video/ }), { target: { value: "https://youtu.be/demo" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save submission" }));
    await waitFor(() => expect(api.submit).toHaveBeenCalledWith("68", { repo: "https://github.com/circuit/blink", video: "https://youtu.be/demo" }));
    expect(await within(card).findByText("Everything required is in.")).toBeInTheDocument();
  });

  it("says nothing is in yet, and that it is open until the organisers close it", async () => {
    api.me.mockResolvedValue(onTeam({ submissions_close_at: null }, { submission: { fields: {}, status: "nothing", missing: ["repo", "video"], completed_at: null, updated_at: null } }));
    open();
    const card = (await screen.findByRole("heading", { level: 2, name: "Your submission" })).closest("section");
    expect(card).toHaveTextContent("Nothing handed in yet.");
    expect(card).toHaveTextContent("Open until the organisers close it.");
  });

  it("can't be changed once submissions are closed", async () => {
    api.me.mockResolvedValue(onTeam({ submissions_open: false }));
    open();
    const card = (await screen.findByRole("heading", { level: 2, name: "Your submission" })).closest("section");
    expect(card).toHaveTextContent("Submissions are closed.");
    for (const box of within(card).getAllByRole("textbox")) expect(box).toBeDisabled();
    expect(within(card).getByRole("button", { name: "Save submission" })).toBeDisabled();
  });
});

describe("the mentors' office hours", () => {
  const mentors = [
    {
      id: 5,
      name: "Dr. Meera Iyer",
      topic: "TinyML",
      sort_order: 0,
      slots: [
        { id: 51, starts_at: "2026-10-18T13:30:00Z", minutes: 15, team_id: null, team: null },
        { id: 52, starts_at: "2026-10-18T14:00:00Z", minutes: 15, team_id: 11, team: "Blinkenlights" },
        { id: 53, starts_at: "2026-10-18T14:30:00Z", minutes: 15, team_id: 99, team: "Others" },
      ],
    },
    { id: 6, name: "Vikram", topic: null, sort_order: 1, slots: [] },
  ];
  const slot = (time) => screen.getByRole("button", { name: new RegExp(`^${time}`) });

  it("shows each slot in India time, free, yours or taken", async () => {
    api.me.mockResolvedValue(onTeam({ mentors }));
    open();
    const card = (await screen.findByRole("heading", { level: 2, name: "Mentor office hours" })).closest("section");
    expect(card).toHaveTextContent("Dr. Meera Iyer");
    expect(card).toHaveTextContent("TinyML");
    expect(slot("7:00 PM")).toHaveTextContent("Free");
    expect(slot("7:00 PM")).toBeEnabled();
    expect(slot("7:30 PM")).toHaveTextContent("Yours");
    expect(slot("7:30 PM")).toHaveClass("is-mine");
    expect(slot("8:00 PM")).toHaveTextContent("Taken");
    expect(slot("8:00 PM")).toBeDisabled();
    expect(card).toHaveTextContent("No slots opened yet.");
  });

  it("books a free slot", async () => {
    api.me.mockResolvedValue(onTeam({ mentors }));
    const booked = structuredClone(mentors);
    booked[0].slots[0].team_id = 11;
    api.book.mockResolvedValue(onTeam({ mentors: booked }));
    open();
    await screen.findByRole("heading", { level: 2, name: "Mentor office hours" });
    fireEvent.click(slot("7:00 PM"));
    await waitFor(() => expect(api.book).toHaveBeenCalledWith("68", 51));
    await waitFor(() => expect(slot("7:00 PM")).toHaveTextContent("Yours"));
    expect(api.free).not.toHaveBeenCalled();
  });

  it("frees your own slot", async () => {
    api.me.mockResolvedValue(onTeam({ mentors }));
    const freed = structuredClone(mentors);
    freed[0].slots[1].team_id = null;
    api.free.mockResolvedValue(onTeam({ mentors: freed }));
    open();
    await screen.findByRole("heading", { level: 2, name: "Mentor office hours" });
    fireEvent.click(slot("7:30 PM"));
    await waitFor(() => expect(api.free).toHaveBeenCalledWith("68", 52));
    await waitFor(() => expect(slot("7:30 PM")).toHaveTextContent("Free"));
    expect(api.book).not.toHaveBeenCalled();
  });

  it("says why a slot can't be booked", async () => {
    api.me.mockResolvedValue(onTeam({ mentors }));
    api.book.mockRejectedValue({ response: { status: 409, data: { message: "One slot per mentor" } } });
    open();
    await screen.findByRole("heading", { level: 2, name: "Mentor office hours" });
    fireEvent.click(slot("7:00 PM"));
    expect(await screen.findByRole("status")).toHaveTextContent("One slot per mentor");
  });

  it("isn't shown when there are no mentors", async () => {
    api.me.mockResolvedValue(onTeam());
    open();
    await screen.findByRole("heading", { level: 2, name: "Your submission" });
    expect(screen.queryByRole("heading", { level: 2, name: "Mentor office hours" })).toBeNull();
  });
});

describe("the leaderboard", () => {
  const board = [
    { rank: 1, team_id: 12, name: "Null Pointers", track: "Open hardware", stage: "finalist", score: 91.4, judges_scored: 3, judges_total: 3 },
    { rank: 2, team_id: 11, name: "Blinkenlights", track: "Edge AI", stage: "finalist", score: 88, judges_scored: 3, judges_total: 3 },
    { rank: null, team_id: 13, name: "Late Ones", track: null, stage: "entered", score: null, judges_scored: 0, judges_total: 3 },
  ];

  it("shows the ranks and scores once public, with your team marked", async () => {
    api.me.mockResolvedValue(onTeam({ board }));
    open();
    const card = (await screen.findByRole("heading", { level: 2, name: "Leaderboard" })).closest("section");
    const rows = within(card).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["1Null PointersOpen hardware91.4", "2BlinkenlightsEdge AI88.0", "–Late Ones—"]);
    expect(rows[1]).toHaveClass("is-mine");
    expect(rows[0]).not.toHaveClass("is-mine");
  });

  it("marks no row for someone without a team", async () => {
    api.me.mockResolvedValue(state({ board }));
    open();
    const card = (await screen.findByRole("heading", { level: 2, name: "Leaderboard" })).closest("section");
    expect(card.querySelector(".is-mine")).toBeNull();
  });

  it("isn't shown until the organisers make it public", async () => {
    api.me.mockResolvedValue(onTeam({ board: null }));
    open();
    await screen.findByRole("heading", { level: 2, name: "Blinkenlights" });
    expect(screen.queryByRole("heading", { level: 2, name: "Leaderboard" })).toBeNull();
  });
});
