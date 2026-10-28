"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ticketingApi } from "@/api/ticketing";
import { useAuth } from "@/auth/context";
import { fieldId, isEmail, rupees, whatsappNumber } from "@/utils/register";
import { describeCodeCheck, describeWaitlistError, entryLine, liveEntries, onSale, typeNote, typePrice, waitlistTypes } from "@/utils/ticketing";
import { EpIcon } from "../discover/eventbits";
import Icon from "../discover/icons";
import { CheckField, ErrorText, TextField } from "./fields";
import { Spinner } from "./finishpayment";

/**
 * The parts of ticket types, discount codes and the waiting list that the
 * registration form and the event page share (docs/TICKETING.md):
 *
 *   TicketPicker       the event's types, one to choose, each with its price
 *                      and what can be done with it now
 *   DiscountCodeField  a code, checked with the server as it is typed (and on
 *                      Apply) for the price it makes; the registration is the
 *                      final word on it
 *   WaitlistPanel      the viewer's places in line (and leaving them), and
 *                      joining the line for a sold-out type
 *
 * Nothing here draws anything before the browser has read the event's
 * tickets, so the server's first paint never depends on them.
 */

/* ---------- a hidden type a link names ---------- */

/** `?ticket_type=12` → 12; null when the address names none (or nonsense). */
export function linkedTypeFrom(search) {
  try {
    const v = new URLSearchParams(search || "").get("ticket_type");
    const n = Number(v);
    return v && Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** The type the page's address names, read once the page is up (never in the first paint). */
export function useLinkedType() {
  const [id, setId] = useState(null);
  useEffect(() => {
    setId(linkedTypeFrom(typeof window === "undefined" ? "" : window.location.search));
  }, []);
  return id;
}

/* ---------- the event's tickets, read once for the page ---------- */

const TTL = 30 * 1000;
const cache = new Map();

/** GET /events/{id}/ticket-types, shared by the page's islands for half a minute (per reader). */
export function loadTicketing(eventId, { ticketType = null, who = "", fresh = false } = {}) {
  const key = `${eventId}|${ticketType ?? ""}|${who}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.promise;
  const promise = Promise.resolve().then(() => ticketingApi.types(eventId, { ticketType }));
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  return promise;
}

/** Forgets every event's tickets read so far (for tests, and after joining or leaving a line). */
export function forgetTicketing() {
  cache.clear();
}

/**
 * The event's tickets for whoever is reading (their own places in line come
 * with them when signed in). `ticketing` is null until they arrive, and from
 * a server without ticket types.
 */
export function useEventTicketing(eventId, { enabled = true, ticketType = null } = {}) {
  const auth = useAuth();
  const who = auth.ready ? (auth.status === "signed-in" ? auth.user?.email || "account" : "") : null;
  const key = `${eventId}|${ticketType ?? ""}|${who}`;
  const [state, setState] = useState({ key: null, data: null });
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    if (!enabled || who === null) return undefined;
    let alive = true;
    loadTicketing(eventId, { ticketType, who, fresh: fresh > 0 }).then(
      (data) => alive && setState({ key, data }),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [eventId, enabled, who, ticketType, fresh, key]);
  const reload = useCallback(() => setFresh((n) => n + 1), []);
  return { ticketing: state.key === key ? state.data : null, reload };
}

/* ---------- choosing a ticket ---------- */

/**
 * The event's ticket types, as rows to pick one from. A type that can't be
 * had now is shown, greyed, with why (sold out, not on sale until …); a
 * sold-out one whose waiting list is open offers it (`onWaitlist(typeId)`).
 */
export function TicketPicker({ ticketing, value, onChange, error, onWaitlist = null }) {
  const id = fieldId("ticket_type");
  const errId = `${id}-err`;
  return (
    <fieldset id={id} tabIndex={-1} className={`rg-field rg-fieldset rg-tt${error ? " is-invalid" : ""}`} aria-describedby={errId}>
      <legend className="rg-label">
        Ticket
        <span className="rg-req" aria-hidden="true">
          *
        </span>
      </legend>
      <div className="rg-choices">
        {ticketing.types.map((t) => {
          const can = onSale(t);
          const on = value === t.id;
          const note = typeNote(t);
          return (
            <div key={t.id} className="rg-tt-row">
              <label className={`rg-choice rg-tt-choice${on ? " is-on" : ""}${can ? "" : " is-off"}`}>
                <input
                  type="radio"
                  name="ticket_type"
                  value={t.id}
                  checked={on}
                  disabled={!can}
                  onChange={() => onChange(t.id)}
                />
                <span className="rg-choice-mark" aria-hidden="true" />
                <span className="rg-tt-body">
                  <span className="rg-tt-name">{t.name}</span>
                  {t.description ? <span className="rg-tt-desc">{t.description}</span> : null}
                  {note ? <span className={`rg-tt-note${note.tone ? ` is-${note.tone}` : ""}`}>{note.text}</span> : null}
                </span>
                <span className="rg-tt-price">{typePrice(t)}</span>
              </label>
              {t.waitlist && onWaitlist ? (
                <button type="button" className="rg-textbtn rg-tt-wait" onClick={() => onWaitlist(t.id)}>
                  Join the waiting list for {t.name}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <ErrorText id={errId} error={error} />
    </fieldset>
  );
}

/* ---------- a discount code ---------- */

const AUTO_CHECK_MS = 900;

/**
 * A discount code's state: what was typed, what the server said it does
 * (`applied`: {code, ticketTypeId, price, discount, amount, free}) and why
 * it was refused. Checked 0.9 s after typing stops and on Apply; the check
 * is limited to 10 a minute, so typing pauses its checks for a minute after
 * a 429 (Apply still asks). A change of ticket asks again for the new one.
 */
export function useDiscountCode({ eventId, ticketTypeId = null, email = null, phone = null }) {
  const [text, setTextState] = useState("");
  const [applied, setApplied] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const tried = useRef(null);
  const pausedUntil = useRef(0);
  const timer = useRef(null);

  const check = useCallback(
    async (raw, { auto = false } = {}) => {
      const code = String(raw || "").trim();
      clearTimeout(timer.current);
      if (!code) return null;
      if (auto && Date.now() < pausedUntil.current) return null;
      const id = ++seq.current;
      tried.current = `${code.toUpperCase()}|${ticketTypeId ?? ""}`;
      setBusy(true);
      setError(null);
      try {
        const r = await ticketingApi.checkCode(eventId, { code, ticketTypeId, email, phone });
        if (id !== seq.current) return null;
        const next = {
          code: typeof r?.code === "string" && r.code ? r.code : code.toUpperCase(),
          ticketTypeId: r?.ticket_type_id ?? ticketTypeId,
          price: Number(r?.price) || 0,
          discount: Math.max(0, Number(r?.discount) || 0),
          amount: Math.max(0, Number(r?.amount) || 0),
          free: r?.free === true,
        };
        setApplied(next);
        return next;
      } catch (e) {
        if (id !== seq.current) return null;
        if (e?.status === 429) pausedUntil.current = Date.now() + (e.retryAfter || 60) * 1000;
        setApplied(null);
        setError(describeCodeCheck(e));
        return null;
      } finally {
        if (id === seq.current) setBusy(false);
      }
    },
    [eventId, ticketTypeId, email, phone],
  );

  const setText = useCallback((v) => {
    setTextState(v);
    setError(null);
    setApplied((a) => (a && a.code.toUpperCase() !== String(v).trim().toUpperCase() ? null : a));
  }, []);

  // Typing: checked once it stops, never the same code twice in a row.
  useEffect(() => {
    clearTimeout(timer.current);
    const code = text.trim();
    if (code.length < 3 || tried.current === `${code.toUpperCase()}|${ticketTypeId ?? ""}`) return undefined;
    timer.current = setTimeout(() => check(code, { auto: true }), AUTO_CHECK_MS);
    return () => clearTimeout(timer.current);
  }, [text, check, ticketTypeId]);

  // Another ticket: the code applied is asked about again, for that one.
  const appliedFor = applied?.ticketTypeId ?? null;
  const appliedCode = applied?.code ?? null;
  useEffect(() => {
    if (appliedCode && ticketTypeId !== null && appliedFor !== null && appliedFor !== ticketTypeId) check(appliedCode);
  }, [ticketTypeId, appliedFor, appliedCode, check]);

  const apply = useCallback(() => check(text), [check, text]);
  const remove = useCallback(() => {
    seq.current += 1;
    clearTimeout(timer.current);
    tried.current = null;
    setTextState("");
    setApplied(null);
    setError(null);
    setBusy(false);
  }, []);
  /** The registration refused the code: say why under the field. */
  const refuse = useCallback((message) => {
    setApplied(null);
    setError(message);
  }, []);

  // What goes with the registration: the code applied, else whatever was typed (the server checks it).
  const toSend = applied?.code || text.trim() || null;
  return { text, setText, applied, error, busy, apply, remove, refuse, toSend };
}

/** The code field: typed and applied, or what was applied with a way to take it off. */
export function DiscountCodeField({ code, error = null, onChanged }) {
  const id = fieldId("discount_code");
  const errId = `${id}-err`;
  const shown = error || code.error;
  if (code.applied) {
    const a = code.applied;
    return (
      <div className="rg-code is-applied" role="status">
        <span className="rg-code-mark" aria-hidden="true">
          <EpIcon name="check" size={15} />
        </span>
        <p className="rg-code-text">
          <strong>{a.code}</strong> applied
          {a.discount > 0 ? <span> · {rupees(a.discount)} off</span> : null}
          {a.free ? <span> · your ticket is free</span> : null}
        </p>
        <button
          type="button"
          className="rg-textbtn"
          onClick={() => {
            code.remove();
            onChanged?.();
          }}
        >
          Remove
        </button>
      </div>
    );
  }
  return (
    <div className={`rg-field rg-code${shown ? " is-invalid" : ""}`}>
      <label className="rg-label" htmlFor={id}>
        Discount code
        <span className="rg-opt">Optional</span>
      </label>
      <div className="rg-code-row">
        <input
          id={id}
          name="discount_code"
          className="rg-input"
          value={code.text}
          onChange={(e) => {
            code.setText(e.target.value);
            onChanged?.();
          }}
          onKeyDown={(e) => {
            // Enter applies the code; it never sends the form (and so never pays).
            if (e.key === "Enter") {
              e.preventDefault();
              code.apply();
            }
          }}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={60}
          aria-invalid={shown ? true : undefined}
          aria-describedby={errId}
        />
        <button type="button" className="dc-btn dc-btn--ghost rg-code-apply" onClick={code.apply} disabled={code.busy || !code.text.trim()}>
          {code.busy ? (
            <>
              <Spinner />
              Checking…
            </>
          ) : (
            "Apply"
          )}
        </button>
      </div>
      <ErrorText id={errId} error={shown} />
    </div>
  );
}

/* ---------- the waiting list ---------- */

const PHONE_CHARS = /[^\d\s()+.-]/;

function joinErrors({ types, typeId, name, email, phone, whatsapp }) {
  const e = {};
  if (types.length > 1 && !types.some((t) => t.id === typeId)) e.ticket_type = "Choose which ticket to wait for.";
  if (!name.trim()) e.name = "Enter your name.";
  else if (name.length > 100) e.name = "That's too long — keep it under 100 characters.";
  const em = email.trim();
  const ph = phone.trim();
  if (!em && !ph) e.email = "Enter your email, so we can tell you when a place opens up.";
  else if (em && !isEmail(em)) e.email = "That doesn't look like an email address. Check it for typos.";
  const n = ph.replace(/\D/g, "").length;
  if (ph && (PHONE_CHARS.test(ph) || n < 10 || n > 15)) e.phone = "Enter a 10-digit mobile number, or include your country code.";
  else if (whatsapp && ph && !whatsappNumber(ph)) e.phone = "WhatsApp needs a mobile number: 10 digits, or with your country code. Or untick the WhatsApp box.";
  return e;
}

/**
 * Joining the line: which ticket (when more than one can be waited for), a
 * name, an email or a phone number (signed in, the account's), and WhatsApp
 * if they want it there too. Not a <form>: it may sit inside the
 * registration's, so Enter is caught here and sends this alone.
 */
export function WaitlistJoin({ eventId, types, typeId: firstType = null, account = null, offerHours = 24, onJoined, onCancel = null }) {
  const [typeId, setTypeId] = useState(firstType ?? (types.length === 1 ? types[0].id : null));
  const [name, setName] = useState(account?.name || "");
  const [email, setEmail] = useState(account?.email || "");
  const [phone, setPhone] = useState(account?.phone || "");
  const [whatsapp, setWhatsapp] = useState(false);
  const [errors, setErrors] = useState({});
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const selectId = fieldId("wl_type");

  const clear = (key) => setErrors((e) => (key in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e));

  const submit = async () => {
    if (busy) return;
    const found = joinErrors({ types, typeId, name, email, phone, whatsapp });
    setErrors(found);
    setProblem(null);
    const first = ["ticket_type", "name", "email", "phone"].find((k) => found[k]);
    if (first) {
      document.getElementById(first === "ticket_type" ? selectId : fieldId(`wl_${first}`))?.focus();
      return;
    }
    setBusy(true);
    try {
      const entry = await ticketingApi.joinWaitlist(eventId, {
        ticketTypeId: typeId ?? (types.length === 1 ? types[0].id : null),
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        whatsapp: whatsapp && Boolean(phone.trim()),
      });
      onJoined(entry, { email: email.trim() || null, phone: phone.trim() || null });
    } catch (error) {
      const p = describeWaitlistError(error);
      if (p.field) setErrors({ [p.field]: p.message });
      else setProblem(p);
    } finally {
      setBusy(false);
    }
  };

  const typeName = types.length === 1 ? types[0].name : types.find((t) => t.id === typeId)?.name;
  return (
    <div
      className="wl-join"
      role="group"
      aria-label="Join the waiting list"
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") {
          e.preventDefault();
          submit();
        }
      }}
    >
      <p className="wl-join-title">Join the waiting list{typeName ? ` for ${typeName}` : ""}</p>
      <p className="wl-join-text">
        If a place opens up, the next person in line is sent a link to claim it, held for {offerHours === 1 ? "an hour" : `${offerHours} hours`}.
      </p>
      <div className="rg-fields wl-fields">
        {types.length > 1 ? (
          <div className={`rg-field${errors.ticket_type ? " is-invalid" : ""}`}>
            <label className="rg-label" htmlFor={selectId}>
              Ticket
            </label>
            <div className="rg-select">
              <select
                id={selectId}
                className={`rg-input${typeId ? "" : " is-empty"}`}
                value={typeId ?? ""}
                onChange={(e) => {
                  setTypeId(e.target.value ? Number(e.target.value) : null);
                  clear("ticket_type");
                }}
                aria-invalid={errors.ticket_type ? true : undefined}
                aria-describedby={`${selectId}-err`}
              >
                <option value="">Choose a ticket</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {typePrice(t)}
                  </option>
                ))}
              </select>
              <svg className="rg-select-chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <ErrorText id={`${selectId}-err`} error={errors.ticket_type} />
          </div>
        ) : null}
        <TextField
          name="wl_name"
          label="Name"
          required
          value={name}
          onChange={(v) => {
            setName(v);
            clear("name");
          }}
          error={errors.name}
          inputProps={{ type: "text", autoComplete: "name", autoCapitalize: "words", maxLength: 100 }}
        />
        <TextField
          name="wl_email"
          label="Email"
          required
          hint={account?.email ? null : "The claim link is sent here."}
          value={email}
          onChange={(v) => {
            setEmail(v);
            clear("email");
          }}
          error={errors.email}
          inputProps={{
            type: "email",
            autoComplete: "email",
            inputMode: "email",
            autoCapitalize: "none",
            spellCheck: false,
            placeholder: "you@example.com",
            ...(account?.email ? { readOnly: true, "aria-readonly": true } : {}),
          }}
        />
        <TextField
          name="wl_phone"
          label="Phone number"
          hint="Optional with an email."
          value={phone}
          onChange={(v) => {
            setPhone(v);
            clear("phone");
          }}
          error={errors.phone}
          inputProps={{ type: "tel", autoComplete: "tel", inputMode: "tel", placeholder: "98765 43210" }}
        />
        {phone.trim() ? (
          <CheckField
            name="wl_whatsapp"
            label="Tell me on WhatsApp too"
            value={whatsapp ? "Yes" : ""}
            option="Yes"
            onChange={(v) => {
              setWhatsapp(v === "Yes");
              clear("phone");
            }}
          />
        ) : null}
      </div>
      {problem ? (
        <p className={`wl-problem${problem.kind === "not_needed" ? " is-good" : ""}`} role="alert">
          {problem.message}
        </p>
      ) : null}
      <div className="wl-join-actions">
        {/* The server says the club confirms each place here: there is nothing to join, so no button to try again. */}
        {problem?.kind === "approval" ? null : (
          <button type="button" className="dc-btn dc-btn--sm" onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Spinner />
                Joining…
              </>
            ) : (
              "Join the waiting list"
            )}
          </button>
        )}
        {onCancel ? (
          <button type="button" className="rg-textbtn" onClick={onCancel} disabled={busy}>
            Not now
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Where the viewer is in line, and (signed in) leaving it, after a second tap to confirm. */
export function WaitlistStatus({ entries, note = null, canLeave = false, onLeave = null, leaving = "idle", setLeaving = () => {}, leaveProblem = null }) {
  const live = liveEntries(entries);
  if (!live.length) return null;
  return (
    <div className="wl-status">
      {live.map((e) => {
        const l = entryLine(e);
        return (
          <div key={e.id || e.ticketTypeId} className={`wl-entry is-${l.kind}`} role="status">
            <span className="wl-entry-icon" aria-hidden="true">
              {l.kind === "offered" ? <EpIcon name="ticket" size={18} /> : <Icon name="users" size={18} />}
            </span>
            <div>
              <p className="wl-entry-title">{l.title}</p>
              <p className="wl-entry-text">{l.text}</p>
            </div>
          </div>
        );
      })}
      {note ? <p className="wl-note">{note}</p> : null}
      {canLeave && onLeave ? (
        leaving === "confirm" || leaving === "busy" ? (
          <div className="wl-leave" role="group" aria-label="Leave the waiting list">
            <p>Leave the waiting list? You&rsquo;ll lose your place in line.</p>
            <div className="wl-leave-actions">
              <button type="button" className="dc-btn dc-btn--sm dc-btn--ghost" onClick={onLeave} disabled={leaving === "busy"}>
                {leaving === "busy" ? "Leaving…" : "Leave"}
              </button>
              <button type="button" className="rg-textbtn" onClick={() => setLeaving("idle")} disabled={leaving === "busy"}>
                Keep my place
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="rg-textbtn wl-leave-btn" onClick={() => setLeaving("confirm")}>
            Leave the waiting list
          </button>
        )
      ) : null}
      {leaveProblem ? (
        <p className="wl-problem" role="alert">
          {leaveProblem}
        </p>
      ) : null}
    </div>
  );
}

/** What `open` asks for: a type id, `{typeId}` (a new object each time, so asking twice opens it twice), or true for any. */
const openTypeOf = (open) => (open && typeof open === "object" ? (open.typeId ?? null) : typeof open === "number" ? open : null);

/**
 * The waiting list for an event: the viewer's places in line, and the way
 * to join it for each sold-out type they aren't waiting for. Signed in,
 * joining lands in the account (and can be left from here); signed out, the
 * place is kept by the email or phone given, and the page says so.
 *
 * `open` (a type id, `{typeId}`, or true) opens the join form: the picker's
 * "Join the waiting list for …", or the event page's button. `onChanged()`
 * after joining or leaving, so the page reads the tickets again.
 *
 * An event whose club confirms each place (`approval`, or its tickets say
 * so) offers no waiting list at all: only places someone already holds in
 * line are shown.
 */
export function WaitlistPanel({ eventId, ticketing, open: openWith = null, fallbackTypes = null, onChanged = null, headingLevel = 2, approval = false }) {
  const auth = useAuth();
  const signedIn = auth.ready && auth.status === "signed-in";
  const account = signedIn ? auth.user : null;
  const viewer = ticketing?.viewerWaitlist;
  const [entries, setEntries] = useState(() => viewer || []);
  useEffect(() => {
    setEntries(viewer || []);
  }, [viewer]);
  const [guest, setGuest] = useState(null);
  const askedFor = openTypeOf(openWith);
  const [open, setOpen] = useState(Boolean(openWith));
  const [typeFor, setTypeFor] = useState(askedFor);
  useEffect(() => {
    if (!openWith) return;
    setOpen(true);
    setTypeFor(openTypeOf(openWith));
  }, [openWith]);
  const [joinedNote, setJoinedNote] = useState(null);
  const [leaving, setLeaving] = useState("idle");
  const [leaveProblem, setLeaveProblem] = useState(null);
  const headingId = useId();

  const shown = guest ? [...entries.filter((e) => e.id !== guest.id), guest] : entries;
  const live = liveEntries(shown);
  const waiting = new Set(live.map((e) => e.ticketTypeId));
  const noLine = approval || ticketing?.requiresApproval === true;
  const listed = noLine ? [] : waitlistTypes(ticketing);
  const types = noLine ? [] : (listed.length ? listed : fallbackTypes || []).filter((t) => !waiting.has(t.id));
  if (!live.length && !types.length) return null;

  const joined = async (entry, contact) => {
    setOpen(false);
    if (!entry) return;
    const where = contact.email || contact.phone;
    setJoinedNote(
      entry.created === false
        ? "You were on the waiting list already: your place is kept."
        : `You're on the list.${where ? ` We'll tell you at ${where} if a place opens up.` : ""}`,
    );
    if (signedIn) {
      try {
        setEntries(await ticketingApi.myWaitlist(eventId));
      } catch {
        setEntries((list) => [...list.filter((e) => e.id !== entry.id), entry]);
      }
    } else {
      setGuest(entry);
    }
    forgetTicketing();
    onChanged?.();
  };

  const leave = async () => {
    setLeaving("busy");
    setLeaveProblem(null);
    try {
      await ticketingApi.leaveWaitlist(eventId);
      setEntries([]);
      setGuest(null);
      setJoinedNote(null);
      setLeaving("idle");
      forgetTicketing();
      onChanged?.();
    } catch (error) {
      setLeaving("confirm");
      setLeaveProblem(error?.network ? "We couldn't reach MyOtherApp. Check your connection and try again." : "We couldn't take you off the list just now. Try again in a moment.");
    }
  };

  const Heading = `h${headingLevel}`;
  return (
    <section className="wl" aria-labelledby={headingId}>
      <Heading className="wl-title" id={headingId}>
        Waiting list
      </Heading>
      <WaitlistStatus
        entries={shown}
        note={joinedNote}
        canLeave={signedIn && !guest}
        onLeave={leave}
        leaving={leaving}
        setLeaving={setLeaving}
        leaveProblem={leaveProblem}
      />
      {guest ? <p className="wl-note">Changed your mind? Sign in with the same email to leave the list, or simply ignore the claim link.</p> : null}
      {types.length ? (
        open ? (
          <WaitlistJoin
            key={typeFor ?? "any"}
            eventId={eventId}
            types={types}
            typeId={typeFor}
            account={account}
            offerHours={ticketing?.waitlist.offerHours ?? 24}
            onJoined={joined}
            onCancel={() => setOpen(false)}
          />
        ) : (
          <div className="wl-offer">
            <p className="wl-offer-text">
              {types.length === 1 ? `${types[0].name} is sold out.` : "Some tickets are sold out."} Join the waiting list: if a place opens up, you&rsquo;ll get a link to
              claim it.
            </p>
            <button
              type="button"
              className="dc-btn dc-btn--sm"
              onClick={() => {
                setTypeFor(null);
                setOpen(true);
              }}
            >
              Join the waiting list
            </button>
          </div>
        )
      ) : null}
    </section>
  );
}
