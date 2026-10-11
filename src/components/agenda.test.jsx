import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Agenda } from "./home.jsx";

const agenda = {
    timezone: "Asia/Kolkata",
    has_programme: false,
    items: [
        { id: "a", starts_at: "2026-11-20T03:30:00Z", ends_at: "2026-11-20T04:00:00Z", title: "Registration", description: null, speaker: null, location: "Foyer", parallel: false },
        { id: "b", starts_at: "2026-11-20T04:00:00Z", ends_at: "2026-11-20T05:00:00Z", title: "Opening keynote", description: "The year ahead.", speaker: "Ananya Iyer", location: "Main hall", parallel: true },
        { id: "c", starts_at: "2026-11-21T04:00:00Z", ends_at: null, title: "Day two", description: null, speaker: null, location: null, parallel: false },
    ],
};

describe("the agenda on the event page", () => {
    it("prints times in the event's zone, marks parallel tracks and heads each day", () => {
        render(<Agenda agenda={agenda} />);
        expect(screen.getByRole("heading", { name: "Agenda" })).toBeInTheDocument();
        expect(screen.getByText("09:00")).toBeInTheDocument();
        expect(screen.getByText("– 09:30")).toBeInTheDocument();
        expect(screen.getByText("Ananya Iyer · Main hall")).toBeInTheDocument();
        expect(screen.getByText("Parallel")).toBeInTheDocument();
        expect(screen.getByText("Friday 20 November")).toBeInTheDocument();
        expect(screen.getByText("Saturday 21 November")).toBeInTheDocument();
    });
});
