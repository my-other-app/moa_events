import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const event = {
  id: 60,
  name: "DOTSLASH 25",
  about: "A night of code.",
  event_datetime: "2026-10-20T18:00:00+05:30",
  duration: 3,
  reg_fee: 0,
  location_name: "Main Hall",
  category: { id: 2, name: "Competition" },
  club: { id: 25, name: "DOTSLASH", logo: null },
  poster: null,
};

vi.mock("@/api/client", () => ({
  default: {
    get: vi.fn((url) => (url === "/api/v1/events/info/60" ? Promise.resolve({ data: event }) : Promise.reject(new Error("not here")))),
    post: vi.fn(),
  },
}));

const Home = (await import("./home.jsx")).default;

describe("the event page", () => {
  it("shows an event that has no poster and a club without a logo", async () => {
    render(
      <MemoryRouter initialEntries={["/60"]}>
        <Routes>
          <Route path="/:eventId" element={<Home />} />
        </Routes>
      </MemoryRouter>
    );
    // The page holds a spinner for a second before it shows the event.
    expect(await screen.findByRole("heading", { name: "DOTSLASH 25" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("DOTSLASH")).toBeInTheDocument();
    expect(document.querySelector(".banner-image")).toBeNull();
  });
});
