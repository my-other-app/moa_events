"use client";

import { useId, useRef, useState } from "react";
import { leadsApi } from "@/api/support";
import { describeSupportError, looksLikeEmail, mailtoHref } from "@/utils/help";
import { Spinner } from "../register/finishpayment";
import Icon from "./icons";

/**
 * "Talk to us" on the For-clubs page (#talk-to-us): a club, a sponsor, a
 * venue or a vendor tells the sales team who they are, and the team writes
 * back. POST /api/v1/leads/talk-to-us {name, email, phone?, organisation,
 * city?, type, message?, page_url} → {ok: true}
 * (feature-register/support-leads-contract.md).
 *
 * While the API has no such route (404, 405), sending it opens an email to
 * us instead, with everything typed already in it: nothing is lost.
 */
const TYPES = [
  ["club", "A club"],
  ["sponsor", "A sponsor"],
  ["venue", "A venue"],
  ["vendor", "A vendor"],
  ["other", "Something else"],
];

const EMPTY = { name: "", email: "", phone: "", organisation: "", city: "", type: "club", message: "" };

/** The email that stands in for the form while the API has no route for it. */
export function talkMailto(v, label = "") {
  const lines = [
    v.message,
    "",
    `Name: ${v.name}`,
    `Email: ${v.email}`,
    v.phone ? `Phone: ${v.phone}` : null,
    `${label || "Organisation"}: ${v.organisation}`,
    v.city ? `City: ${v.city}` : null,
  ].filter((x) => x !== null);
  return mailtoHref({ subject: `Talk to us: ${v.organisation || v.name}`, body: lines.join("\n").trim() });
}

function Field({ id, label, optional = false, error, children, wide = false }) {
  return (
    <div className={`rg-field${error ? " is-invalid" : ""}${wide ? " fc-talk-wide" : ""}`}>
      <label className="rg-label" htmlFor={id}>
        {label}
        {optional ? <span className="rg-opt">Optional</span> : null}
      </label>
      {children}
      <p className="rg-error" id={`${id}-error`} role={error ? "alert" : undefined}>
        {error ? (
          <>
            <Icon name="alert" size={15} />
            {error}
          </>
        ) : null}
      </p>
    </div>
  );
}

export function TalkToUs() {
  const id = useId();
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState("form");
  const [note, setNote] = useState(null);
  const refs = useRef({});

  const set = (name) => (e) => {
    const value = e.target.value;
    setV((x) => ({ ...x, [name]: value }));
    if (errors[name]) setErrors((x) => ({ ...x, [name]: null }));
  };
  const reg = (name) => (el) => {
    refs.current[name] = el;
  };
  const orgLabel = v.type === "club" ? "Club or college" : "Organisation";

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const found = {};
    if (!v.name.trim()) found.name = "Enter your name.";
    if (!v.email.trim()) found.email = "Enter your email, so we can write back.";
    else if (!looksLikeEmail(v.email)) found.email = "Enter an email address like name@example.com.";
    if (!v.organisation.trim()) found.organisation = v.type === "club" ? "Enter your club's or college's name." : "Enter your organisation's name.";
    if (v.phone.trim() && v.phone.replace(/\D/g, "").length < 8) found.phone = "Enter a phone number we can call, or leave it empty.";
    setErrors(found);
    const first = ["name", "email", "phone", "organisation"].find((k) => found[k]);
    if (first) {
      setTimeout(() => refs.current[first]?.focus(), 0);
      return;
    }
    setBusy(true);
    setNote(null);
    const body = {
      name: v.name.trim(),
      email: v.email.trim(),
      organisation: v.organisation.trim(),
      type: v.type,
      page_url: "https://myotherapp.in/for-clubs",
    };
    for (const k of ["phone", "city", "message"]) if (v[k].trim()) body[k] = v[k].trim();
    try {
      await leadsApi.talkToUs(body);
      setState("sent");
    } catch (error) {
      const p = describeSupportError(error, "lead");
      if (p.kind === "off") setState("mail");
      else if (p.kind === "fields") {
        setErrors(p.fields);
        const k = ["name", "email", "phone", "organisation", "city", "message"].find((x) => p.fields[x]);
        if (k) refs.current[k]?.focus();
        else setNote(Object.values(p.fields)[0]);
      } else setNote(p.message);
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (state === "sent") {
    body = (
      <div className="fc-talk-done" role="status">
        <span className="rg-closed-icon" aria-hidden="true">
          <Icon name="check" size={26} />
        </span>
        <h3>Thanks, {v.name.trim().split(/\s+/)[0] || "we've got it"}</h3>
        <p>Someone from our team will write to {v.email.trim()} soon. Look out for an email from myotherapp.in.</p>
      </div>
    );
  } else if (state === "mail") {
    body = (
      <div className="fc-talk-done" role="status">
        <span className="rg-closed-icon" aria-hidden="true">
          <Icon name="mail" size={26} />
        </span>
        <h3>Email us instead</h3>
        <p>Our form can&rsquo;t take messages just yet. Everything you typed is in the email below: check it, then send it.</p>
        <a className="dc-btn" href={talkMailto(v, orgLabel)}>
          <Icon name="mail" size={16} /> Write the email
        </a>
      </div>
    );
  } else {
    body = (
      <form className="fc-talk-form" noValidate onSubmit={submit} aria-label="Talk to us">
        <fieldset className="rg-field fc-talk-wide">
          <legend className="rg-label">You are</legend>
          <div className="fc-talk-types">
            {TYPES.map(([value, label]) => (
              <label key={value} className={`hp-pick${v.type === value ? " is-on" : ""}`}>
                <input type="radio" className="dc-sr" name={`${id}-type`} value={value} checked={v.type === value} onChange={set("type")} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field id={`${id}-name`} label="Your name" error={errors.name}>
          <input ref={reg("name")} id={`${id}-name`} className="rg-input" autoComplete="name" maxLength={120} value={v.name} onChange={set("name")} aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? `${id}-name-error` : undefined} />
        </Field>
        <Field id={`${id}-org`} label={orgLabel} error={errors.organisation}>
          <input ref={reg("organisation")} id={`${id}-org`} className="rg-input" autoComplete="organization" maxLength={160} value={v.organisation} onChange={set("organisation")} aria-invalid={errors.organisation ? true : undefined} aria-describedby={errors.organisation ? `${id}-org-error` : undefined} />
        </Field>
        <Field id={`${id}-email`} label="Email" error={errors.email}>
          <input ref={reg("email")} id={`${id}-email`} className="rg-input" type="email" inputMode="email" autoComplete="email" autoCapitalize="off" spellCheck={false} maxLength={200} value={v.email} onChange={set("email")} aria-invalid={errors.email ? true : undefined} aria-describedby={errors.email ? `${id}-email-error` : undefined} />
        </Field>
        <Field id={`${id}-phone`} label="Phone" optional error={errors.phone}>
          <input ref={reg("phone")} id={`${id}-phone`} className="rg-input" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={v.phone} onChange={set("phone")} aria-invalid={errors.phone ? true : undefined} aria-describedby={errors.phone ? `${id}-phone-error` : undefined} />
        </Field>
        <Field id={`${id}-city`} label="City" optional error={errors.city}>
          <input ref={reg("city")} id={`${id}-city`} className="rg-input" autoComplete="address-level2" maxLength={80} value={v.city} onChange={set("city")} />
        </Field>
        <Field id={`${id}-message`} label="What would you like to talk about?" optional error={errors.message} wide>
          <textarea ref={reg("message")} id={`${id}-message`} className="rg-input rg-textarea" rows={4} maxLength={2000} value={v.message} onChange={set("message")} />
        </Field>
        {note ? (
          <p className="hp-note is-error fc-talk-wide" role="alert">
            {note}
          </p>
        ) : null}
        <div className="fc-talk-wide hp-actions">
          <button type="submit" className="dc-btn dc-btn--accent" disabled={busy}>
            {busy ? (
              <>
                <Spinner />
                Sending…
              </>
            ) : (
              "Send"
            )}
          </button>
          <p className="rg-hint">We use these details only to reply to you.</p>
        </div>
      </form>
    );
  }

  return (
    <section id="talk-to-us" className="fc-talk" aria-labelledby="fc-talk-title">
      <div className="fc-talk-head">
        <p className="dc-eyebrow">Talk to us</p>
        <h2 id="fc-talk-title">Let&rsquo;s talk about your club</h2>
        <p>Running events for a club, a college or a community? Sponsoring them, or hosting them? Tell us a little, and we&rsquo;ll write back.</p>
      </div>
      {body}
    </section>
  );
}
