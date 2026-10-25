import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

/*
 * The last-resort error page, src/app/global-error.jsx, for when even the
 * site's frame failed: a whole document of its own, plain words, a way to
 * try again and a full page load home.
 *
 * Its <html> and <body> are the page's own, so it is rendered into the
 * test's document, the first React root in this file: React listens for
 * events on a document only when no other root has claimed it first.
 */
vi.mock("@/sentry/lazy", () => ({ reportError: vi.fn() }));

const { reportError } = await import("@/sentry/lazy");
const { default: GlobalError } = await import("../global-error.jsx");

describe("the last-resort error page", () => {
  it("tries again when asked, and reports a browser's error", () => {
    const reset = vi.fn();
    const error = new Error("layout failed");
    const { unmount } = render(<GlobalError error={error} reset={reset} />, { container: document });
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(error);
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
    unmount();
  });

  it("never reports an error the server already sent (it carries a digest)", () => {
    vi.mocked(reportError).mockClear();
    const { unmount } = render(<GlobalError error={Object.assign(new Error("boom"), { digest: "1" })} reset={() => {}} />, { container: document });
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeInTheDocument();
    expect(reportError).not.toHaveBeenCalled();
    unmount();
  });

  it("is a whole document of its own", () => {
    const html = renderToStaticMarkup(<GlobalError error={new Error("boom")} reset={() => {}} />);
    expect(html).toMatch(/^<html lang="en">(<head><\/head>)?<body/);
    expect(html).toContain("We couldn&#x27;t load MyOtherApp just now. Try again in a moment.");
    expect(html).toContain('<a href="/"');
  });
});
