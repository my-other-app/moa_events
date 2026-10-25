import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { CheckForm } from "./checkform";
import { FileCheck, MAX_FILE } from "./filecheck";

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname}</output>;
}

const form = () =>
  render(
    <MemoryRouter initialEntries={["/verify"]}>
      <CheckForm />
      <Where />
    </MemoryRouter>,
  );

describe("the box", () => {
  it("is a plain GET form to /verify, so it works without JavaScript", () => {
    const { container } = form();
    const f = container.querySelector("form");
    expect(f.getAttribute("action")).toBe("/verify");
    expect(f.getAttribute("method")).toBe("get");
    expect(container.querySelector('input[name="code"]')).toBeTruthy();
    expect(screen.getByText(/never by a name or an email/)).toBeInTheDocument();
  });

  it("goes to the number's own page, read and upper-cased in the browser", () => {
    form();
    fireEvent.change(screen.getByLabelText(/Certificate number/), { target: { value: " certificate:moa-7k3qf-x9pwm " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.getByTestId("where")).toHaveTextContent("/verify/CERT-7K3QF-X9PWM");
  });

  it("says at once when it is not a number, and goes nowhere", () => {
    form();
    const input = screen.getByLabelText(/Certificate number/);
    fireEvent.change(input, { target: { value: "Ananya Iyer" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.getByRole("alert")).toHaveTextContent("That isn't a certificate number");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/verify$/);
    // Typing again clears it.
    fireEvent.change(input, { target: { value: "CERT-" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

const HASH = "a".repeat(64);
const OTHER = "b".repeat(64);

function answer(status, body) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function check({ fetchImpl, digest = async () => HASH, file = new File(["%PDF-1.4"], "certificate.pdf", { type: "application/pdf" }) }) {
  const { container } = render(<FileCheck number="CERT-7K3QF-X9PWM" apiBase="https://api.test" fetchImpl={fetchImpl} digest={digest} />);
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
  return container;
}

describe("checking a file", () => {
  it("says the file is exactly the one issued when its SHA-256 is one of ours, and never sends the file", async () => {
    const fetchImpl = answer(200, { available: true, sha256: [OTHER, HASH] });
    const digest = vi.fn(async () => HASH);
    check({ fetchImpl, digest });
    expect(await screen.findByText("This file is exactly the one we issued.")).toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.test/api/v1/verify/certificates/CERT-7K3QF-X9PWM/files");
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(digest).toHaveBeenCalledWith(expect.any(File));
  });

  it("says it differs when it is not", async () => {
    check({ fetchImpl: answer(200, { available: true, sha256: [OTHER] }) });
    expect(await screen.findByText("This file differs from the one we issued.")).toBeInTheDocument();
  });

  it("says the check isn't available when nothing was kept to compare with", async () => {
    check({ fetchImpl: answer(200, { available: false, sha256: [] }) });
    expect(await screen.findByText("File check isn't available for this certificate.")).toBeInTheDocument();
  });

  it("asks the visitor to wait on a 429, and says so plainly on any other failure", async () => {
    check({ fetchImpl: answer(429, { message: "Too many" }) });
    expect(await screen.findByText("Too many checks from here.")).toBeInTheDocument();
  });

  it("an API that fails is not a verdict on the file", async () => {
    check({ fetchImpl: answer(500, {}) });
    expect(await screen.findByText("The file couldn't be checked just now.")).toBeInTheDocument();
    expect(screen.queryByText(/differs/)).toBeNull();
  });

  it("refuses a file too big to be a certificate without asking anyone", async () => {
    const fetchImpl = answer(200, { available: true, sha256: [HASH] });
    const big = new File(["x"], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: MAX_FILE + 1 });
    check({ fetchImpl, file: big });
    await waitFor(() => expect(screen.getByText("That file is too big to be a certificate.")).toBeInTheDocument());
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("works on the real SHA-256 of the file's bytes", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4 the certificate");
    const real = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
    const { sha256Hex } = await import("@/utils/certcode");
    // Node's File, from the same realm as crypto.subtle, as in a browser.
    // jsdom's File hands back its own realm's ArrayBuffer, which Node 20's
    // digest() refuses.
    const { File: SameRealmFile } = await import("node:buffer");
    check({ fetchImpl: answer(200, { available: true, sha256: [real] }), digest: sha256Hex, file: new SameRealmFile([bytes], "c.pdf", { type: "application/pdf" }) });
    expect(await screen.findByText("This file is exactly the one we issued.")).toBeInTheDocument();
  });
});
