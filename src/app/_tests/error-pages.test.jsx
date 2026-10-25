import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * The error page, src/app/error.jsx: a page that couldn't be made, inside
 * the site's frame, with a way to try again. A browser error is sent to
 * Sentry, a server one (it carries a digest) was sent already. The last
 * resort, global-error.jsx, has its own file (global-error.test.jsx).
 */
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, useRouter: () => ({ ...real.useRouter(), refresh: router.refresh }) };
});
vi.mock("@/sentry/lazy", () => ({ reportError: vi.fn() }));

const { reportError } = await import("@/sentry/lazy");
const { default: ErrorPage } = await import("../error.jsx");

beforeEach(() => vi.clearAllMocks());

const page = (props) =>
  render(
    <MemoryRouter initialEntries={["/events/hack-night-04"]}>
      <ErrorPage {...props} />
    </MemoryRouter>
  );

describe("the error page", () => {
  it("says the page couldn't load, inside the site's frame", () => {
    page({ error: new Error("boom"), reset: vi.fn() });
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load this page right now. Check your connection and try again.");
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("alert"));
    expect(screen.getByRole("link", { name: "Skip to content" })).toBeInTheDocument();
  });

  it("tries again: asks the server for the page afresh and resets the boundary", () => {
    const reset = vi.fn();
    page({ error: Object.assign(new Error("API down"), { digest: "123" }), reset });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("sends a browser's error to Sentry, never one the server already sent", () => {
    const fromBrowser = new Error("render failed");
    page({ error: fromBrowser, reset: vi.fn() });
    expect(reportError).toHaveBeenCalledWith(fromBrowser);
    vi.clearAllMocks();
    page({ error: Object.assign(new Error("API down"), { digest: "123" }), reset: vi.fn() });
    expect(reportError).not.toHaveBeenCalled();
  });
});
