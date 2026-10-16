import React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MerchPicker from "./merchpicker";
import { picksToPayload, picksTotal } from "../../utils/picks";

const ITEMS = [
  { id: "tee", name: "Hack Night tee", description: null, photo_url: null, price: 450, left: null, variants: [{ id: "s", label: "S", left: 2 }, { id: "m", label: "M", left: 30 }, { id: "xl", label: "XL", left: 0 }] },
  { id: "kit", name: "Starter kit", description: "ESP32-S3", photo_url: null, price: 890, left: 1, variants: [] },
];

/** The picker with its picks held the way the form holds them. */
function Harness({ onPicks }) {
  const [picks, setPicks] = React.useState({});
  return (
    <MerchPicker
      items={ITEMS}
      picks={picks}
      onChange={(p) => {
        setPicks(p);
        onPicks(p);
      }}
    />
  );
}

describe("merch picker", () => {
  it("lists the shelf, needs a size before counting, caps at what is left, and totals", async () => {
    let picks = {};
    render(<Harness onPicks={(p) => (picks = p)} />);
    expect(screen.getByText("Hack Night tee")).toBeInTheDocument();
    expect(screen.getByText("₹450")).toBeInTheDocument();
    // No size yet: + stays off, and says why.
    expect(screen.getByRole("button", { name: "One more Hack Night tee" })).toBeDisabled();
    expect(screen.getByText("Pick a size first")).toBeInTheDocument();
    // A size that is gone can't be picked.
    expect(screen.getByRole("radio", { name: /XL/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /^M/ }));
    await waitFor(() => expect(picks.tee).toMatchObject({ variant_id: "m", qty: 1 }));
    // The kit has one left: one is the most.
    fireEvent.click(screen.getByRole("button", { name: "One more Starter kit" }));
    await waitFor(() => expect(picks.kit).toMatchObject({ qty: 1 }));
    expect(screen.getByRole("button", { name: "One more Starter kit" })).toBeDisabled();
    expect(picksToPayload(ITEMS, picks)).toEqual([{ item_id: "tee", variant_id: "m", qty: 1 }, { item_id: "kit", variant_id: null, qty: 1 }]);
    expect(picksTotal(ITEMS, picks)).toBe(1340);
    expect(screen.getByText("₹1,340")).toBeInTheDocument();
  });

  it("shows nothing for an empty shelf", () => {
    const { container } = render(<MerchPicker items={[]} picks={{}} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("drops a sized item with no size from the payload", () => {
    const items = [{ id: "tee", name: "Tee", price: 450, left: null, variants: [{ id: "s", label: "S", left: 2 }] }];
    expect(picksToPayload(items, { tee: { qty: 2, variant_id: null } })).toEqual([]);
  });
});
