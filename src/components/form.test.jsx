import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Form from "./form.jsx";
import { eventsApi } from "@/api/events";

vi.mock("@/api/events", () => ({
    eventsApi: {
        fetchEvent: vi.fn().mockResolvedValue(null),
        fetchStoreCatalog: vi.fn().mockResolvedValue({ enabled: false, items: [] }),
        registerForEvent: vi.fn(),
    },
}));

vi.mock("@/api/payments", () => ({
    paymentsApi: {
        createPaymentOrder: vi.fn(),
    },
}));

function renderForm() {
    return render(
        <MemoryRouter initialEntries={["/register/123"]}>
            <Routes>
                <Route path="/register/:eventId" element={<Form />} />
            </Routes>
        </MemoryRouter>
    );
}

function fillRequiredFields() {
    fireEvent.change(screen.getByPlaceholderText("Enter Your Name"), {
        target: { value: "Test User" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter email"), {
        target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter Participant Whatsapp Number"), {
        target: { value: "9999999999" },
    });
}

describe("Form double-submit guard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("only calls registerForEvent once when the submit button is clicked twice in quick succession", async () => {
        let resolveRegister;
        eventsApi.registerForEvent.mockReturnValue(
            new Promise((resolve) => {
                resolveRegister = resolve;
            })
        );

        renderForm();
        fillRequiredFields();

        // The floating <Continue> component renders a second "CONTINUE"
        // button, so disambiguate via the form's actual submit button.
        const submitButton = document.querySelector('button[type="submit"]');
        fireEvent.click(submitButton);
        fireEvent.click(submitButton);
        fireEvent.click(submitButton);

        expect(eventsApi.registerForEvent).toHaveBeenCalledTimes(1);
        expect(submitButton).toBeDisabled();

        resolveRegister({ ticket_id: null });
        await waitFor(() => expect(submitButton).not.toBeDisabled());
    });

    it("re-enables the submit button after a failed registration, allowing a retry", async () => {
        eventsApi.registerForEvent.mockRejectedValueOnce(new Error("network down"));

        renderForm();
        fillRequiredFields();

        // The floating <Continue> component renders a second "CONTINUE"
        // button, so disambiguate via the form's actual submit button.
        const submitButton = document.querySelector('button[type="submit"]');
        fireEvent.click(submitButton);

        await waitFor(() => expect(submitButton).not.toBeDisabled());
        expect(eventsApi.registerForEvent).toHaveBeenCalledTimes(1);
    });
});
