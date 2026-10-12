import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import apiClient from "./client";

/**
 * A token left over from a registration must never take a public page down:
 * once the API refuses it, the site forgets it and asks again as a visitor.
 */
describe("the stale token a registration leaves behind", () => {
    let adapter;
    let seen;
    beforeEach(() => {
        localStorage.setItem("access_token", "old-and-expired");
        localStorage.setItem("refresh_token", "old-too");
        seen = [];
        adapter = vi.fn(async (config) => {
            // The header is read now: the retry reuses this config object.
            seen.push(config.headers.Authorization);
            if (config.headers.Authorization) {
                const error = new Error("Request failed with status code 401");
                error.config = config;
                error.response = { status: 401, data: { message: "Token has expired" }, config };
                throw error;
            }
            return { data: { id: 68, name: "Open Evening" }, status: 200, statusText: "OK", headers: {}, config };
        });
        apiClient.defaults.adapter = adapter;
    });
    afterEach(() => {
        localStorage.clear();
        delete apiClient.defaults.adapter;
    });

    it("retries once without the token and forgets it", async () => {
        const res = await apiClient.get("/api/v1/events/info/68");
        expect(res.data.name).toBe("Open Evening");
        expect(adapter).toHaveBeenCalledTimes(2);
        expect(seen).toEqual(["Bearer old-and-expired", undefined]);
        expect(localStorage.getItem("access_token")).toBeNull();
        expect(localStorage.getItem("refresh_token")).toBeNull();
    });

    it("leaves a 401 alone when no token was sent", async () => {
        localStorage.clear();
        adapter.mockImplementation(async (config) => {
            const error = new Error("401");
            error.config = config;
            error.response = { status: 401, config };
            throw error;
        });
        await expect(apiClient.get("/api/v1/events/tickets/x")).rejects.toThrow();
        expect(adapter).toHaveBeenCalledTimes(1);
    });
});
