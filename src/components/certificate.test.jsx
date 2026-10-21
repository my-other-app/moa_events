import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Certificate from "./certificate";

const TICKET = "MOA-AAAAA-BBBBB";
const show = (props = {}) =>
  render(
    <MemoryRouter initialEntries={[`/certificates/${TICKET}`]}>
      <Certificate ticketid={TICKET} apiBase="https://api.test" {...props} />
    </MemoryRouter>,
  );

describe("a guest's certificate", () => {
  it("shows a visitor the club's design and the PDF, and the check by the printed number, without asking for the ticket", async () => {
    const loadDetails = vi.fn();
    show({ loadDetails, canAsk: () => false });
    const img = screen.getByRole("img", { name: /as the club designed it/ });
    expect(img).toHaveAttribute("src", `https://api.test/api/v1/events/certificates/${TICKET}/image`);
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", `https://api.test/api/v1/events/certificates/${TICKET}/pdf`);
    expect(screen.getByRole("link", { name: /Check a certificate/ })).toHaveAttribute("href", "/verify");
    expect(screen.getByText(/with the number printed on it/)).toBeInTheDocument();
    expect(loadDetails).not.toHaveBeenCalled();
    expect(screen.queryByText(/CERT-/)).toBeNull();
  });

  it("tells its holder the number, the check's link, and to share that rather than this page", async () => {
    const loadDetails = vi.fn(async () => ({ ticket_id: TICKET, certificate_no: "CERT-7K3QF-X9PWM", is_attended: true }));
    show({ loadDetails, canAsk: () => true });
    expect(await screen.findByText("CERT-7K3QF-X9PWM")).toBeInTheDocument();
    expect(loadDetails).toHaveBeenCalledWith(TICKET);
    expect(screen.getByRole("heading", { level: 1, name: "Your certificate" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Check it.s genuine/ })).toHaveAttribute("href", "/verify/CERT-7K3QF-X9PWM");
    expect(screen.getByText("myotherapp.in/verify/CERT-7K3QF-X9PWM")).toBeInTheDocument();
    expect(screen.getByText(/share the check, not this page/)).toBeInTheDocument();
    // Never the ticket id as its number.
    expect(screen.queryByText(TICKET)).toBeNull();
  });

  it("an older certificate's number is the one made from its ticket", async () => {
    show({ loadDetails: async () => ({ ticket_id: "MOA-2BCEBA8-PFZG3", certificate_no: null }), canAsk: () => true });
    expect(await screen.findByText("CERT-2BCEBA8-PFZG3")).toBeInTheDocument();
  });

  it("someone who can't read the ticket is a visitor", async () => {
    show({ loadDetails: async () => null, canAsk: () => true });
    await waitFor(() => expect(screen.getByRole("link", { name: /Check a certificate/ })).toBeInTheDocument());
    expect(screen.queryByText(/Certificate number/)).toBeNull();
  });

  it("says so when the server won't draw it (not issued, or revoked), and offers no download", async () => {
    show({ canAsk: () => false });
    fireEvent.error(screen.getByRole("img", { hidden: true }));
    expect(await screen.findByText(/This certificate can.t be shown/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download PDF" })).toBeNull();
  });

  it("offers its holder nothing to share for a certificate the server won't draw", async () => {
    show({ loadDetails: async () => ({ ticket_id: TICKET, certificate_no: "CERT-7K3QF-X9PWM" }), canAsk: () => true });
    expect(await screen.findByText("CERT-7K3QF-X9PWM")).toBeInTheDocument();
    fireEvent.error(screen.getByRole("img", { hidden: true }));
    expect(await screen.findByText(/This certificate can.t be shown/)).toBeInTheDocument();
    expect(screen.queryByText("CERT-7K3QF-X9PWM")).toBeNull();
    expect(screen.getByRole("link", { name: /Check a certificate/ })).toHaveAttribute("href", "/verify");
  });
});
