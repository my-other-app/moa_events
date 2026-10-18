import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/api/client", () => ({ default: { get: vi.fn(() => new Promise(() => {})), post: vi.fn() } }));

/** The badges and the site's chrome, read fresh with the build's settings as they are now. */
async function load() {
  vi.resetModules();
  const bits = await import("./bits.jsx");
  const chrome = await import("./chrome.jsx");
  return { ...bits, ...chrome };
}

beforeEach(() => {
  window.scrollTo = vi.fn();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the store badges", () => {
  it("link to both stores once the App Store address is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "https://apps.apple.com/in/app/myotherapp/id6700000000");
    const { StoreButtons } = await load();
    render(<StoreButtons />);
    const play = screen.getByRole("link", { name: "Get it on Google Play" });
    expect(play).toHaveAttribute("href", expect.stringContaining("play.google.com"));
    const apple = screen.getByRole("link", { name: "Download on the App Store" });
    expect(apple).toHaveAttribute("href", "https://apps.apple.com/in/app/myotherapp/id6700000000");
    for (const a of [play, apple]) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
      // Drawn, not pasted in: an inline mark, no image to fetch.
      expect(a.querySelector("svg")).not.toBeNull();
      expect(a.querySelector("img")).toBeNull();
    }
    expect(screen.queryByText(/Coming soon/)).toBeNull();
  });

  it("say the App Store is coming soon, as text and not a link, while it isn't set", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "");
    const { StoreButtons } = await load();
    const { container } = render(<StoreButtons tone="light" />);
    expect(screen.getByRole("link", { name: "Get it on Google Play" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /App Store/ })).toBeNull();
    const soon = container.querySelector(".dc-store.is-soon");
    expect(soon.tagName).toBe("SPAN");
    expect(soon).toHaveTextContent("Coming soon on the App Store");
    expect(soon).toHaveClass("dc-store--on-dark");
  });

  it("come in pairs wherever the app is offered: the header's prompt and the footer", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "https://apps.apple.com/app/id1");
    const { SitePage } = await load();
    render(
      <MemoryRouter>
        <SitePage>
          <p>Page</p>
        </SitePage>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Get the app" }));
    const prompt = screen.getByRole("dialog", { name: "Get MyOtherApp" });
    expect(within(prompt).getByRole("link", { name: "Get it on Google Play" })).toBeInTheDocument();
    expect(within(prompt).getByRole("link", { name: "Download on the App Store" })).toHaveAttribute("href", "https://apps.apple.com/app/id1");
    fireEvent.keyDown(document, { key: "Escape" });

    const apps = screen.getByRole("navigation", { name: "Get the app" });
    expect(within(apps).getByRole("link", { name: "Android app" })).toHaveAttribute("href", expect.stringContaining("play.google.com"));
    expect(within(apps).getByRole("link", { name: "iPhone app" })).toHaveAttribute("href", "https://apps.apple.com/app/id1");
  });

  it("show the iPhone app as coming soon in the footer while it isn't out", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", "");
    const { SiteFooter } = await load();
    render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>
    );
    const apps = screen.getByRole("navigation", { name: "Get the app" });
    expect(within(apps).getAllByRole("link")).toHaveLength(1);
    expect(within(apps).getByText("Coming soon")).toBeInTheDocument();
    // And the site's own pages are one click away.
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "mailto:support@myotherapp.in");
  });
});
