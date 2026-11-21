import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import Clock, { TimeBar } from "./clock.jsx";
import OrderList from "./order.jsx";

/** The clock's four looks and the order list's moves, on their own. */
describe("the clock", () => {
  it("draws today's seconds, urgent in the last five and 'Time' at 0", () => {
    const { rerender } = render(<Clock left={12} seconds={20} />);
    expect(screen.getByLabelText("12 seconds left")).toHaveTextContent("12s");
    expect(screen.getByLabelText("12 seconds left").className).toBe("play-clock");
    rerender(<Clock left={4} seconds={20} />);
    expect(screen.getByLabelText("4 seconds left").className).toBe("play-clock is-urgent");
    rerender(<Clock left={0} seconds={20} />);
    expect(screen.getByLabelText("0 seconds left")).toHaveTextContent("Time");
  });

  it("runs a ring down with the seconds inside it", () => {
    const { container } = render(<Clock timer="ring" left={15} seconds={20} />);
    expect(screen.getByRole("timer", { name: "15 seconds left" })).toHaveTextContent("15");
    const run = container.querySelector(".play-ring-run");
    const ring = Number(run.getAttribute("stroke-dasharray"));
    // A quarter of the time gone: a quarter of the ring.
    expect(Number(run.getAttribute("stroke-dashoffset"))).toBeCloseTo(ring / 4, 5);
  });

  it("says paused, and draws nothing at all when hidden", () => {
    const { container, rerender } = render(<Clock left={9} seconds={20} paused />);
    expect(screen.getByLabelText("Paused")).toHaveTextContent("Paused");
    expect(screen.getByLabelText("Paused").className).not.toContain("is-urgent");
    rerender(<Clock timer="hidden" left={9} seconds={20} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws the bar only for the bar timer", () => {
    const { container, rerender } = render(<TimeBar left={5} seconds={20} />);
    expect(container.querySelector(".play-timebar > span").style.transform).toBe("scaleX(0.25)");
    rerender(<TimeBar timer="ring" left={5} seconds={20} />);
    expect(container.querySelector(".play-timebar")).toBeNull();
  });
});

describe("the order list", () => {
  const items = [
    { key: "a", label: "Kochi" },
    { key: "b", label: "Delhi" },
    { key: "c", label: "Pune" },
  ];

  it("moves a row down, never past the ends, and says where it went", () => {
    const onChange = vi.fn();
    render(<OrderList items={items} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Move Kochi up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Pune down" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move Kochi down" }));
    expect(onChange).toHaveBeenCalledWith(["b", "a", "c"]);
    expect(screen.getByText("Moved Kochi to 2 of 3")).toBeInTheDocument();
  });

  it("has no moves once locked, and reads each row's verdict", () => {
    render(<OrderList items={items} onChange={() => {}} disabled verdicts={[true, false, true]} label="Your order" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("list", { name: "Your order" })).toHaveTextContent("Kochi — in the right place");
    expect(screen.getByRole("list", { name: "Your order" })).toHaveTextContent("Delhi — not in the right place");
  });
});
