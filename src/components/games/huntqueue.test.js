import { describe, expect, it, vi } from "vitest";
import { createQueue } from "./huntqueue";

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};
const net = () => ({ __apiFailure: true, network: true, status: 0 });
const refused = (code) => ({ __apiFailure: true, status: 409, code });
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Timers by hand: `fire()` runs the one waiting retry. */
const manual = () => {
  let fn = null;
  return { set: (f) => (fn = f), clear: () => (fn = null), fire: () => { const f = fn; fn = null; f?.(); }, waiting: () => fn !== null };
};

describe("the hunt's retry queue", () => {
  it("keeps a scan saved while the network is down, and sends it when it is back", async () => {
    const storage = memory();
    const t = manual();
    const send = vi.fn().mockRejectedValueOnce(net()).mockResolvedValueOnce({ points: 30 });
    const results = [];
    const q = createQueue({ eventId: "7", send, storage, setTimer: t.set, clearTimer: t.clear, onResult: (r) => results.push(r) });
    q.add("p.7.1.mac");
    await flush();
    expect(q.pending()).toBe(1);
    expect(JSON.parse(storage.m.get("moa.game.queue.7"))[0].code).toBe("p.7.1.mac");
    expect(t.waiting()).toBe(true);
    t.fire();
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(q.pending()).toBe(0);
    expect(results).toEqual([{ ok: true, code: "p.7.1.mac", result: { points: 30 } }]);
    expect(JSON.parse(storage.m.get("moa.game.queue.7"))).toEqual([]);
  });

  it("retries a server error too, but ends on a refusal and reports it", async () => {
    const t = manual();
    const send = vi.fn().mockRejectedValueOnce({ __apiFailure: true, status: 503 }).mockRejectedValueOnce(refused("ALREADY_CLAIMED"));
    const results = [];
    const q = createQueue({ eventId: "7", send, storage: memory(), setTimer: t.set, clearTimer: t.clear, onResult: (r) => results.push(r) });
    q.add("p.7.2.mac");
    await flush();
    expect(t.waiting()).toBe(true);
    t.fire();
    await flush();
    expect(q.pending()).toBe(0);
    expect(results[0].ok).toBe(false);
    expect(results[0].failure.code).toBe("ALREADY_CLAIMED");
  });

  it("picks up what an earlier page left, one scan at a time, in order", async () => {
    const storage = memory();
    storage.setItem("moa.game.queue.7", JSON.stringify([{ code: "a" }, { code: "b" }]));
    const sent = [];
    const q = createQueue({ eventId: "7", send: async (c) => (sent.push(c), {}), storage, onResult: () => {} });
    expect(q.pending()).toBe(2);
    q.flush();
    await flush();
    await flush();
    expect(sent).toEqual(["a", "b"]);
  });

  it("does not queue the same code twice", async () => {
    const t = manual();
    const q = createQueue({ eventId: "7", send: () => Promise.reject(net()), storage: memory(), setTimer: t.set, clearTimer: t.clear, onResult: () => {} });
    q.add("x");
    q.add("x");
    expect(q.pending()).toBe(1);
  });
});
