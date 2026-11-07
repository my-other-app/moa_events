import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { sparseEvent } from "@/test/eventFixture";
import { CONDITIONAL_FORM, FLAT_FORM, STUDENT_KEYS, WORKING_KEYS } from "@/test/conditionalFixture";

/*
 * Conditional registration questions on the form
 * (feature-register/conditional-questions-contract.md §8), on the contract's
 * shared test form (§12): only what applies is shown, an answer that changes
 * the branch clears what no longer applies, focus stays put, a screen reader
 * hears the change, and nothing hidden is ever sent.
 */

vi.mock("@/api/events", () => ({
  eventsApi: {
    fetchEvent: vi.fn(),
    fetchStoreCatalog: vi.fn(),
    registerForEvent: vi.fn(),
  },
}));
vi.mock("@/api/payments", () => ({ paymentsApi: { createPaymentOrder: vi.fn(), verifyPayment: vi.fn() } }));
vi.mock("@/utils/loadScript", () => ({ loadScript: vi.fn(() => Promise.resolve(true)) }));
vi.mock("@/api/live", () => ({ liveApi: { fetchFeed: vi.fn(() => new Promise(() => {})) } }));
vi.mock("@/api/competition", () => ({ competitionApi: { leaderboard: vi.fn(() => new Promise(() => {})) } }));
vi.mock("@/api/ticketing", () => ({
  ticketingApi: { types: vi.fn(() => Promise.resolve(null)), checkCode: vi.fn(), joinWaitlist: vi.fn(), myWaitlist: vi.fn(), leaveWaitlist: vi.fn() },
}));

const { eventsApi } = await import("@/api/events");
const { parseEventPage } = await import("@/api/discover");
const Register = (await import("./register.jsx")).default;

const free = parseEventPage(sparseEvent());

const LABELS = Object.fromEntries(CONDITIONAL_FORM.map((q) => [q.key, q.label]));

function show(questions = CONDITIONAL_FORM) {
  eventsApi.fetchEvent.mockResolvedValue({ id: free.event.id, additional_details: questions, reg_fee: 0 });
  eventsApi.fetchStoreCatalog.mockResolvedValue({ enabled: false, items: [] });
  return render(
    <MemoryRouter initialEntries={[`/events/${free.event.slug}/register`]}>
      <Routes>
        <Route path="/events/:slug/register" element={<Register event={free.event} club={free.club} />} />
      </Routes>
    </MemoryRouter>,
  );
}

const field = (re) => screen.getByLabelText(re);
const go = () => fireEvent.click(document.querySelector(".rg-go"));
const heading = (name) => screen.findByRole("heading", { level: 1, name });
const radio = (name) => screen.getByRole("radio", { name });
const shownLabels = () => [...document.querySelectorAll(".rg-fields > .rg-field :is(label.rg-label, legend.rg-label)")].map((l) => l.firstChild.textContent.trim());
const note = () => screen.getByTestId("rg-reveal-note").textContent;
const sent = () => eventsApi.registerForEvent.mock.calls[0][1].additional_details;

async function toQuestions(questions) {
  show(questions);
  await heading(/Your details/);
  fireEvent.change(field(/^Full name/), { target: { value: "Asha Rao" } });
  fireEvent.change(field(/^Email/), { target: { value: "asha@example.org" } });
  fireEvent.change(field(/^Phone number/), { target: { value: "98765 43210" } });
  go();
  await heading(/A few questions/);
}

const choose = (key, value) => fireEvent.change(field(new RegExp(`^${LABELS[key]}`)), { target: { value } });
const type = choose;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  window.scrollTo = vi.fn();
});

describe("a form with conditional questions", () => {
  it("first shows only the questions that don't depend on another", async () => {
    await toQuestions();
    expect(shownLabels()).toEqual([LABELS.status, LABELS.tshirt]);
    for (const k of [...STUDENT_KEYS, "pg_spec", ...WORKING_KEYS]) expect(screen.queryByLabelText(new RegExp(`^${LABELS[k]}`))).toBeNull();
    // An empty live region is there before anything changes, so a change is announced.
    expect(screen.getByTestId("rg-reveal-note")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("rg-reveal-note")).toHaveAttribute("role", "status");
    expect(note()).toBe("");
  });

  it("Student brings in its questions, marked required (required_when_shown), without moving focus, and says so", async () => {
    await toQuestions();
    radio("Student").focus();
    fireEvent.click(radio("Student"));
    expect(shownLabels()).toEqual([LABELS.status, LABELS.college, LABELS.year, LABELS.degree_type, LABELS.tshirt]);
    expect(document.activeElement).toBe(radio("Student"));
    expect(note()).toBe("3 new questions: College name, Year of study, Degree type.");
    // Sent as required: false on the wire, but required when shown.
    expect(field(/^College name/)).toHaveAttribute("aria-required", "true");
    expect(field(/^College name/).closest(".rg-field").querySelector(".rg-req")).not.toBeNull();
    expect(screen.queryAllByText("Optional")).toHaveLength(0);
    // They drop in; the questions already there don't.
    expect(field(/^College name/).closest(".rg-field")).toHaveClass("is-revealed");
    expect(radio("Student").closest(".rg-field")).not.toHaveClass("is-revealed");
  });

  it("Student → PG reveals the nested question", async () => {
    await toQuestions();
    fireEvent.click(radio("Student"));
    fireEvent.click(radio("PG"));
    expect(shownLabels()).toEqual([LABELS.status, LABELS.college, LABELS.year, LABELS.degree_type, LABELS.pg_spec, LABELS.tshirt]);
    expect(note()).toBe("New question: PG specialisation.");
    expect(document.activeElement).not.toBe(field(/^PG specialisation/));
  });

  it("Working shows its questions; the student ones stay hidden", async () => {
    await toQuestions();
    fireEvent.click(radio("Working"));
    expect(shownLabels()).toEqual([LABELS.status, LABELS.company, LABELS.experience, LABELS.tshirt]);
  });

  it("switching Student → Working clears the student answers, and they don't come back", async () => {
    await toQuestions();
    fireEvent.click(radio("Student"));
    type("college", "COEP");
    choose("year", "2");
    fireEvent.click(radio("PG"));
    type("pg_spec", "VLSI");
    fireEvent.click(radio("Working"));
    expect(note()).toBe("2 new questions: Company, Years of experience. College name, Year of study, Degree type, PG specialisation no longer apply.");
    fireEvent.click(radio("Student"));
    expect(field(/^College name/)).toHaveValue("");
    expect(field(/^Year of study/)).toHaveValue("");
    expect(radio("PG")).not.toBeChecked();
    expect(radio("UG")).not.toBeChecked();
    expect(screen.queryByLabelText(/^PG specialisation/)).toBeNull();
  });

  it("switching PG → UG drops only the nested answer", async () => {
    await toQuestions();
    fireEvent.click(radio("Student"));
    type("college", "COEP");
    choose("year", "2");
    fireEvent.click(radio("PG"));
    type("pg_spec", "VLSI");
    fireEvent.click(radio("UG"));
    expect(screen.queryByLabelText(/^PG specialisation/)).toBeNull();
    expect(note()).toBe("PG specialisation no longer applies.");
    expect(field(/^College name/)).toHaveValue("COEP");
    expect(field(/^Year of study/)).toHaveValue("2");
    fireEvent.click(radio("PG"));
    expect(field(/^PG specialisation/)).toHaveValue("");
  });

  it("asks only for what is shown before moving on", async () => {
    await toQuestions();
    fireEvent.click(radio("Working"));
    choose("tshirt", "M");
    go();
    expect(await screen.findAllByText("This question needs an answer.")).toHaveLength(1);
    expect(screen.getAllByText("Choose one of the options.")).toHaveLength(1);
    expect(document.activeElement).toBe(field(/^Company/));
    type("company", "Acme");
    choose("experience", "3-5");
    go();
    await heading(/Review and confirm/);
  });

  it("reviews and sends only the answers that apply, never a hidden one", async () => {
    eventsApi.registerForEvent.mockReturnValue(new Promise(() => {}));
    await toQuestions();
    fireEvent.click(radio("Student"));
    type("college", "COEP");
    choose("year", "2");
    fireEvent.click(radio("PG"));
    type("pg_spec", "VLSI");
    fireEvent.click(radio("Working"));
    type("company", "Acme");
    choose("experience", "3-5");
    choose("tshirt", "L");
    go();
    await heading(/Review and confirm/);
    const review = screen.getByRole("region", { name: "Your answers" });
    expect([...review.querySelectorAll("dt")].map((d) => d.textContent)).toEqual([LABELS.status, LABELS.company, LABELS.experience, LABELS.tshirt]);
    go();
    await waitFor(() => expect(eventsApi.registerForEvent).toHaveBeenCalled());
    expect(sent()).toEqual({ status: "Working", company: "Acme", experience: "3-5", tshirt: "L" });
  });

  it("sends the Student + PG path whole", async () => {
    eventsApi.registerForEvent.mockReturnValue(new Promise(() => {}));
    await toQuestions();
    fireEvent.click(radio("Student"));
    type("college", "COEP");
    choose("year", "4");
    fireEvent.click(radio("PG"));
    type("pg_spec", "VLSI");
    choose("tshirt", "S");
    go();
    await heading(/Review and confirm/);
    go();
    await waitFor(() => expect(eventsApi.registerForEvent).toHaveBeenCalled());
    expect(sent()).toEqual({ status: "Student", college: "COEP", year: "4", degree_type: "PG", pg_spec: "VLSI", tshirt: "S" });
  });

  it("never sends a hidden answer left in an earlier draft", async () => {
    eventsApi.registerForEvent.mockReturnValue(new Promise(() => {}));
    sessionStorage.setItem(
      `moa.register.${free.event.id}`,
      JSON.stringify({
        values: { name: "Asha Rao", email: "asha@example.org", phone: "98765 43210" },
        answers: { status: "Working", company: "Acme", experience: "0-2", tshirt: "M", college: "COEP", pg_spec: "VLSI" },
      }),
    );
    show();
    await heading(/Your details/);
    go();
    await heading(/A few questions/);
    expect(shownLabels()).toEqual([LABELS.status, LABELS.company, LABELS.experience, LABELS.tshirt]);
    go();
    await heading(/Review and confirm/);
    go();
    await waitFor(() => expect(eventsApi.registerForEvent).toHaveBeenCalled());
    expect(sent()).toEqual({ status: "Working", company: "Acme", experience: "0-2", tshirt: "M" });
  });

  it("doesn't bring back an earlier draft's hidden answer when its branch is opened", async () => {
    sessionStorage.setItem(
      `moa.register.${free.event.id}`,
      JSON.stringify({
        values: { name: "Asha Rao", email: "asha@example.org", phone: "98765 43210" },
        answers: { status: "Working", company: "Acme", college: "COEP" },
      }),
    );
    show();
    await heading(/Your details/);
    go();
    await heading(/A few questions/);
    fireEvent.click(radio("Student"));
    expect(field(/^College name/)).toHaveValue("");
  });

  it("puts the server's 400 beside the question it names, on the questions step", async () => {
    eventsApi.registerForEvent.mockRejectedValue(
      Object.assign(new Error("x"), {
        status: 400,
        data: { message: "Check your answers: PG specialisation.", error_code: "INVALID_ANSWERS", errors: { pg_spec: "Keep it under 2000 characters." }, track_id: null },
      }),
    );
    await toQuestions();
    fireEvent.click(radio("Student"));
    type("college", "COEP");
    choose("year", "1");
    fireEvent.click(radio("PG"));
    type("pg_spec", "VLSI");
    choose("tshirt", "XL");
    go();
    await heading(/Review and confirm/);
    go();
    await heading(/A few questions/);
    expect(await screen.findByText("Keep it under 2000 characters.")).toBeInTheDocument();
    expect(field(/^PG specialisation/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Check the highlighted answers")).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(field(/^PG specialisation/)));
    // Hiding the question takes its error with it.
    fireEvent.click(radio("UG"));
    expect(screen.queryByText("Keep it under 2000 characters.")).toBeNull();
  });
});

describe("a form without conditions", () => {
  it("shows every question at once, with no live region, and sends every answer", async () => {
    eventsApi.registerForEvent.mockReturnValue(new Promise(() => {}));
    await toQuestions(FLAT_FORM);
    expect(shownLabels()).toEqual(FLAT_FORM.map((q) => q.label));
    expect(screen.queryByTestId("rg-reveal-note")).toBeNull();
    expect(document.querySelectorAll(".is-revealed")).toHaveLength(0);
    fireEvent.click(radio("Working"));
    type("college", "COEP");
    choose("year", "2");
    fireEvent.click(radio("UG"));
    type("pg_spec", "VLSI");
    type("company", "Acme");
    choose("experience", "5+");
    choose("tshirt", "M");
    expect(document.querySelectorAll(".is-revealed")).toHaveLength(0);
    go();
    await heading(/Review and confirm/);
    go();
    await waitFor(() => expect(eventsApi.registerForEvent).toHaveBeenCalled());
    expect(sent()).toEqual({ status: "Working", college: "COEP", year: "2", degree_type: "UG", pg_spec: "VLSI", company: "Acme", experience: "5+", tshirt: "M" });
  });
});
