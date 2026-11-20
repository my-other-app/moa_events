import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import PhotoFramer from "./framer.jsx";
import { CENTRED } from "@/utils/posterframe";

/*
 * The framing editor: the photo moved by a drag, a pinch, the slider and the
 * keyboard, always covering the frame. jsdom lays nothing out, so the frame
 * is given a size (300 × 300 at the page's top-left corner).
 */
const photo = { w: 4000, h: 3000 };

let rect;
beforeEach(() => {
  rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 300, height: 300, right: 300, bottom: 300, x: 0, y: 0 });
  HTMLElement.prototype.setPointerCapture = vi.fn();
});
afterEach(() => {
  rect.mockRestore();
  delete HTMLElement.prototype.setPointerCapture;
});

function Harness({ onChange, round = false, aspect = 1, start = CENTRED }) {
  const [f, setF] = useState(start);
  return (
    <PhotoFramer
      src="blob:me"
      natural={photo}
      aspect={aspect}
      round={round}
      framing={f}
      onChange={(next) => {
        setF(next);
        onChange?.(next);
      }}
    />
  );
}

const frame = () => screen.getByRole("group", { name: "Your photo in the poster's frame" });
const photoImg = () => frame().querySelector("img");

describe("framing the photo", () => {
  it("shows the photo covering the frame, centred", () => {
    render(<Harness />);
    expect(photoImg()).toHaveAttribute("src", "blob:me");
    expect(photoImg().style.width).toBe("400px");
    expect(photoImg().style.transform).toBe("translate(-50px, 0px)");
    expect(frame()).toHaveAttribute("tabindex", "0");
    expect(frame()).toHaveAccessibleDescription(/arrow keys move it/);
  });

  it("is round when the design's frame is", () => {
    render(<Harness round />);
    expect(frame()).toHaveClass("is-round");
  });

  it("moves with a drag, and stops at the photo's edge", () => {
    const seen = vi.fn();
    render(<Harness onChange={seen} />);
    fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 150, clientY: 150, button: 0, pointerType: "touch" });
    fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 170, clientY: 150, pointerType: "touch" });
    expect(seen).toHaveBeenLastCalledWith({ zoom: 1, cx: 0.45, cy: 0.5 });
    fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 600, clientY: 150, pointerType: "touch" });
    expect(photoImg().style.transform).toBe("translate(0px, 0px)");
    fireEvent.pointerUp(frame(), { pointerId: 1 });
    // After the finger is lifted, a move is nothing.
    seen.mockClear();
    fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 100, clientY: 150 });
    expect(seen).not.toHaveBeenCalled();
  });

  it("zooms with a pinch", () => {
    const seen = vi.fn();
    render(<Harness onChange={seen} />);
    fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 100, clientY: 150, pointerType: "touch" });
    fireEvent.pointerDown(frame(), { pointerId: 2, clientX: 200, clientY: 150, pointerType: "touch" });
    fireEvent.pointerMove(frame(), { pointerId: 2, clientX: 210, clientY: 150, pointerType: "touch" });
    // The first move with two fingers down sets the pinch; the next one zooms by how far they spread.
    fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 40, clientY: 150, pointerType: "touch" });
    expect(seen.mock.calls.at(-1)[0].zoom).toBeCloseTo(170 / 110, 2);
  });

  it("zooms with the slider", () => {
    const seen = vi.fn();
    render(<Harness onChange={seen} />);
    const slider = screen.getByRole("slider", { name: "Zoom" });
    expect(slider).toHaveAttribute("aria-valuetext", "100%");
    fireEvent.change(slider, { target: { value: "2" } });
    expect(seen).toHaveBeenLastCalledWith({ zoom: 2, cx: 0.5, cy: 0.5 });
    expect(slider).toHaveAttribute("aria-valuetext", "200%");
  });

  it("answers the keyboard, and Centre starts again", () => {
    const seen = vi.fn();
    render(<Harness onChange={seen} />);
    fireEvent.keyDown(frame(), { key: "+" });
    expect(seen.mock.calls.at(-1)[0].zoom).toBeCloseTo(1.1);
    fireEvent.keyDown(frame(), { key: "ArrowRight" });
    expect(seen.mock.calls.at(-1)[0].cx).toBeLessThan(0.5);
    seen.mockClear();
    fireEvent.keyDown(frame(), { key: "q" });
    expect(seen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Centre" }));
    expect(seen).toHaveBeenLastCalledWith({ zoom: 1, cx: 0.5, cy: 0.5 });
  });

  it("zooms with a trackpad's pinch (a wheel with Ctrl), and leaves a plain wheel to the page", () => {
    const seen = vi.fn();
    render(<Harness onChange={seen} />);
    const plain = new WheelEvent("wheel", { deltaY: -100, clientX: 150, clientY: 150, bubbles: true, cancelable: true });
    act(() => {
      frame().dispatchEvent(plain);
    });
    expect(seen).not.toHaveBeenCalled();
    expect(plain.defaultPrevented).toBe(false);
    const pinch = new WheelEvent("wheel", { deltaY: -50, ctrlKey: true, clientX: 150, clientY: 150, bubbles: true, cancelable: true });
    act(() => {
      frame().dispatchEvent(pinch);
    });
    expect(pinch.defaultPrevented).toBe(true);
    expect(seen.mock.calls.at(-1)[0].zoom).toBeCloseTo(Math.exp(0.5), 2);
  });

  it("pulls a framing that no longer covers the frame back in", () => {
    const seen = vi.fn();
    render(<Harness onChange={seen} start={{ zoom: 1, cx: 0.05, cy: 0.5 }} />);
    expect(seen).toHaveBeenLastCalledWith({ zoom: 1, cx: 0.375, cy: 0.5 });
  });

  it("does nothing while disabled", () => {
    const seen = vi.fn();
    function Off() {
      return <PhotoFramer src="blob:me" natural={photo} framing={CENTRED} onChange={seen} disabled />;
    }
    render(<Off />);
    fireEvent.keyDown(frame(), { key: "+" });
    fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 150, clientY: 150, pointerType: "touch" });
    fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 170, clientY: 150, pointerType: "touch" });
    expect(seen).not.toHaveBeenCalled();
    expect(screen.getByRole("slider", { name: "Zoom" })).toBeDisabled();
  });
});
