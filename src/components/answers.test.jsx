import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CONDITIONAL_FORM } from "@/test/conditionalFixture";

/*
 * /answers/{eventId}/{ref}?k=: the details a club asks one person for after
 * they signed up (feature-register/missing-answers-contract.md §2.3). The API
 * client is mocked: what the page asks it, and what it does with each answer,
 * is watched; nothing leaves the test.
 */
const get = vi.fn();
const post = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post, delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

const { AuthProvider } = await import("@/auth/AuthProvider");
const Answers = (await import("./answers.jsx")).default;
const { PROFILE, resetAuth } = await import("@/test/auth");

const REF = "0b6e1f9a-4c1d-4d7e-9a51-1f2b3c4d5e6f";
const K = "3f2a9c0d4e5b6a7f8091a2b3c4d5e6f7";
const URL_ = `/api/v1/events/68/answers/${REF}`;

/** GET /events/68/answers/{ref}, as the API sends it. */
const PAGE = (over = {}) => ({
  status: "open",
  event: { id: 68, name: "DevFest Kochi", starts_at: "2026-11-21T04:00:00Z", org_name: "GDG Kochi", poster: null, slug: "devfest-kochi" },
  person: { first_name: "Haritha", kind: "registration" },
  deadline: "2026-11-14T12:30:00Z",
  message: "We need 2 more details for your DevFest ticket.",
  questions: CONDITIONAL_FORM,
  asked: ["status", "tshirt"],
  answers: {},
  ticket_url: "https://myotherapp.in/tickets/MOA-7K3QF-X9PWM",
  ...over,
});

const failed = (status, data = null) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data, headers: {} } });

/** The API answers the page's GET with `page` (or that error), and its POST as `onPost` says. */
function answer(page = PAGE(), onPost = async (_url, body) => ({ data: PAGE({ status: "done", asked: [], answers: body.answers }) })) {
  get.mockImplementation(async (url) => {
    if (url === "/api/v1/user/profile/me") return { data: PROFILE };
    if (url === URL_) {
      if (page instanceof Error) throw page;
      return { data: page };
    }
    throw new Error(`unexpected GET ${url}`);
  });
  post.mockImplementation(onPost);
}

const show = ({ k = K } = {}) =>
  render(
    <MemoryRouter initialEntries={[`/answers/68/${REF}${k ? `?k=${k}` : ""}`]}>
      <AuthProvider>
        <Answers eventId="68" answerRef={REF} k={k} />
      </AuthProvider>
    </MemoryRouter>,
  );

const heading = (name) => screen.findByRole("heading", { level: 1, name });
const save = () => screen.getByRole("button", { name: /^Save my details?$/ });
const pick = (group, option) => fireEvent.click(within(screen.getByRole("group", { name: group })).getByLabelText(option));
const choose = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const answersCalls = () => get.mock.calls.filter(([url]) => url === URL_);

beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  resetAuth();
});

describe("opening the link", () => {
  it("first paints the loading card, then greets the person with what the club asks", async () => {
    answer();
    show();
    expect(screen.getByRole("status", { name: "Loading your details" })).toBeInTheDocument();
    expect(await heading("Hi Haritha, GDG Kochi needs 2 more details")).toBeInTheDocument();
    expect(screen.getByText("We need 2 more details for your DevFest ticket.")).toBeInTheDocument();
    // The deadline, in India time.
    expect(screen.getByText("Sat, 14 Nov · 6:00 PM IST")).toBeInTheDocument();
    // The event beside it: its name, its club, its date.
    const card = screen.getByRole("complementary", { name: "Your registration" });
    expect(within(card).getByText("DevFest Kochi")).toBeInTheDocument();
    expect(within(card).getByText("by GDG Kochi")).toBeInTheDocument();
    expect(within(card).getAllByText(/21 Nov/).length).toBeGreaterThan(0);
    expect(within(card).getByText(/9:30 AM IST/)).toBeInTheDocument();
  });

  it("reads it with the link's key alone: no token goes along", async () => {
    answer();
    show();
    await heading(/needs 2 more details/);
    expect(answersCalls()).toEqual([[URL_, { params: { k: K }, skipAuth: true }]]);
  });

  it("without a key, reads it as whoever is signed in here", async () => {
    answer();
    show({ k: "" });
    await heading(/needs 2 more details/);
    expect(answersCalls()).toEqual([[URL_, {}]]);
  });

  it("shows only the asked questions, prefilled with what the person has", async () => {
    answer(PAGE({ asked: ["tshirt", "pg_spec"], answers: { status: "Student", college: "COEP", year: "2", degree_type: "PG", tshirt: "M" } }));
    show();
    await heading(/needs 2 more details/);
    expect(screen.getByLabelText(/^PG specialisation/)).toHaveValue("");
    expect(screen.getByLabelText(/^T-shirt size/)).toHaveValue("M");
    // Nothing else of the form: the answers given at sign-up stay as they are.
    for (const label of [/^College name/, /^Year of study/, /^Company/]) expect(screen.queryByLabelText(label)).toBeNull();
    expect(screen.queryByRole("group", { name: /working or a student/ })).toBeNull();
    expect(screen.queryByRole("group", { name: /Degree type/ })).toBeNull();
  });

  it("leaves out a child the answers given at sign-up hide", async () => {
    answer(PAGE({ asked: ["tshirt", "pg_spec"], answers: { status: "Student", degree_type: "UG" } }));
    show();
    await heading(/needs 2 more details/);
    expect(screen.queryByLabelText(/^PG specialisation/)).toBeNull();
    expect(screen.getByLabelText(/^T-shirt size/)).toBeInTheDocument();
  });

  it("says straight away when an answer from sign-up no longer passes", async () => {
    answer(PAGE({ asked: ["tshirt"], answers: { tshirt: "XXL" } }));
    show();
    await heading("Hi Haritha, GDG Kochi needs 1 more detail");
    expect(screen.getByLabelText(/^T-shirt size/)).toHaveAccessibleDescription(/Choose one of the options/);
    expect(save()).toHaveTextContent("Save my detail");
  });

  it("does without a name or a club to name", async () => {
    answer(PAGE({ person: { first_name: null, kind: "registration" }, event: { id: 68, name: "DevFest Kochi", slug: "devfest-kochi" }, message: null, deadline: null }));
    show();
    expect(await heading("The organisers need 2 more details")).toBeInTheDocument();
    expect(screen.queryByText(/said:/)).toBeNull();
    expect(screen.queryByText(/Please add/)).toBeNull();
  });
});

describe("answering", () => {
  it("brings the questions in as the answers call for them, and sends only those that apply", async () => {
    answer();
    show();
    await heading(/needs 2 more details/);
    expect(screen.queryByLabelText(/^College name/)).toBeNull();

    pick(/working or a student/, "Student");
    expect(screen.getByLabelText(/^College name/)).toBeInTheDocument();
    expect(screen.getByTestId("an-reveal-note")).toHaveTextContent("3 new questions: College name, Year of study, Degree type.");
    type(/^College name/, "COEP");
    choose(/^Year of study/, "2");
    pick(/Degree type/, "PG");
    type(/^PG specialisation/, "AI");

    // Changing their mind: the student answers go.
    pick(/working or a student/, "Working");
    expect(screen.queryByLabelText(/^College name/)).toBeNull();
    expect(screen.queryByLabelText(/^PG specialisation/)).toBeNull();
    type(/^Company/, "Acme");
    choose(/^Years of experience/, "3-5");
    choose(/^T-shirt size/, "L");

    await act(async () => fireEvent.click(save()));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(URL_, { answers: { status: "Working", company: "Acme", experience: "3-5", tshirt: "L" } }, { params: { k: K }, skipAuth: true });
    expect(await heading("Thanks — your ticket is unchanged")).toHaveFocus();
    expect(screen.getByRole("link", { name: "View your ticket" })).toHaveAttribute("href", "/tickets/MOA-7K3QF-X9PWM");
    expect(screen.getByRole("link", { name: "Back to the event" })).toHaveAttribute("href", "/events/devfest-kochi");
  });

  it("checks the answers as the register form does, and sends nothing until they pass", async () => {
    answer();
    show();
    await heading(/needs 2 more details/);
    await act(async () => fireEvent.click(save()));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Check the highlighted answers");
    expect(screen.getByRole("group", { name: /working or a student/ })).toHaveTextContent("Choose one of the options.");
    expect(screen.getByLabelText(/^T-shirt size/)).toHaveAccessibleDescription(/Choose one of the options/);
  });

  it("thanks someone under review for their registration, with its page when the API gives one", async () => {
    answer(
      PAGE({ person: { first_name: "Haritha", kind: "request" }, ticket_url: null, asked: ["tshirt"] }),
      async () => ({ data: PAGE({ status: "done", asked: [], person: { first_name: "Haritha", kind: "request" }, ticket_url: null, request_url: "https://myotherapp.in/requests/Rq7abcdefghijklmnopqrstuvwxyz012" }) }),
    );
    show();
    await heading(/needs 1 more detail/);
    choose(/^T-shirt size/, "S");
    await act(async () => fireEvent.click(save()));
    expect(await heading("Thanks — your registration is unchanged")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View your registration" })).toHaveAttribute("href", "/requests/Rq7abcdefghijklmnopqrstuvwxyz012");
    expect(screen.queryByRole("link", { name: "View your ticket" })).toBeNull();
  });

  it("shows the answers the API refused beside them", async () => {
    answer(PAGE({ asked: ["tshirt"] }), async () => {
      throw failed(422, { error_code: "INVALID_ANSWERS", message: "Check your answers.", errors: { tshirt: "That size has run out." } });
    });
    show();
    await heading(/needs 1 more detail/);
    choose(/^T-shirt size/, "XL");
    await act(async () => fireEvent.click(save()));
    expect(screen.getByLabelText(/^T-shirt size/)).toHaveAccessibleDescription(/That size has run out\./);
    expect(screen.getByRole("alert")).toHaveTextContent("Check the highlighted answers");
    // Changing it takes the API's note away.
    choose(/^T-shirt size/, "L");
    expect(screen.queryByText("That size has run out.")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the form closed when the deadline passed meanwhile", async () => {
    answer(PAGE({ asked: ["tshirt"] }), async () => {
      throw failed(409, { error_code: "CLOSED", message: "This form has closed." });
    });
    show();
    await heading(/needs 1 more detail/);
    choose(/^T-shirt size/, "M");
    await act(async () => fireEvent.click(save()));
    expect(await heading("This form has closed")).toBeInTheDocument();
    expect(screen.getByText(/GDG Kochi asked for these details by Sat, 14 Nov · 6:00 PM IST\./)).toBeInTheDocument();
  });

  it("keeps the answers when the save didn't get through, and says why", async () => {
    answer(PAGE({ asked: ["tshirt"] }), async () => {
      throw failed(429, { message: "Too many requests" });
    });
    show();
    await heading(/needs 1 more detail/);
    choose(/^T-shirt size/, "M");
    await act(async () => fireEvent.click(save()));
    expect(screen.getByRole("alert")).toHaveTextContent("Your details weren’t saved");
    expect(screen.getByRole("alert")).toHaveTextContent("Too many tries in a row.");
    expect(screen.getByLabelText(/^T-shirt size/)).toHaveValue("M");
    expect(save()).toBeEnabled();
  });
});

describe("where things stand", () => {
  it("done: nothing left to add", async () => {
    answer(PAGE({ status: "done", asked: [] }));
    show();
    expect(await heading("You’re all set")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View your ticket" })).toHaveAttribute("href", "/tickets/MOA-7K3QF-X9PWM");
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
  });

  it("closed: the deadline passed, or the event ended", async () => {
    answer(PAGE({ status: "closed", deadline: null }));
    show();
    expect(await heading("This form has closed")).toBeInTheDocument();
    expect(screen.getByText(/GDG Kochi isn’t collecting these details any more\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
  });

  it("nothing: the registration no longer counts", async () => {
    answer(PAGE({ status: "nothing", questions: [], answers: {}, asked: [], ticket_url: null }));
    show();
    expect(await heading("This registration is no longer active")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find events" })).toHaveAttribute("href", "/events");
  });

  it("open with nothing that applies to this person: nothing to fill in", async () => {
    answer(PAGE({ asked: ["pg_spec"], answers: { status: "Working" } }));
    show();
    expect(await heading("You’re all set")).toBeInTheDocument();
  });

  it.each([404, 403])("a link that doesn't work (%s)", async (status) => {
    answer(failed(status, { error_code: "NOT_FOUND" }));
    show();
    expect(await heading("This link doesn’t work")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My tickets" })).toHaveAttribute("href", "/me/tickets");
  });

  it("no answer at all: try again", async () => {
    answer(new Error("Network Error"));
    show();
    expect(await screen.findByRole("heading", { name: "Your details didn’t load" })).toBeInTheDocument();
    answer();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(await heading(/needs 2 more details/)).toBeInTheDocument();
  });
});
