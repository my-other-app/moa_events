import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * /help's islands, a request's page, the survey link, "Get help" on an
 * error, and the For-clubs page's "Talk to us". The desk's calls are mocked
 * (the module answers with what it parses): nothing leaves the test. A 404
 * from the API (no desk yet) must always end in "email us", never in a
 * broken form.
 */
vi.mock("@/api/support", () => ({
  supportApi: { help: vi.fn(), topics: vi.fn(), upload: vi.fn(), send: vi.fn(), mine: vi.fn(), request: vi.fn(), reply: vi.fn(), surveyMine: vi.fn(), survey: vi.fn() },
  leadsApi: { talkToUs: vi.fn() },
}));
const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn(), delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

const { supportApi, leadsApi } = await import("@/api/support");
const { AuthProvider } = await import("@/auth/AuthProvider");
const { apiFailure } = await import("@/utils/ticketing");
const { parseRequestDetail } = await import("@/utils/help");
const { HelpForm } = await import("./helpform");
const { MyRequests } = await import("./myrequests");
const RequestThread = (await import("./thread")).default;
const SurveyPage = (await import("./survey")).default;
const { GetHelpLink } = await import("./gethelp");
const { TalkToUs } = await import("../discover/talktous");
const { PayNote } = await import("../register/finishpayment");
const { describePayment } = await import("@/utils/payment");
const { PROFILE, enableSignIn, resetAuth, signInAs } = await import("@/test/auth");

const TOPICS = [
  { key: "tickets", label: "Tickets and registration" },
  { key: "payments", label: "Payments and refunds" },
];
const notFound = () => apiFailure({ response: { status: 404, data: { detail: "Not Found" } } });

const show = (ui, path = "/help") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  );
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  get.mockImplementation(async (url) => (url === "/api/v1/user/profile/me" ? { data: PROFILE } : { data: {} }));
});
afterAll(() => resetAuth());

describe("the help form", () => {
  it("asks a guest for a name and an email, warns about secrets, and sends the request", async () => {
    supportApi.send.mockResolvedValue({ id: 9, number: 1042, status: "new" });
    show(<HelpForm topics={TOPICS} />);
    expect(screen.getByText(/Never send passwords, OTPs or card numbers/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Choose what it's about.")).toBeInTheDocument();
    expect(screen.getByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your email, so we can reply.")).toBeInTheDocument();
    expect(screen.getByText("Tell us what happened.")).toBeInTheDocument();
    expect(supportApi.send).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("What's it about?"), { target: { value: "tickets" } });
    type("Your name", "Asha Rao");
    type("Your email", "asha@example");
    type("What happened?", "My ticket never came.");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Enter an email address like name@example.com.")).toBeInTheDocument();
    type("Your email", "asha@example.org");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("heading", { name: "Thanks, we’ve got it (request #1042)" })).toBeInTheDocument();
    expect(supportApi.send).toHaveBeenCalledWith({
      topic: "tickets",
      message: "My ticket never came.",
      name: "Asha Rao",
      email: "asha@example.org",
      context: { platform: "web" },
    });
    expect(screen.getByText(/reply by email to asha@example.org/)).toBeInTheDocument();
  });

  it("says so when a card number is typed", () => {
    show(<HelpForm topics={TOPICS} />);
    type("What happened?", "I paid with 4111 1111 1111 1111 and got nothing");
    expect(screen.getByRole("alert")).toHaveTextContent("That looks like a card number");
  });

  it("opens from a Get help link with the topic picked and the error going along", async () => {
    supportApi.send.mockResolvedValue({ id: 9, number: 7, status: "new" });
    show(<HelpForm topics={TOPICS} />, "/help?topic=payments&error_code=PAYMENT_ORDER_MISMATCH&track_id=trk_1&event_id=68&from=%2Fclaim%2Fsecret-token#ask");
    await waitFor(() => expect(screen.getByLabelText("What's it about?")).toHaveValue("payments"));
    expect(screen.getByText(/We’ll include the error \(PAYMENT_ORDER_MISMATCH\), its reference \(trk_1\) and the page you were on \(\/claim\/\[code\]\)/)).toBeInTheDocument();
    type("Your name", "Asha");
    type("Your email", "asha@example.org");
    type("What happened?", "Charged twice");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("heading", { name: /Thanks, we’ve got it/ });
    expect(supportApi.send.mock.calls[0][0].context).toEqual({
      platform: "web",
      page_url: "https://myotherapp.in/claim/[code]",
      error_code: "PAYMENT_ORDER_MISMATCH",
      track_id: "trk_1",
      event_id: 68,
    });
  });

  it("signed in: no name or email asked, and the request is the account's", async () => {
    enableSignIn();
    signInAs();
    supportApi.send.mockResolvedValue({ id: 9, number: 1042, status: "new" });
    show(<HelpForm topics={TOPICS} />);
    expect(await screen.findByText(/Signed in as/)).toHaveTextContent("Signed in as asha@example.org");
    expect(screen.queryByLabelText("Your email")).toBeNull();
    fireEvent.change(screen.getByLabelText("What's it about?"), { target: { value: "payments" } });
    type("What happened?", "Refund?");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("heading", { name: /Thanks/ });
    expect(supportApi.send.mock.calls[0][0]).not.toHaveProperty("email");
    expect(screen.getByRole("link", { name: "See your request" })).toHaveAttribute("href", "/help/requests/9");
  });

  it("becomes 'Email us' when the API has no desk: on its topics (404)…", async () => {
    supportApi.topics.mockResolvedValue(null);
    show(<HelpForm topics={null} />);
    expect(await screen.findByRole("heading", { name: "Email us" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /support@myotherapp.in/ })).toHaveAttribute("href", expect.stringMatching(/^mailto:support@myotherapp\.in/));
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("…or on sending (404), with the message already in the email", async () => {
    supportApi.send.mockRejectedValue(notFound());
    show(<HelpForm topics={TOPICS} />);
    fireEvent.change(screen.getByLabelText("What's it about?"), { target: { value: "tickets" } });
    type("Your name", "Asha");
    type("Your email", "asha@example.org");
    type("What happened?", "No ticket for Hack Night");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("heading", { name: "Email us instead" })).toBeInTheDocument();
    const href = screen.getByRole("link", { name: /support@myotherapp.in/ }).getAttribute("href");
    expect(decodeURIComponent(href)).toContain("No ticket for Hack Night");
    expect(decodeURIComponent(href)).toContain("subject=Tickets and registration");
  });

  it("says a refusal plainly and keeps what was typed", async () => {
    supportApi.send.mockRejectedValue(apiFailure({ response: { status: 429, data: {}, headers: {} } }));
    show(<HelpForm topics={TOPICS} />);
    fireEvent.change(screen.getByLabelText("What's it about?"), { target: { value: "tickets" } });
    type("Your name", "Asha");
    type("Your email", "asha@example.org");
    type("What happened?", "Hello");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/That's a lot of messages in a row/)).toBeInTheDocument();
    expect(screen.getByLabelText("What happened?")).toHaveValue("Hello");
  });

  it("uploads screenshots as they're picked, up to three, and sends their keys", async () => {
    supportApi.upload.mockImplementation(async (f) => ({ key: `k-${f.name}`, name: f.name, size: f.size }));
    supportApi.send.mockResolvedValue({ id: 1, number: 1, status: "new" });
    show(<HelpForm topics={TOPICS} />);
    const input = screen.getByLabelText("Choose screenshots");
    const png = (n) => new File(["x"], `${n}.png`, { type: "image/png" });
    fireEvent.change(input, { target: { files: [png("a"), new File(["x"], "b.gif", { type: "image/gif" })] } });
    expect(await screen.findByText(/b.gif isn't a picture or a PDF/)).toBeInTheDocument();
    await waitFor(() => expect(supportApi.upload).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Choose screenshots"), { target: { files: [png("c")] } });
    await waitFor(() => expect(supportApi.upload).toHaveBeenCalledTimes(2));
    // Three in the list: the picker is gone.
    expect(screen.queryByLabelText("Choose screenshots")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove b.gif" }));
    fireEvent.change(screen.getByLabelText("What's it about?"), { target: { value: "tickets" } });
    type("Your name", "Asha");
    type("Your email", "asha@example.org");
    type("What happened?", "See screenshots");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("heading", { name: /Thanks/ });
    expect(supportApi.send.mock.calls[0][0].attachments).toEqual(["k-a.png", "k-c.png"]);
  });
});

describe("My requests", () => {
  it("lists the signed-in person's requests, with a dot on a new reply", async () => {
    enableSignIn();
    signInAs();
    supportApi.mine.mockResolvedValue([{ id: 7, number: 1042, subject: "Ticket missing", topic: "tickets", status: "waiting", updatedAt: null, unread: true }]);
    show(<MyRequests />);
    const row = await screen.findByRole("link", { name: /Ticket missing/ });
    expect(row).toHaveAttribute("href", "/help/requests/7");
    expect(within(row).getByLabelText("New reply")).toBeInTheDocument();
    expect(row).toHaveTextContent("Waiting for you");
  });

  it("shows nothing while the API has no desk (404), and offers sign-in when signed out", async () => {
    enableSignIn();
    signInAs();
    supportApi.mine.mockResolvedValue(null);
    const { container, unmount } = show(<MyRequests />);
    await waitFor(() => expect(supportApi.mine).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();
    resetAuth();
    enableSignIn();
    show(<MyRequests />);
    expect(await screen.findByRole("button", { name: "Sign in to see your requests" })).toBeInTheDocument();
  });
});

describe("a request's own page", () => {
  const thread = (over = {}) =>
    parseRequestDetail({
      id: 7,
      number: 1042,
      subject: "Ticket missing",
      status: "open",
      created_at: "2026-11-10T10:00:00+05:30",
      messages: [
        { id: 1, kind: "reply_in", body_text: "No ticket", created_at: "2026-11-10T10:00:00+05:30", attachments: [] },
        { id: 2, kind: "reply_out", body_text: "Sent it again", author_name: "Meera", created_at: "2026-11-10T11:00:00+05:30", attachments: [{ name: "ticket.pdf", url: "https://files.example/t.pdf" }] },
      ],
      can_reply: true,
      survey: null,
      ...over,
    });

  it("asks a signed-out person to sign in", async () => {
    enableSignIn();
    show(<RequestThread id="7" />, "/help/requests/7");
    expect(await screen.findByRole("heading", { name: "Sign in to see your request" })).toBeInTheDocument();
    expect(supportApi.request).not.toHaveBeenCalled();
  });

  it("shows the thread and sends a reply", async () => {
    enableSignIn();
    signInAs();
    supportApi.request.mockResolvedValue(thread());
    supportApi.reply.mockResolvedValue({});
    show(<RequestThread id="7" />, "/help/requests/7");
    expect(await screen.findByRole("heading", { name: "Ticket missing" })).toBeInTheDocument();
    expect(screen.getByText("Meera, MyOtherApp support")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ticket.pdf" })).toHaveAttribute("href", "https://files.example/t.pdf");
    fireEvent.change(screen.getByLabelText("Your reply"), { target: { value: "Got it, thanks" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
    await waitFor(() => expect(supportApi.reply).toHaveBeenCalledWith(7, { message: "Got it, thanks" }));
    await waitFor(() => expect(supportApi.request).toHaveBeenCalledTimes(2));
  });

  it("asks 'Did we solve it?' once it's solved, and takes no reply when closed", async () => {
    enableSignIn();
    signInAs();
    supportApi.request.mockResolvedValue(thread({ status: "closed", can_reply: false }));
    supportApi.surveyMine.mockResolvedValue({});
    show(<RequestThread id="7" />, "/help/requests/7");
    expect(await screen.findByText(/This request is closed/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Your reply")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Yes, it's solved/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/Glad it's sorted/)).toBeInTheDocument();
    expect(supportApi.surveyMine).toHaveBeenCalledWith(7, { solved: true });
  });

  it("says it can't find one that isn't theirs (404)", async () => {
    enableSignIn();
    signInAs();
    supportApi.request.mockRejectedValue(notFound());
    show(<RequestThread id="99" />, "/help/requests/99");
    expect(await screen.findByRole("heading", { name: "We couldn't find this request" })).toBeInTheDocument();
  });
});

describe("the survey link", () => {
  it("picks the email's answer but sends nothing until asked", async () => {
    supportApi.survey.mockResolvedValue({});
    show(<SurveyPage token="tok-abcdefghijklmnop" solved={false} />, "/help/survey/tok-abcdefghijklmnop?solved=no");
    expect(screen.getByRole("button", { name: /No, not yet/ })).toHaveAttribute("aria-pressed", "true");
    expect(supportApi.survey).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Anything to add/), { target: { value: "Still no ticket" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("heading", { name: "Thank you" })).toBeInTheDocument();
    expect(supportApi.survey).toHaveBeenCalledWith("tok-abcdefghijklmnop", { solved: false, comment: "Still no ticket" });
  });

  it("thanks someone who answered already (409), and says when the link is no good (404)", async () => {
    supportApi.survey.mockRejectedValueOnce(apiFailure({ response: { status: 409, data: {} } }));
    const { unmount } = show(<SurveyPage token="tok-abcdefghijklmnop" solved />);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("You've already told us how it went.")).toBeInTheDocument();
    unmount();
    supportApi.survey.mockRejectedValueOnce(notFound());
    show(<SurveyPage token="tok-abcdefghijklmnop" solved />);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("heading", { name: "This link isn’t valid" })).toBeInTheDocument();
  });
});

describe("Get help on an error", () => {
  it("links to /help with the error, the reference and the page (masked), in a new tab", async () => {
    show(<GetHelpLink help={{ topic: "payments", errorCode: "PAYMENT_ORDER_MISMATCH", trackId: "trk_1" }} />);
    const a = screen.getByRole("link", { name: /Get help/ });
    expect(a).toHaveAttribute("target", "_blank");
    await waitFor(() => expect(a.getAttribute("href")).toMatch(/^\/help\?topic=payments&error_code=PAYMENT_ORDER_MISMATCH&track_id=trk_1&from=/));
  });

  it("goes with the payment refusals that say to write to support, and not with the others", () => {
    const mismatch = describePayment("verify", { code: "PAYMENT_ORDER_MISMATCH", trackId: "trk_2" });
    expect(mismatch.help).toEqual({ topic: "payments", errorCode: "PAYMENT_ORDER_MISMATCH", trackId: "trk_2" });
    const { unmount } = show(<PayNote problem={mismatch} />);
    expect(screen.getByRole("link", { name: /Get help/ })).toBeInTheDocument();
    unmount();
    const notYet = describePayment("verify", { code: "PAYMENT_NOT_FOUND" });
    expect(notYet.help).toBeUndefined();
    show(<PayNote problem={notYet} />);
    expect(screen.queryByRole("link", { name: /Get help/ })).toBeNull();
  });
});

describe("Talk to us (For clubs)", () => {
  const fill = () => {
    type("Your name", "Asha Rao");
    type("Club or college", "Circuit Society");
    type("Email", "asha@circuit.example.org");
  };

  it("checks what it needs, then sends a lead", async () => {
    leadsApi.talkToUs.mockResolvedValue({ ok: true });
    show(<TalkToUs />, "/for-clubs");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your club's or college's name.")).toBeInTheDocument();
    fill();
    fireEvent.click(screen.getByLabelText("A sponsor"));
    expect(screen.getByLabelText("Organisation")).toHaveValue("Circuit Society");
    type(/^City/, "Kochi");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("heading", { name: "Thanks, Asha" })).toBeInTheDocument();
    expect(leadsApi.talkToUs).toHaveBeenCalledWith({
      name: "Asha Rao",
      email: "asha@circuit.example.org",
      organisation: "Circuit Society",
      type: "sponsor",
      city: "Kochi",
      page_url: "https://myotherapp.in/for-clubs",
    });
  });

  it("opens an email with the details while the API has no route (404)", async () => {
    leadsApi.talkToUs.mockRejectedValue(notFound());
    show(<TalkToUs />, "/for-clubs");
    fill();
    type(/^What would you like to talk about\?/, "Our fest in March");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("heading", { name: "Email us instead" })).toBeInTheDocument();
    const href = decodeURIComponent(screen.getByRole("link", { name: /Write the email/ }).getAttribute("href"));
    expect(href).toMatch(/^mailto:support@myotherapp\.in\?subject=Talk to us: Circuit Society/);
    expect(href).toContain("Our fest in March");
    expect(href).toContain("Email: asha@circuit.example.org");
  });
});

