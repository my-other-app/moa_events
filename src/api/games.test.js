import { describe, expect, it } from "vitest";
import { gameFailure } from "./games";
import { pinState } from "@/utils/games";

/* The API's refusals as axios hands them over: {message, error_code, errors} in the body. */
const refused = (status, error_code, errors, message = "no") => ({ response: { status, data: { message, error_code, errors } } });

describe("a games refusal, from the API's body", () => {
  it("wrong PIN: 403 with attempts_left in errors", () => {
    const f = gameFailure(refused(403, "PIN_WRONG", { attempts_left: 2 }));
    expect(f).toMatchObject({ status: 403, code: "PIN_WRONG", errors: { attempts_left: 2 } });
    expect(pinState(f)).toEqual({ kind: "wrong", attemptsLeft: 2 });
  });
  it("locked: 423 with locked_until in errors", () => {
    const f = gameFailure(refused(423, "PIN_LOCKED", { locked_until: "2026-11-28T05:10:00+00:00" }));
    expect(f.status).toBe(423);
    expect(pinState(f)).toEqual({ kind: "locked", until: "2026-11-28T05:10:00+00:00" });
  });
  it("rate limited: retryAfter from errors.retry_after", () => {
    expect(gameFailure(refused(429, "RATE_LIMITED", { retry_after: 9 })).retryAfter).toBe(9);
  });
  it("a dropped connection is a network failure", () => {
    expect(gameFailure({ message: "Network Error" }).network).toBe(true);
  });
});
