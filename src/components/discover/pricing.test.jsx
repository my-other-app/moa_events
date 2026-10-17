import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { plansResponse } from "@/test/plansFixture";
import { parsePlans } from "@/utils/pricing";
import { Pricing } from "./pricing";

const SIGNUP = "https://clubs-next.myotherapp.in/signup";
const ready = (over = {}) => ({ status: "ready", data: parsePlans(plansResponse()), retry: vi.fn(), ...over });

const show = (plans = ready(), props = {}) =>
  render(
    <MemoryRouter>
      <Pricing plans={plans} {...props} />
    </MemoryRouter>
  );

/** A plan's card, found by its name. */
const card = (name) => screen.getByRole("heading", { level: 3, name }).closest("li");
const cycleButton = (name) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

describe("the plan cards", () => {
  it("shows the six plans in order, the featured one marked Most popular", () => {
    show();
    const names = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(["Free", "Starter", "Growth", "Pro", "Campus", "Enterprise"]);
    expect(screen.getAllByText("Most popular")).toHaveLength(1);
    expect(within(card("Growth")).getByText("Most popular")).toBeInTheDocument();
    expect(card("Growth")).toHaveClass("is-featured");
    expect(card("Starter")).not.toHaveClass("is-featured");
  });

  it("monthly: the monthly price, billed monthly, with the trial and what follows it", () => {
    show();
    expect(cycleButton("Monthly")).toHaveAttribute("aria-pressed", "true");
    const growth = within(card("Growth"));
    expect(growth.getByText("₹699")).toBeInTheDocument();
    expect(growth.getByText("/month")).toBeInTheDocument();
    expect(growth.getByText("Billed monthly")).toBeInTheDocument();
    expect(growth.getByRole("link", { name: "Start 14-day trial" })).toHaveAttribute("href", `${SIGNUP}?plan=growth&cycle=monthly`);
    expect(growth.getByText("Then ₹699 a month")).toBeInTheDocument();
    expect(within(card("Starter")).getByRole("link", { name: "Choose Starter" })).toHaveAttribute("href", `${SIGNUP}?plan=starter&cycle=monthly`);
    expect(within(card("Pro")).getByText("₹1,499")).toBeInTheDocument();
  });

  it("yearly: the per-month equivalent, what's billed for the year, the saving, and links on the yearly cycle", () => {
    show();
    const yearly = cycleButton("Yearly");
    expect(yearly).toHaveTextContent("2 months free");
    fireEvent.click(yearly);
    expect(yearly).toHaveAttribute("aria-pressed", "true");
    expect(cycleButton("Monthly")).toHaveAttribute("aria-pressed", "false");

    const growth = within(card("Growth"));
    expect(growth.getByText("₹583")).toBeInTheDocument();
    expect(growth.getByText("₹699").closest("s")).not.toBeNull();
    expect(growth.getByText(/₹6,990 billed yearly/)).toBeInTheDocument();
    expect(growth.getByText("Save ₹1,398")).toBeInTheDocument();
    expect(growth.getByRole("link", { name: "Start 14-day trial" })).toHaveAttribute("href", `${SIGNUP}?plan=growth&cycle=yearly`);
    expect(growth.getByText("Then ₹6,990 a year")).toBeInTheDocument();

    expect(within(card("Starter")).getByText("₹249")).toBeInTheDocument();
    expect(within(card("Starter")).getByText(/₹2,990 billed yearly/)).toBeInTheDocument();
    expect(within(card("Pro")).getByText("₹1,249")).toBeInTheDocument();
    expect(within(card("Campus")).getByText("₹3,333")).toBeInTheDocument();
    expect(within(card("Campus")).getByText(/₹39,990 billed yearly/)).toBeInTheDocument();
    expect(within(card("Campus")).getByRole("link", { name: "Choose Campus" })).toHaveAttribute("href", `${SIGNUP}?plan=campus&cycle=yearly`);

    // Free stays free, on no cycle in particular.
    expect(within(card("Free")).getByText("₹0")).toBeInTheDocument();
    expect(within(card("Free")).getByRole("link", { name: "Start free" })).toHaveAttribute("href", `${SIGNUP}?plan=free&cycle=monthly`);

    fireEvent.click(cycleButton("Monthly"));
    expect(within(card("Growth")).getByRole("link", { name: "Start 14-day trial" })).toHaveAttribute("href", `${SIGNUP}?plan=growth&cycle=monthly`);
  });

  it("Enterprise is Custom, and its button writes to us", () => {
    show();
    const ent = within(card("Enterprise"));
    expect(ent.getByText("Custom")).toBeInTheDocument();
    expect(ent.queryByText("₹0")).toBeNull();
    expect(ent.getByRole("link", { name: "Talk to us" })).toHaveAttribute("href", "mailto:support@myotherapp.in?subject=MyOtherApp%20for%20our%20institution");
    expect(ent.getByText("Everything in Campus")).toBeInTheDocument();
  });

  it("leads with limits in plain words, Unlimited for no cap, and never storage, ticket types or coupons", () => {
    show();
    const limits = (name) => within(within(card(name)).getByRole("list", { name: `${name} limits` })).getAllByRole("listitem").map((li) => li.textContent);
    expect(limits("Growth")).toEqual(["15 events a month", "1,000 people per event", "8,000 registrations a month", "10 team seats", "60 announcements a month"]);
    expect(limits("Pro")).toEqual(["Unlimited events", "5,000 people per event", "30,000 registrations a month", "25 team seats", "Unlimited announcements"]);
    expect(limits("Enterprise")).toEqual(["Unlimited events", "Unlimited people per event", "Unlimited registrations", "Unlimited team seats", "Unlimited announcements"]);
    const cards = screen.getAllByRole("listitem").filter((li) => li.classList.contains("pr-plan"));
    for (const c of cards) expect(c.textContent).not.toMatch(/storage|GB|ticket type|coupon/i);
  });

  it("lists what each plan adds, with the rest a link away", () => {
    show();
    const growth = within(card("Growth"));
    expect(growth.getByText("Everything in Starter, plus:")).toBeInTheDocument();
    expect(growth.getByText("Live room: quiz")).toBeInTheDocument();
    expect(growth.getByText("Post-event reports")).toBeInTheDocument();
    const pro = within(card("Pro"));
    expect(pro.getByRole("link", { name: /and 2 more/ })).toHaveAttribute("href", "#compare");
    expect(within(card("Free")).getByText("Includes:")).toBeInTheDocument();
  });
});

describe("the comparison", () => {
  const cellsOf = (table, rowName) =>
    within(within(table).getByRole("rowheader", { name: rowName }).closest("tr"))
      .getAllByRole("cell")
      .map((td) => td.textContent);

  it("has every plan as a column, the limits and the features in groups, ticks and dashes", () => {
    show();
    const table = screen.getByRole("table");
    expect(within(table.querySelector("thead")).getAllByRole("columnheader").map((th) => th.querySelector(".pr-th-name").textContent)).toEqual([
      "Free",
      "Starter",
      "Growth",
      "Pro",
      "Campus",
      "Enterprise",
    ]);
    expect(within(table).getByRole("columnheader", { name: /Growth/ })).toHaveTextContent("₹699/mo");
    expect(within(table).getByRole("columnheader", { name: /Enterprise/ })).toHaveTextContent("Custom");

    const groups = [...table.querySelectorAll(".pr-table-group th")].map((th) => th.textContent);
    expect(groups).toEqual(["Limits", "Every event", "Ticketing", "Live room", "Grow your club", "Run big events", "Money"]);

    expect(cellsOf(table, "Events a month")).toEqual(["2", "5", "15", "Unlimited", "Unlimited", "Unlimited"]);
    expect(cellsOf(table, "Registrations a month")).toEqual(["300", "1,500", "8,000", "30,000", "1,50,000", "Unlimited"]);
    expect(cellsOf(table, "Storage")).toEqual(["1 GB", "5 GB", "20 GB", "100 GB", "500 GB", "Unlimited"]);
    // A count for a feature the plan lacks is a dash, not a promise.
    expect(cellsOf(table, "Merch items per event")).toEqual(["—Not included", "—Not included", "—Not included", "100", "Unlimited", "Unlimited"]);
    expect(within(table).queryByRole("rowheader", { name: /Ticket types/ })).toBeNull();
    expect(within(table).queryByRole("rowheader", { name: /Coupon/ })).toBeNull();

    expect(cellsOf(table, "Finance and expenses")).toEqual(["—Not included", "—Not included", "—Not included", "—Not included", "Included", "Included"]);
    expect(cellsOf(table, "Check-in at the door")).toEqual(Array(6).fill("Included"));
    expect(within(table).getAllByRole("rowheader")).toHaveLength(8 + 21);

    // The last row is a button per plan.
    expect(within(table).getByRole("link", { name: "Start 14-day trial, Growth" })).toHaveAttribute("href", `${SIGNUP}?plan=growth&cycle=monthly`);
  });

  it("follows the cycle", () => {
    show();
    fireEvent.click(cycleButton("Yearly"));
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: /Growth/ })).toHaveTextContent("₹583/mo");
    expect(within(table).getByRole("link", { name: "Choose Starter, Starter" })).toHaveAttribute("href", `${SIGNUP}?plan=starter&cycle=yearly`);
  });

  it("is a link to /pricing instead, where the page asks for it", () => {
    show(ready(), { compare: "link" });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("link", { name: "Compare every plan in detail" })).toHaveAttribute("href", "/pricing#compare");
    expect(within(card("Pro")).getByRole("link", { name: /and 2 more/ })).toHaveAttribute("href", "/pricing#compare");
  });
});

describe("before and without the plans", () => {
  it("says it is loading, with no price on the page", () => {
    const { container } = show({ status: "loading", data: null, retry: vi.fn() });
    expect(screen.getByRole("status")).toHaveTextContent("Pricing is loading…");
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(container.textContent).not.toMatch(/₹/);
  });

  it("when the API fails: calm words, the dashboard's plans, and a retry — never a broken page", () => {
    const retry = vi.fn();
    const { container } = show({ status: "error", data: null, retry });
    expect(screen.getByRole("heading", { name: "Pricing is loading…" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See plans in the dashboard" })).toHaveAttribute("href", SIGNUP);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Most popular")).toBeNull();
    expect(container.textContent).not.toMatch(/₹/);
  });

  it("has no switch when no plan is sold both ways", () => {
    const monthlyOnly = plansResponse();
    monthlyOnly.plans.forEach((p) => (p.price_yearly_paise = 0));
    show({ status: "ready", data: parsePlans(monthlyOnly), retry: vi.fn() });
    expect(screen.queryByRole("group", { name: "Billing period" })).toBeNull();
    expect(within(card("Growth")).getByText("₹699")).toBeInTheDocument();
  });
});
