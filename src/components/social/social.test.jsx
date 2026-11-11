import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/* /data-deletion's status (by ?code=) and the share row's Copy link. The API is mocked. */
vi.mock("@/api/social", () => ({ socialApi: { deletionStatus: vi.fn() } }));
const { socialApi } = await import("@/api/social");
const { apiFailure } = await import("@/utils/ticketing");
const { DeletionStatus } = await import("./deletionstatus");
const { CopyLinkButton } = await import("../discover/eventislands");

const at = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DeletionStatus />
    </MemoryRouter>,
  );

beforeEach(() => vi.clearAllMocks());

describe("a data deletion request's status", () => {
  it("shows nothing without a code", () => {
    const { container } = at("/data-deletion");
    expect(container).toBeEmptyDOMElement();
    expect(socialApi.deletionStatus).not.toHaveBeenCalled();
  });

  it("says it's done, with the code and what was deleted", async () => {
    socialApi.deletionStatus.mockResolvedValue({ code: "a1b2c3d4", status: "completed", requestedAt: "2026-11-11T10:00:00Z", completedAt: "2026-11-11T10:00:00Z", accounts: 1, what: "Connected Facebook Pages." });
    at("/data-deletion?code=a1b2c3d4");
    expect(await screen.findByText("Your data has been deleted")).toBeInTheDocument();
    expect(screen.getByText("Confirmation code: a1b2c3d4")).toBeInTheDocument();
    expect(screen.getByText(/Connected Facebook Pages\./)).toBeInTheDocument();
    expect(socialApi.deletionStatus).toHaveBeenCalledWith("a1b2c3d4");
  });

  it("says when there's no such request, and when it can't be looked up (an API without it)", async () => {
    socialApi.deletionStatus.mockRejectedValueOnce(apiFailure({ response: { status: 404, data: { error_code: "DELETION_NOT_FOUND" } } }));
    const { unmount } = at("/data-deletion?code=zzzz9999");
    expect(await screen.findByText("We can't find that request")).toBeInTheDocument();
    unmount();
    socialApi.deletionStatus.mockRejectedValueOnce(apiFailure({ response: { status: 404, data: { detail: "Not Found" } } }));
    at("/data-deletion?code=zzzz9999");
    expect(await screen.findByText("We've got your request")).toBeInTheDocument();
    expect(screen.getByText(/quote zzzz9999/)).toBeInTheDocument();
  });

  it("never sends something that isn't a code", async () => {
    at("/data-deletion?code=%3Cscript%3E");
    expect(await screen.findByText("That code doesn't look right")).toBeInTheDocument();
    expect(socialApi.deletionStatus).not.toHaveBeenCalled();
  });
});

describe("Copy link", () => {
  it("copies the row's own link and says so", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<CopyLinkButton url="https://r.myotherapp.in/c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://r.myotherapp.in/c1"));
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });
});
