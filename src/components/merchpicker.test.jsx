import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/api/events", () => ({
  eventsApi: {
    fetchStoreCatalog: vi.fn().mockResolvedValue({
      enabled: true,
      items: [
        { id: "tee", name: "Hack Night tee", description: null, photo_url: null, price: 450, left: null, variants: [{ id: "s", label: "S", left: 2 }, { id: "m", label: "M", left: 30 }] },
        { id: "kit", name: "Starter kit", description: "ESP32-S3", photo_url: null, price: 890, left: 1, variants: [] },
      ],
    }),
  },
}));

import MerchPicker from "./merchpicker";
import { picksToPayload, picksTotal } from "../utils/picks";

describe("merch picker", () => {
  it("lists the shelf, needs a size before counting, caps at what is left, and totals", async () => {
    let picks = {};
    let items = [];
    const { rerender } = render(<MerchPicker eventId={37} picks={picks} onChange={(p) => { picks = p; rerender(<MerchPicker eventId={37} picks={picks} onChange={(q) => { picks = q; rerender(<MerchPicker eventId={37} picks={picks} onChange={() => {}} onItems={(l) => { items = l; }} />); }} onItems={(l) => { items = l; }} />); }} onItems={(l) => { items = l; }} />);
    expect(await screen.findByText("Hack Night tee")).toBeInTheDocument();
    expect(screen.getByText("₹450 each")).toBeInTheDocument();
    // No size yet: + stays off.
    expect(screen.getByRole("button", { name: "One more Hack Night tee" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Hack Night tee size"), { target: { value: "m" } });
    await waitFor(() => expect(picks.tee).toMatchObject({ variant_id: "m", qty: 1 }));
    // The kit has one left: one is the most.
    fireEvent.click(screen.getByRole("button", { name: "One more Starter kit" }));
    await waitFor(() => expect(picks.kit).toMatchObject({ qty: 1 }));
    expect(picksToPayload(items, picks)).toEqual([{ item_id: "tee", variant_id: "m", qty: 1 }, { item_id: "kit", variant_id: null, qty: 1 }]);
    expect(picksTotal(items, picks)).toBe(1340);
  });

  it("drops a sized item with no size from the payload", () => {
    const items = [{ id: "tee", name: "Tee", price: 450, left: null, variants: [{ id: "s", label: "S", left: 2 }] }];
    expect(picksToPayload(items, { tee: { qty: 2, variant_id: null } })).toEqual([]);
  });
});
