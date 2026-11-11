import { describe, expect, it } from "vitest";
import {
  caseNumber,
  describeSupportError,
  fileProblem,
  helpHref,
  looksLikeCard,
  mailtoHref,
  parseHelpAnswers,
  parseRequestDetail,
  parseRequestList,
  parseTopics,
  readHelpPrefill,
  requestContext,
  safePagePath,
  statusLabel,
} from "./help";

/* The support desk's shapes (feature-register/support-leads-contract.md), read and said. */

describe("reading the desk's answers", () => {
  it("keeps answers with words, in order; null for something that isn't a list", () => {
    expect(
      parseHelpAnswers([
        { id: 1, topic: "tickets", question: "Where's my ticket?", answer: "In your email.\r\nAnd the app." },
        { id: 2, topic: "x", question: "", answer: "No question" },
        { id: 3, topic: null, question: "Refunds?", answer: "Ask the club." },
      ]),
    ).toEqual([
      { id: 1, topic: "tickets", question: "Where's my ticket?", answer: "In your email.\nAnd the app." },
      { id: 3, topic: null, question: "Refunds?", answer: "Ask the club." },
    ]);
    expect(parseHelpAnswers({ items: [] })).toEqual([]);
    expect(parseHelpAnswers({ detail: "Not found" })).toBeNull();
  });

  it("reads the topics, each once", () => {
    expect(parseTopics([{ key: "account", label: "Account" }, { key: "account", label: "Again" }, { key: "Bad Key!", label: "x" }, { key: "bug" }])).toEqual([
      { key: "account", label: "Account" },
      { key: "bug", label: "bug" },
    ]);
    expect(parseTopics(null)).toBeNull();
  });

  it("reads a person's requests and one request's thread, never a note", () => {
    expect(parseRequestList([{ id: 7, number: 1042, subject: "Ticket missing", topic: "tickets", status: "waiting", updated_at: "2026-11-11T10:00:00Z", unread: true }, { number: 1 }])).toEqual([
      { id: 7, number: 1042, subject: "Ticket missing", topic: "tickets", status: "waiting", updatedAt: "2026-11-11T10:00:00Z", unread: true },
    ]);
    const r = parseRequestDetail({
      id: 7,
      number: 1042,
      subject: null,
      status: "nonsense",
      messages: [
        { id: 1, kind: "reply_in", body_text: "Hello", attachments: [{ name: "a.png", url: "https://files.example/a.png" }, { name: "x", url: "javascript:alert(1)" }] },
        { id: 2, kind: "note", body_text: "internal" },
        { id: 3, kind: "reply_out", body_text: "Hi Asha", author_name: "Meera" },
      ],
      can_reply: true,
      survey: null,
    });
    expect(r.status).toBe("new");
    expect(r.messages.map((m) => m.kind)).toEqual(["reply_in", "reply_out"]);
    expect(r.messages[0].attachments).toEqual([{ name: "a.png", url: "https://files.example/a.png" }]);
    expect(r.canReply).toBe(true);
    expect(parseRequestDetail({})).toBeNull();
  });

  it("names statuses and numbers as people read them", () => {
    expect(statusLabel("waiting")).toBe("Waiting for you");
    expect(statusLabel("resolved")).toBe("Solved");
    expect(caseNumber(1042)).toBe("#1042");
    expect(caseNumber(null)).toBe("");
  });
});

describe("Get help: what goes with a request", () => {
  it("masks the codes in addresses that are a credential, and drops the query", () => {
    expect(safePagePath("https://myotherapp.in/claim/Xy3abcdefghijklmnop?x=1#a")).toBe("/claim/[code]");
    expect(safePagePath("/tickets/MOA-1A2B3")).toBe("/tickets/[code]");
    expect(safePagePath("/tickets/cancel?t=secret")).toBe("/tickets/cancel");
    expect(safePagePath("/answers/12/0b6e1f9a-4c1d-4d7e-9a51-1f2b3c4d5e6f?k=abc")).toBe("/answers/[code]");
    expect(safePagePath("/help/survey/tok123")).toBe("/help/survey/[code]");
    expect(safePagePath("/events/hack-night-04/register?step=pay")).toBe("/events/hack-night-04/register");
    expect(safePagePath("")).toBeNull();
  });

  it("builds /help's address with only well-formed values, and reads it back", () => {
    const href = helpHref({ topic: "payments", errorCode: "PAYMENT_ORDER_MISMATCH", trackId: "trk_9f2", eventId: 68, from: "https://myotherapp.in/claim/abc?x=1" });
    expect(href).toBe("/help?topic=payments&error_code=PAYMENT_ORDER_MISMATCH&track_id=trk_9f2&event_id=68&from=%2Fclaim%2F%5Bcode%5D#ask");
    expect(helpHref({ errorCode: "<script>", trackId: "a b", eventId: "x" })).toBe("/help#ask");
    const q = new URL(href, "https://myotherapp.in").searchParams;
    const prefill = readHelpPrefill((k) => q.get(k));
    expect(prefill).toEqual({ topic: "payments", error_code: "PAYMENT_ORDER_MISMATCH", track_id: "trk_9f2", event_id: 68, page_url: "/claim/[code]" });
    expect(requestContext(prefill)).toEqual({
      platform: "web",
      page_url: "https://myotherapp.in/claim/[code]",
      error_code: "PAYMENT_ORDER_MISMATCH",
      track_id: "trk_9f2",
      event_id: 68,
    });
    expect(requestContext({})).toEqual({ platform: "web" });
  });
});

describe("checking what is typed", () => {
  it("spots a card number (Luhn), not an order or a phone number", () => {
    expect(looksLikeCard("my card 4111 1111 1111 1111 was charged")).toBe(true);
    expect(looksLikeCard("order 1234567890123 failed")).toBe(false);
    expect(looksLikeCard("call 98765 43210")).toBe(false);
  });

  it("takes pictures and PDFs up to 5 MB", () => {
    expect(fileProblem({ name: "a.png", type: "image/png", size: 1000 })).toBeNull();
    expect(fileProblem({ name: "a.pdf", type: "application/pdf", size: 5 * 1024 * 1024 })).toBeNull();
    expect(fileProblem({ name: "a.gif", type: "image/gif", size: 10 })).toMatch(/isn't a picture or a PDF/);
    expect(fileProblem({ name: "big.jpg", type: "image/jpeg", size: 6 * 1024 * 1024 })).toMatch(/over 5 MB/);
  });

  it("writes the stand-in email with the words in it", () => {
    expect(mailtoHref({ subject: "Help (X)", body: "Line one\nLine two" })).toBe("mailto:support@myotherapp.in?subject=Help%20%28X%29&body=Line%20one%0ALine%20two");
  });
});

describe("what a refusal means", () => {
  it("takes 404 and 405 as no desk yet, except for one request or a survey link", () => {
    expect(describeSupportError({ status: 404 }, "send")).toEqual({ kind: "off" });
    expect(describeSupportError({ status: 405 }, "lead")).toEqual({ kind: "off" });
    expect(describeSupportError({ status: 404 }, "read").kind).toBe("gone");
    expect(describeSupportError({ status: 404 }, "survey").kind).toBe("gone");
    expect(describeSupportError({ status: 409 }, "survey").kind).toBe("done");
  });

  it("says the rest in words", () => {
    expect(describeSupportError({ status: 429, retryAfter: 120 }).message).toMatch(/Wait 2 minutes/);
    expect(describeSupportError({ network: true }).kind).toBe("network");
    expect(describeSupportError({ status: 422, errors: { email: "Enter a valid email" } })).toEqual({ kind: "fields", fields: { email: "Enter a valid email" } });
    expect(describeSupportError({ status: 500 }).kind).toBe("server");
    expect(describeSupportError({ status: 400, message: "Message too long" })).toEqual({ kind: "message", message: "Message too long." });
    expect(describeSupportError({ authExpired: true }).kind).toBe("signin");
  });
});
