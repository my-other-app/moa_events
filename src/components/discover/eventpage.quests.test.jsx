import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { fullEvent } from "@/test/eventFixture";
import { overviewCard } from "@/test/questFixture";

vi.mock("@/api/client", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/api/live", () => ({ liveApi: { fetchFeed: vi.fn(() => Promise.reject(new Error("no room"))), fetchBanner: vi.fn(() => Promise.reject(new Error("no room"))) } }));
vi.mock("@/api/competition", () => ({ competitionApi: { leaderboard: vi.fn(() => Promise.reject(new Error("none"))) } }));
vi.mock("@/api/quests", () => ({ questsApi: { card: vi.fn(), code: vi.fn(), size: vi.fn(), leaderboard: vi.fn() } }));

const { parseEventPage } = await import("@/api/discover");
const { questsApi } = await import("@/api/quests");
const { parseQuestCard } = await import("@/utils/quests");
const { EventView } = await import("./eventpage.jsx");

/*
 * The event's quest on its page (components/quests): read in the browser
 * for the event, placed between its tickets and its About; never asked for
 * a called-off event. What the card says is tested in components/quests.
 */
const show = (data) =>
  render(
    <MemoryRouter initialEntries={["/events/hack-night-04"]}>
      <EventView page={parseEventPage(data)} />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the event's quest on its page", () => {
  it("is read for the event and sits before About", async () => {
    questsApi.card.mockResolvedValue(parseQuestCard(overviewCard()));
    show(fullEvent());
    const card = await screen.findByRole("region", { name: "DevDays Quest" });
    expect(questsApi.card).toHaveBeenCalledWith("123");
    const about = document.getElementById("about");
    expect(card.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.closest(".ep-body")).not.toBeNull();
    // Registration is open: the way in is to register.
    expect(card).toHaveTextContent("Register to take part.");
  });

  it("isn't there for an event without one", async () => {
    questsApi.card.mockResolvedValue(null);
    show(fullEvent());
    await waitFor(() => expect(questsApi.card).toHaveBeenCalled());
    expect(document.querySelector(".qs")).toBeNull();
  });

  it("is never asked for on a called-off event", async () => {
    questsApi.card.mockResolvedValue(parseQuestCard(overviewCard()));
    const e = fullEvent();
    show({ ...e, event: { ...e.event, status: "cancelled", cancellation: { reason: "Rain.", cancelled_at: "2026-10-12T10:00:00+05:30" } } });
    await screen.findByRole("heading", { level: 1, name: "Hack Night 04" });
    expect(questsApi.card).not.toHaveBeenCalled();
  });
});
