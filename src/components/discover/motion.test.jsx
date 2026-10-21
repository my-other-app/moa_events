import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { usePresence } from "@/utils/presence";
import { Img } from "./img.jsx";
import { Poll } from "./threadcard.jsx";
import { Dialog } from "./dialog.jsx";

/*
 * The site's motion as the components drive it (the moving itself is
 * styles/motion.css): what waits for an exit, which images fade, and that a
 * poll's bars move by transform.
 */

function Menu({ initial = false }) {
  const [open, setOpen] = useState(initial);
  const panel = useRef(null);
  const { mounted, leaving } = usePresence(open, panel);
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)}>
        Toggle
      </button>
      {mounted ? (
        <div ref={panel} data-testid="panel" data-leaving={leaving ? "" : undefined}>
          Panel
        </div>
      ) : null}
    </>
  );
}

/** Stand-in for the Web Animations API: an exit (motion-out-*) that ends when we say. */
function stubExit() {
  let finish;
  const finished = new Promise((r) => {
    finish = r;
  });
  const spy = vi.spyOn(HTMLElement.prototype, "getAnimations").mockImplementation(function () {
    return this.hasAttribute("data-leaving") ? [{ animationName: "motion-out-drop", finished }, { animationName: "rg-spin", finished: new Promise(() => {}) }] : [];
  });
  return { finish: () => finish(), spy };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete HTMLElement.prototype.getAnimations;
});

describe("usePresence", () => {
  it("goes at once where nothing animates (no Web Animations API, or less motion asked for)", () => {
    render(<Menu />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(screen.getByTestId("panel")).not.toHaveAttribute("data-leaving");
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(screen.queryByTestId("panel")).toBeNull();
  });

  it("stays, marked as leaving, until its exit ends, waiting only for motion-out animations", async () => {
    HTMLElement.prototype.getAnimations = () => [];
    const exit = stubExit();
    render(<Menu initial />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(screen.getByTestId("panel")).toHaveAttribute("data-leaving");
    await act(async () => exit.finish());
    expect(screen.queryByTestId("panel")).toBeNull();
  });

  it("keeps it when it opens again while leaving", async () => {
    HTMLElement.prototype.getAnimations = () => [];
    const exit = stubExit();
    render(<Menu initial />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(screen.getByTestId("panel")).toHaveAttribute("data-leaving");
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(screen.getByTestId("panel")).not.toHaveAttribute("data-leaving");
    await act(async () => exit.finish());
    expect(screen.getByTestId("panel")).toBeInTheDocument();
  });

  it("lets a dialog fade away, inert, while focus is already back", async () => {
    HTMLElement.prototype.getAnimations = () => [];
    const exit = stubExit();
    function Page() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} labelledBy="t" className="dc-modal" backdropClassName="dc-modal-backdrop">
            <h2 id="t">Hello</h2>
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </Dialog>
        </>
      );
    }
    render(<Page />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Hello" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const backdrop = document.querySelector(".dc-modal-backdrop");
    expect(backdrop).toHaveAttribute("data-leaving");
    expect(backdrop).toHaveAttribute("inert");
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
    await act(async () => exit.finish());
    expect(document.querySelector(".dc-modal-backdrop")).toBeNull();
  });
});

describe("Img", () => {
  const notYet = () => vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(false);

  it("lets a lazy image still on its way wait, and fade in when it arrives", () => {
    notYet();
    render(<Img src="https://cdn.example/p.jpg" alt="Poster" />);
    const img = screen.getByAltText("Poster");
    expect(img).toHaveAttribute("data-fade", "wait");
    fireEvent.load(img);
    expect(img).toHaveAttribute("data-fade", "in");
  });

  it("never holds back an eager image (a page's largest paint)", () => {
    notYet();
    render(<Img src="https://cdn.example/p.jpg" alt="Poster" loading="eager" fetchPriority="high" />);
    const img = screen.getByAltText("Poster");
    expect(img).not.toHaveAttribute("data-fade");
    fireEvent.load(img);
    expect(img).not.toHaveAttribute("data-fade");
  });

  it("leaves an image that is already there alone", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    render(<Img src="https://cdn.example/p.jpg" alt="Poster" />);
    expect(screen.getByAltText("Poster")).not.toHaveAttribute("data-fade");
  });
});

describe("a poll's bars", () => {
  it("are scaled to their share (a transform), never sized, so a vote moves nothing else", () => {
    const poll = { options: [{ id: "a", label: "Friday", share: 60 }, { id: "b", label: "Saturday", share: 40 }], votes: 5, voted_option_id: null };
    const { container } = render(<Poll poll={poll} />);
    const bars = container.querySelectorAll(".dc-poll-bar");
    expect(bars[0].style.transform).toBe("scaleX(0.6)");
    expect(bars[1].style.transform).toBe("scaleX(0.4)");
    expect(bars[0].style.width).toBe("");
  });
});
