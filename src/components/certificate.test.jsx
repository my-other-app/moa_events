import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Certificate, { OldCertificateAddress, certificatePageOf } from "./certificate";

/** A certificate's public id: what its page's address carries. */
const PUBLIC_ID = "q7Hb2_kLm9Zx-41PwT0aReXy";
const NUMBER = "CERT-7K3QF-X9PWM";
const TICKET = "MOA-AAAAA-BBBBB";
const IMAGE = `https://api.test/api/v1/events/certificates/${PUBLIC_ID}/image`;
const PDF = `https://api.test/api/v1/events/certificates/${PUBLIC_ID}/pdf`;

/** checkCertificate's answers (parseVerification's shape). */
const VALID = {
  state: "valid",
  number: NUMBER,
  attendeeName: "Ananya Iyer",
  eventName: "LAN Night",
  orgName: "Respawn Room",
  orgSlug: "respawn-room",
  issuedAt: "2026-09-12T13:00:00Z",
};
const REVOKED = { state: "revoked", number: NUMBER, attendeeName: null, eventName: "LAN Night", orgName: "Respawn Room", orgSlug: null, issuedAt: null };
const NOT_FOUND = { state: "not_found", number: null, attendeeName: null, eventName: null, orgName: null, orgSlug: null, issuedAt: null };

const show = (result, id = PUBLIC_ID) =>
  render(
    <MemoryRouter initialEntries={[`/certificates/${id}`]}>
      <Certificate id={id} result={result} apiBase="https://api.test" />
    </MemoryRouter>
  );

describe("a certificate's page, by its public id", () => {
  it("valid: whose, for what, from whom and when, the club's design and its PDF by the public id, and the check's link to share", () => {
    show(VALID);
    expect(screen.getByRole("heading", { level: 1, name: "LAN Night" })).toBeInTheDocument();
    for (const fact of ["Ananya Iyer", "Respawn Room", "12 Sept 2026"]) expect(screen.getByText(fact)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Respawn Room" })).toHaveAttribute("href", "/clubs/respawn-room");
    const img = screen.getByRole("img", { name: /as the club designed it/ });
    expect(img).toHaveAttribute("src", IMAGE);
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", PDF);
    // The number, and the check's link to share: never this page's.
    expect(screen.getByText(NUMBER)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Check it.s genuine/ })).toHaveAttribute("href", `/verify/${NUMBER}`);
    expect(screen.getByText(`myotherapp.in/verify/${NUMBER}`)).toBeInTheDocument();
    expect(screen.getByText(/share the check.s link rather than this page/)).toBeInTheDocument();
  });

  it("copies the check's link, not the page's own", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    show(VALID);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(`https://myotherapp.in/verify/${NUMBER}`);
    expect(String(writeText.mock.calls[0][0])).not.toContain(PUBLIC_ID);
  });

  it("revoked: says so plainly, with no picture, no PDF and nothing to share", () => {
    show(REVOKED);
    expect(screen.getByRole("heading", { level: 2, name: "This certificate was revoked" })).toBeInTheDocument();
    expect(screen.getByText(/Respawn Room issued it, then withdrew it/)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
    expect(screen.queryByText(NUMBER)).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    expect(screen.getByRole("link", { name: /Check a certificate/ })).toHaveAttribute("href", "/verify");
  });

  it("not found: it can't be shown, and where a fresh link is; nothing asked for by the id", () => {
    show(NOT_FOUND);
    expect(screen.getByRole("heading", { level: 2, name: /This certificate can.t be shown/ })).toBeInTheDocument();
    expect(screen.getByText(/for a fresh link, open yours from My tickets/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My tickets" })).toHaveAttribute("href", "/me/tickets");
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
  });

  it.each([
    ["unavailable", /The connection didn.t go through/],
    ["limited", /Too many certificates were opened from here/],
  ])("%s: says it couldn't load, claims nothing, and offers to try again", (state, words) => {
    show({ state });
    expect(screen.getByRole("heading", { level: 2, name: /We couldn.t load this certificate/ })).toBeInTheDocument();
    expect(screen.getByText(words)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", `/certificates/${PUBLIC_ID}`);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByText(/can.t be shown|revoked/)).toBeNull();
  });

  it("a picture that won't load leaves the PDF and says so", async () => {
    show(VALID);
    fireEvent.error(screen.getByRole("img", { name: /as the club designed it/ }));
    expect(await screen.findByText(/The picture didn.t load just now/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", PDF);
  });
});

/** Where the router went: the old address's redirect shows up here. */
function Where() {
  const { pathname } = useLocation();
  return <p data-testid="where">{pathname}</p>;
}

const old = (props) =>
  render(
    <MemoryRouter initialEntries={[`/certificates/${TICKET}`]}>
      <Routes>
        <Route path="/certificates/:id" element={<OldCertificateAddress ticketId={TICKET} {...props} />} />
      </Routes>
      <Where />
    </MemoryRouter>
  );

describe("an old address, by ticket id", () => {
  it("signed in: asks for the ticket as its page does, and goes on to the certificate's page by its public id", async () => {
    const loadTicket = vi.fn(async () => ({ ticket: { ticket_id: TICKET, certificate_url: `https://myotherapp.in/certificates/${PUBLIC_ID}` }, problem: null }));
    old({ loadTicket, canAsk: () => true });
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(`/certificates/${PUBLIC_ID}`));
    expect(loadTicket).toHaveBeenCalledWith(TICKET);
    // Once: moving on asks nothing again.
    await new Promise((r) => setTimeout(r, 20));
    expect(loadTicket).toHaveBeenCalledTimes(1);
  });

  it("never asks for the certificate's picture or PDF by the ticket id", async () => {
    old({ loadTicket: vi.fn(async () => ({ ticket: { certificate_url: null }, problem: null })), canAsk: () => true });
    expect(await screen.findByText(/This certificate can.t be shown/)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(document.body.innerHTML).not.toContain("/events/certificates/");
  });

  it("a certificate on another host is left for, not routed to", async () => {
    const leave = vi.fn();
    old({ loadTicket: async () => ({ ticket: { certificate_url: `https://staging.example.org/certificates/${PUBLIC_ID}` }, problem: null }), canAsk: () => true, leave });
    await waitFor(() => expect(leave).toHaveBeenCalledWith(`https://staging.example.org/certificates/${PUBLIC_ID}`));
    expect(screen.getByTestId("where")).toHaveTextContent(`/certificates/${TICKET}`);
  });

  it("signed out: asks nobody and shows the page that can't be shown", async () => {
    const loadTicket = vi.fn();
    old({ loadTicket, canAsk: () => false });
    expect(await screen.findByText(/This certificate can.t be shown/)).toBeInTheDocument();
    expect(loadTicket).not.toHaveBeenCalled();
    expect(screen.getByTestId("where")).toHaveTextContent(`/certificates/${TICKET}`);
  });

  it.each([
    ["another account's ticket", { ticket: null, problem: "not_yours" }],
    ["no such ticket", { ticket: null, problem: "missing" }],
    ["a ticket with no certificate", { ticket: { ticket_id: TICKET, certificate_url: null }, problem: null }],
    ["an answer from an older API", { ticket: { ticket_id: TICKET }, problem: null }],
    ["a link back to a ticket-shaped address", { ticket: { certificate_url: `https://myotherapp.in/certificates/${TICKET}` }, problem: null }],
    ["a link to some other page", { ticket: { certificate_url: `https://myotherapp.in/tickets/${PUBLIC_ID}` }, problem: null }],
  ])("signed in, %s: the page that can't be shown, and no redirect", async (_, answer) => {
    old({ loadTicket: async () => answer, canAsk: () => true });
    expect(await screen.findByText(/This certificate can.t be shown/)).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(`/certificates/${TICKET}`);
  });

  it("signed in, no answer: says so, and tries again on asking", async () => {
    const loadTicket = vi
      .fn()
      .mockResolvedValueOnce({ ticket: null, problem: "unreachable" })
      .mockResolvedValueOnce({ ticket: { certificate_url: `https://myotherapp.in/certificates/${PUBLIC_ID}` }, problem: null });
    old({ loadTicket, canAsk: () => true });
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(`/certificates/${PUBLIC_ID}`));
    expect(loadTicket).toHaveBeenCalledTimes(2);
  });
});

describe("where an old address may send its holder", () => {
  it("only to a certificate's page by its public id", () => {
    expect(certificatePageOf(`https://myotherapp.in/certificates/${PUBLIC_ID}`)).toBe(`/certificates/${PUBLIC_ID}`);
    expect(certificatePageOf(`https://www.myotherapp.in/certificates/${PUBLIC_ID}/`)).toBe(`/certificates/${PUBLIC_ID}/`);
    expect(certificatePageOf(`https://staging.example.org/certificates/${PUBLIC_ID}`)).toBe(`https://staging.example.org/certificates/${PUBLIC_ID}`);
    for (const v of [
      null,
      "",
      `https://myotherapp.in/certificates/${TICKET}`,
      `https://myotherapp.in/verify/${PUBLIC_ID}`,
      `javascript:alert(1)//certificates/${PUBLIC_ID}`,
      `https://myotherapp.in/certificates/${PUBLIC_ID}/pdf`,
    ]) {
      expect(certificatePageOf(v), String(v)).toBeNull();
    }
  });
});
