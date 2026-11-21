import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CodeEntry } from "./codeentry.jsx";
import { QuestBoard } from "./board.jsx";
import { QuestMeter } from "./meter.jsx";

/*
 * The quest card's own parts on their own: the progress bar, entering a
 * code (what is said under it, the lock after too many tries) and the
 * leaderboard (read when opened).
 */

describe("the progress bar", () => {
  it("is a progressbar with its words, filled by transform, with the milestones marked", () => {
    const { container } = render(<QuestMeter value={6} max={20} marks={[5, 10, 20]} label="6 of 20 points" />);
    const bar = screen.getByRole("progressbar", { name: "Quest progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "6");
    expect(bar).toHaveAttribute("aria-valuemax", "20");
    expect(bar).toHaveAttribute("aria-valuetext", "6 of 20 points");
    expect(container.querySelector(".qs-meter-fill").style.transform).toBe("scaleX(0.3)");
    const marks = container.querySelectorAll(".qs-meter-mark");
    // The last milestone is the bar's end: no mark for it.
    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveClass("is-passed");
    expect(marks[1]).not.toHaveClass("is-passed");
  });

  it("never runs past either end", () => {
    const { container, rerender } = render(<QuestMeter value={50} max={20} label="x" />);
    expect(container.querySelector(".qs-meter-fill").style.transform).toBe("scaleX(1)");
    rerender(<QuestMeter value={-3} max={0} label="x" />);
    expect(container.querySelector(".qs-meter-fill").style.transform).toBe("scaleX(0)");
  });
});

describe("entering a code", () => {
  it("sends what was typed and says what came back; a good one clears the field", async () => {
    const onSubmit = vi.fn(async () => ({ tone: "good", line: "Code accepted: Keynote word (+2 points)" }));
    render(<CodeEntry onSubmit={onSubmit} />);
    const field = screen.getByLabelText("Enter a code");
    fireEvent.change(field, { target: { value: "  cloud 26 " } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Code accepted: Keynote word (+2 points)"));
    expect(onSubmit).toHaveBeenCalledWith("cloud 26");
    expect(field).toHaveValue("");
    expect(field).not.toHaveAttribute("aria-invalid");
  });

  it("keeps a wrong code in the field and marks it", async () => {
    render(<CodeEntry onSubmit={async () => ({ tone: "bad", line: "That's not one of this event's codes. 4 tries left." })} />);
    const field = screen.getByLabelText("Enter a code");
    fireEvent.change(field, { target: { value: "nope" } });
    fireEvent.submit(field.closest("form"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("4 tries left"));
    expect(field).toHaveValue("nope");
    expect(field).toHaveAttribute("aria-invalid", "true");
  });

  it("asks for a code before sending an empty one", async () => {
    const onSubmit = vi.fn();
    render(<CodeEntry onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Type the code first.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("says it's checking, and sends once however often it's pressed", async () => {
    let done;
    const onSubmit = vi.fn(() => new Promise((r) => (done = r)));
    render(<CodeEntry onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Enter a code"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByRole("button", { name: "Checking…" })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("Enter a code").closest("form"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => done({ tone: "bad", line: "No." }));
    expect(screen.getByRole("button", { name: "Check" })).toBeEnabled();
  });

  it("shows the card's word until it has said something of its own", async () => {
    render(<CodeEntry hint="2 tries left this hour." onSubmit={async () => ({ tone: "bad", line: "That isn't one of this quest's codes. 1 try left this hour." })} />);
    expect(screen.getByText("2 tries left this hour.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Enter a code"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 try left this hour."));
    expect(screen.queryByText("2 tries left this hour.")).toBeNull();
  });

  it("can't be sent while locked, and says why", () => {
    const onSubmit = vi.fn();
    render(<CodeEntry onSubmit={onSubmit} lockedLine="Too many wrong codes. Try again in 10 minutes." />);
    expect(screen.getByLabelText("Enter a code")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Too many wrong codes. Try again in 10 minutes.");
  });
});

describe("the leaderboard", () => {
  const rows = [
    { rank: 1, name: "Rohan K.", points: 31, me: false },
    { rank: 2, name: "Meera N.", points: 24, me: true },
  ];

  it("is folded, and read only when opened", async () => {
    const load = vi.fn(async () => ({ rows, me: { rank: 2, points: 24 } }));
    render(<QuestBoard load={load} />);
    const toggle = screen.getByRole("button", { name: "Leaderboard" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(load).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const list = await screen.findByRole("list", { name: "Leaderboard, by points" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(list.querySelector(".is-me")).toHaveTextContent("Meera N. (you)");
    // Already on the board: no extra line about where they stand.
    expect(screen.queryByText(/You’re/)).toBeNull();
  });

  it("says where the guest stands when they're below the rows shown", async () => {
    render(<QuestBoard load={async () => ({ rows: [rows[0]], me: { rank: 14, points: 6 } })} />);
    fireEvent.click(screen.getByRole("button", { name: "Leaderboard" }));
    expect(await screen.findByText((_, el) => el?.classList?.contains("qs-board-mine") && el.textContent === "You’re #14 with 6 points.")).toBeInTheDocument();
  });

  it("says so when nobody is on it, or it didn't load", async () => {
    const { unmount } = render(<QuestBoard load={async () => ({ rows: [], me: null })} />);
    fireEvent.click(screen.getByRole("button", { name: "Leaderboard" }));
    expect(await screen.findByText("Nobody is on the board yet.")).toBeInTheDocument();
    unmount();
    render(<QuestBoard load={async () => Promise.reject(new Error("down"))} />);
    fireEvent.click(screen.getByRole("button", { name: "Leaderboard" }));
    expect(await screen.findByText(/didn’t load/)).toBeInTheDocument();
  });
});
