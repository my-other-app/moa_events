import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { fullEvent } from "@/test/eventFixture";

const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn() } }));
vi.mock("@/utils/visit", () => ({ countVisit: vi.fn() }));

const { parseClubPage, parseClubsPage, parseEventPage, parseEventsPage, parseTopics } = await import("@/api/discover");
const { stableCard, stableClubCard, stablePage } = await import("@/seo/stabilize");
const { clubsHead, clubsPageState, eventsHead, eventsPageState, topicChoice } = await import("@/seo/listings");
const { EventView } = await import("./eventpage.jsx");
const { ClubView } = await import("./clubpage.jsx");
const { EventsView } = await import("./eventspage.jsx");
const { ClubsView } = await import("./clubspage.jsx");
const { TopicView, TopicsView } = await import("./topicspage.jsx");
const { SiteFooter } = await import("./footer.jsx");
const { TopicsNavProvider } = await import("./topicsnav.jsx");
const { hydrate } = await import("@/test/hydrate");

/*
 * Topics in the browser: the chips on an event's and a club's page, the
 * footer's link, the Topic filter and the interests' chips on the find
 * pages (each change goes into the address, as every filter does), and a
 * topic's page: its chips, "Load more" by topic and interest, and that it
 * hydrates as the server drew it. The routes are tested in
 * src/app/_tests/topic-routes.test.js.
 */
const DEV_REF = { id: 1, slug: "development", name: "Development", color: "#2563EB" };
const TREE = {
  topics: parseTopics([
    {
      ...DEV_REF,
      icon: "💻",
      icon_type: "emoji",
      description: "Build things.",
      upcoming_events: 12,
      clubs: 30,
      interests: [
        { id: 3, name: "Web Development", upcoming_events: 4 },
        { id: 9, name: "Cybersecurity", upcoming_events: 2 },
      ],
    },
    { id: 4, slug: "arts", name: "Arts", color: "#EA580C", upcoming_events: 0, clubs: 5, interests: [{ id: 20, name: "Music", upcoming_events: 0 }] },
  ]),
  counted: true,
};
const ev = (id, over = {}) => ({ id, slug: `event-${id}`, name: `Event ${id}`, starts_at: "2026-10-17T12:30:00Z", status: "upcoming", ...over });
const search = () => screen.getByTestId("search").textContent;

beforeEach(() => {
  get.mockReset();
  localStorage.clear();
  window.scrollTo = vi.fn();
});

describe("topic chips on an event's and a club's page", () => {
  it("link an event to its topics' pages, in their colours, and are absent without topics", () => {
    const withTopics = parseEventPage(fullEvent({ event: { ...fullEvent().event, topics: [DEV_REF] } }));
    const { unmount } = render(
      <MemoryRouter>
        <EventView page={withTopics} />
      </MemoryRouter>
    );
    const chip = screen.getByRole("link", { name: "Development" });
    expect(chip).toHaveAttribute("href", "/topics/development");
    expect(chip.style.getPropertyValue("--tp")).toBe("#2563EB");
    // The event's interests are called interests now that "topic" means the main category.
    expect(screen.getByRole("list", { name: "Interests" })).toBeInTheDocument();
    unmount();
    render(
      <MemoryRouter>
        <EventView page={parseEventPage(fullEvent())} />
      </MemoryRouter>
    );
    expect(document.querySelector(".ep-chip--topic, .tp-chip")).toBeNull();
  });

  it("link a club to its topics' pages", () => {
    const data = parseClubPage({ club: { id: 3, slug: "circuit-society", name: "Circuit Society", topics: [DEV_REF, { id: 2, slug: "deep-tech", name: "Deep Tech", color: "#7C3AED" }] }, upcoming: [] });
    render(
      <MemoryRouter>
        <ClubView data={data} />
      </MemoryRouter>
    );
    const list = screen.getByRole("list", { name: "Topics" });
    expect(within(list).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/topics/development", "/topics/deep-tech"]);
  });
});

describe("the footer's Topics link", () => {
  it("is there only when the site has topics", () => {
    const { unmount } = render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>
    );
    expect(screen.queryByRole("link", { name: "Topics" })).toBeNull();
    unmount();
    render(
      <MemoryRouter>
        <TopicsNavProvider on>
          <SiteFooter />
        </TopicsNavProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Topics" })).toHaveAttribute("href", "/topics");
  });
});

/** /events and /clubs as the server renders them for the address (with the topics it knows), again after every navigation. */
function EventsAt({ facet = [] }) {
  const loc = useLocation();
  const state = eventsPageState(new URLSearchParams(loc.search));
  const page = stablePage(parseEventsPage({ items: [ev(1), ev(2)], total: 2, where: { source: "none" }, categories: [], topics: facet }), stableCard);
  const topics = topicChoice(state.filters, { facet: page.topics, tree: state.filters.topic || state.filters.interest ? TREE : null });
  const { heading } = eventsHead(state, { topicName: topics.topicName, interestName: topics.interestName });
  return (
    <>
      <EventsView state={state} page={page} heading={heading} topics={topics} />
      <output data-testid="search">{loc.search}</output>
    </>
  );
}

function ClubsAt() {
  const loc = useLocation();
  const state = clubsPageState(new URLSearchParams(loc.search));
  const page = stablePage(parseClubsPage({ items: [{ id: 5, slug: "circuit-society", name: "Circuit Society" }], total: 1, interests: [{ id: 3, name: "Web Development", clubs: 4 }, { id: 20, name: "Music", clubs: 1 }] }), stableClubCard);
  const topics = topicChoice(state.filters, { tree: TREE, count: "clubs" });
  const { heading } = clubsHead(state, { topicName: topics.topicName, interestName: topics.interestName });
  return (
    <>
      <ClubsView state={state} page={page} heading={heading} topics={topics} />
      <output data-testid="search">{loc.search}</output>
    </>
  );
}

const at = (path, element) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/events" element={element} />
        <Route path="/clubs" element={element} />
      </Routes>
    </MemoryRouter>
  );

describe("the find pages' Topic filter", () => {
  const FACET = [
    { ...DEV_REF, upcoming: 12 },
    { id: 4, slug: "arts", name: "Arts", color: "#EA580C", upcoming: 0 },
  ];

  it("puts a topic into the address, then its interests as chips, and clears both", async () => {
    at("/events?type=online", <EventsAt facet={FACET} />);
    expect(screen.queryByRole("group", { name: /Interests in/ })).toBeNull();
    fireEvent.change(screen.getAllByLabelText("Topic")[0], { target: { value: "development" } });
    await waitFor(() => expect(search()).toBe("?type=online&topic=development"));
    expect(screen.getByRole("heading", { level: 1, name: "Online events" })).toBeInTheDocument();

    const chips = screen.getByRole("group", { name: "Interests in Development" });
    expect(within(chips).getByRole("link", { name: "All Development" })).toHaveAttribute("aria-current", "true");
    const web = within(chips).getByRole("link", { name: /Web Development/ });
    expect(web).toHaveAttribute("href", "/events?type=online&topic=development&interest=3");
    fireEvent.click(web);
    await waitFor(() => expect(search()).toBe("?type=online&topic=development&interest=3"));

    // Another topic starts over on its interests.
    fireEvent.change(screen.getAllByLabelText("Topic")[0], { target: { value: "arts" } });
    await waitFor(() => expect(search()).toBe("?type=online&topic=arts"));

    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    await waitFor(() => expect(search()).toBe(""));
  });

  it("names the page by its topic and interest", async () => {
    at("/events?topic=development&interest=9", <EventsAt facet={FACET} />);
    expect(screen.getByRole("heading", { level: 1, name: "Cybersecurity events" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Topic")[0]).toHaveValue("development");
  });

  it("is not there when the list knows no topics", () => {
    at("/events", <EventsAt />);
    expect(screen.queryByLabelText("Topic")).toBeNull();
  });

  it("narrows the clubs' interest chips to the picked topic's", async () => {
    at("/clubs", <ClubsAt />);
    expect(within(screen.getByRole("group", { name: "Interests" })).getByRole("link", { name: /Music/ })).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText("Topic")[0], { target: { value: "development" } });
    await waitFor(() => expect(search()).toBe("?topic=development"));
    expect(screen.getByRole("heading", { level: 1, name: "Development clubs" })).toBeInTheDocument();
    const chips = screen.getByRole("group", { name: "Interests in Development" });
    expect(within(chips).getAllByRole("link").map((a) => a.textContent)).toEqual(["All Development", "Web Development4", "Cybersecurity"]);
    fireEvent.click(within(chips).getByRole("link", { name: /Cybersecurity/ }));
    await waitFor(() => expect(search()).toBe("?topic=development&interest=9"));
    expect(screen.getByRole("heading", { level: 1, name: "Cybersecurity clubs" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    await waitFor(() => expect(search()).toBe(""));
  });
});

/* ---------- a topic's page ---------- */

const topicData = (interestId = "", over = {}) => {
  const topic = TREE.topics[0];
  const interest = interestId ? topic.interests.find((i) => String(i.id) === interestId) : null;
  return {
    topic,
    counted: true,
    interest,
    filters: { topic: topic.slug, interest: interest ? String(interest.id) : "" },
    events: stablePage(parseEventsPage({ items: Array.from({ length: 12 }, (_, i) => ev(i + 1)), total: 14 }), stableCard),
    clubs: stablePage(parseClubsPage({ items: [{ id: 5, slug: "circuit-society", name: "Circuit Society" }], total: 1 }), stableClubCard),
    ...over,
  };
};

function TopicAt() {
  const loc = useLocation();
  const id = new URLSearchParams(loc.search).get("interest") || "";
  return (
    <>
      <TopicView data={topicData(id)} others={[TREE.topics[1]]} />
      <output data-testid="search">{loc.search}</output>
    </>
  );
}

describe("a topic's page", () => {
  it("moves between its interests by real links, and loads more of the same list from the API", async () => {
    render(
      <MemoryRouter initialEntries={["/topics/development"]}>
        <Routes>
          <Route path="/topics/development" element={<TopicAt />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { level: 1, name: "Development" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("HomeTopicsDevelopment");
    expect(screen.getByRole("link", { name: "Arts" })).toHaveAttribute("href", "/topics/arts");

    const chips = screen.getByRole("group", { name: "Interests in Development" });
    fireEvent.click(within(chips).getByRole("link", { name: /Web Development/ }));
    await waitFor(() => expect(search()).toBe("?interest=3"));
    expect(screen.getByRole("heading", { level: 2, name: "Upcoming Web Development events" })).toBeInTheDocument();

    get.mockResolvedValueOnce({ data: { items: [ev(13), ev(14)], total: 14 } });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("link", { name: "Event 14" })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/api/v1/discover/events", { params: { topic: "development", interest: "3", radius_km: 0, offset: 12, limit: 12 }, skipAuth: true });
    expect(screen.getByRole("heading", { level: 3, name: "Event 14" })).toBeInTheDocument();
  });

  it("says so when the topic has nothing coming up, and offers the rest", () => {
    render(
      <MemoryRouter>
        <TopicView data={topicData("9", { events: parseEventsPage({ items: [], total: 0 }), clubs: null })} />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "No upcoming Cybersecurity events right now" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All of Development" })).toHaveAttribute("href", "/topics/development");
    expect(screen.queryByRole("heading", { name: /clubs$/ })).toBeNull();
  });

  it("hydrates as the server drew it, and so does /topics", async () => {
    const page = await hydrate(
      <MemoryRouter initialEntries={["/topics/development"]}>
        <TopicView data={topicData()} others={[TREE.topics[1]]} />
      </MemoryRouter>
    );
    expect(page.problems).toEqual([]);
    page.unmount();
    const list = await hydrate(
      <MemoryRouter initialEntries={["/topics"]}>
        <TopicsView topics={TREE.topics} />
      </MemoryRouter>
    );
    expect(list.problems).toEqual([]);
    expect(list.html).toContain("12 upcoming events · 30 clubs");
    list.unmount();
  });
});
