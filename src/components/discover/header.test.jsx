import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

const get = vi.fn();
const del = vi.fn(() => Promise.resolve({ data: {} }));
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn(), delete: del } }));

const { AuthProvider } = await import("@/auth/AuthProvider");
const { SiteHeader } = await import("./chrome.jsx");
const { PROFILE, enableSignIn, resetAuth, signInAs, stubGoogle } = await import("@/test/auth");

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname}</output>;
}

const show = () =>
  render(
    <MemoryRouter initialEntries={["/events"]}>
      <AuthProvider>
        <SiteHeader />
        <Where />
      </AuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  window.scrollTo = vi.fn();
  get.mockImplementation(async (url) => (url === "/api/v1/user/profile/me" ? { data: PROFILE } : { data: {} }));
});
afterAll(() => {
  resetAuth();
  vi.unstubAllEnvs();
});

describe("the header, signing in", () => {
  it("has no sign-in at all when the build has no Google client id", () => {
    show();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Your account/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Get the app" })).toBeInTheDocument();
  });

  it("signed out: a quiet Sign in next to Get the app, which opens the sign-in sheet", async () => {
    enableSignIn();
    stubGoogle();
    show();
    const signIn = screen.getByRole("button", { name: "Sign in" });
    // Beside "Get the app", before it.
    expect(signIn.compareDocumentPosition(screen.getByRole("button", { name: "Get the app" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(signIn);
    const sheet = await screen.findByRole("dialog", { name: "Sign in" });
    expect(within(sheet).getByText("Your tickets in one place, on the web and in the app.")).toBeInTheDocument();
    expect(await within(sheet).findByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("signed in: the avatar with a menu — My tickets, Following, Sign out", async () => {
    enableSignIn();
    stubGoogle();
    signInAs();
    show();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    const avatar = screen.getByRole("button", { name: "Your account, Asha Rao" });
    expect(avatar).toHaveAttribute("aria-expanded", "false");
    expect(within(avatar).getByText("AR")).toBeInTheDocument();

    fireEvent.click(avatar);
    expect(avatar).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("asha@example.org")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My tickets" })).toHaveAttribute("href", "/me/tickets");
    expect(screen.getByRole("link", { name: "Following" })).toHaveAttribute("href", "/me/following");

    // Escape closes it and hands focus back.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(avatar).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(avatar);

    fireEvent.click(avatar);
    fireEvent.click(screen.getByRole("link", { name: "My tickets" }));
    expect(screen.getByTestId("where").textContent).toBe("/me/tickets");
    expect(screen.queryByRole("link", { name: "Following" })).toBeNull();

    fireEvent.click(avatar);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(localStorage.getItem("moa.session")).toBeNull();
  });

  it("shows the person's photo when the account has one", () => {
    enableSignIn();
    signInAs({ profile: { ...PROFILE, profile: { ...PROFILE.profile, profile_pic: { thumbnail: "https://cdn.example/asha-t.jpg" } } } });
    show();
    const img = screen.getByRole("button", { name: "Your account, Asha Rao" }).querySelector("img");
    expect(img).toHaveAttribute("src", "https://cdn.example/asha-t.jpg");
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
  });
});
