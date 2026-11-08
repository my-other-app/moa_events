"use client";

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@/lib/router";
import Icon from "@/components/discover/icons";
import { eventsApi } from "@/api/events";
import { siteHref } from "@/api/account";
import { getSession, guestToken } from "@/auth/session";
import { API_BASE_URL, SITE_URL } from "@/config";
import { NUMBER_PATTERN, isCertificatePublicId, verifyPath } from "@/utils/certcode";
import { formatDate } from "@/utils/format";

/** Someone on this browser may hold the certificate: signed in, or the guest a registration left. */
const mayHoldIt = () => Boolean(getSession() || guestToken());

/** Off to a page the site doesn't serve here (the API's site is another host). */
const leaveFor = (href) => window.location.replace(href);

/** Not issued, or no certificate at this address: the same words whichever it was. */
function Missing() {
  return (
    <>
      <div className="vf-result vf-tone--muted cert-own-missing" role="status">
        <div className="vf-verdict">
          <span className="vf-verdict-badge" aria-hidden="true">
            <Icon name="fileText" size={28} />
          </span>
          <div>
            <h2>This certificate can&rsquo;t be shown</h2>
            <p>
              It hasn&rsquo;t been issued yet, or this link is an old one. Certificates are issued by the club after the event; for a fresh link, open
              yours from My tickets or the club&rsquo;s latest email.
            </p>
          </div>
        </div>
      </div>
      <div className="cert-own-actions">
        <Link className="dc-btn" to="/me/tickets">
          My tickets
        </Link>
        <Link className="dc-btn dc-btn--ghost" to="/verify">
          <Icon name="shield" size={16} /> Check a certificate
        </Link>
      </div>
      <p className="cert-own-note">
        Anyone can check a certificate is genuine at <strong>myotherapp.in/verify</strong>, with the number printed on it or by scanning its QR code.
      </p>
    </>
  );
}

/** The API didn't answer (or said to slow down): nothing is claimed either way, and the visitor can ask again. */
function Unreachable({ limited = false, retry }) {
  return (
    <>
      <div className="vf-result vf-tone--muted cert-own-missing" role="alert">
        <div className="vf-verdict">
          <span className="vf-verdict-badge" aria-hidden="true">
            <Icon name="alert" size={28} />
          </span>
          <div>
            <h2>We couldn&rsquo;t load this certificate</h2>
            <p>
              {limited
                ? "Too many certificates were opened from here just now. Wait a minute, then try again."
                : "The connection didn't go through. Check it, then try again."}
            </p>
          </div>
        </div>
      </div>
      <div className="cert-own-actions">{retry}</div>
    </>
  );
}

function Club({ result }) {
  if (!result.orgName) return "—";
  return result.orgSlug ? (
    <Link className="dc-link" to={`/clubs/${result.orgSlug}`}>
      {result.orgName}
    </Link>
  ) : (
    result.orgName
  );
}

function Heading({ title }) {
  return (
    <>
      <p className="dc-eyebrow">
        <Icon name="award" size={14} /> Certificate
      </p>
      <h1 id="cert-own-title">{title || "Certificate"}</h1>
    </>
  );
}

/**
 * A certificate's page, from the link the API hands out
 * (/certificates/{public id}, its `certificate_url`), for anyone the link
 * reaches: the holder, and whoever they share it with.
 *
 * What it says comes from the public check (GET /verify/certificates/{id},
 * made on the site's server: `result` is checkCertificate's answer): whose
 * it is, for what, from which club, when, and its number. Valid, it shows
 * the club's own design as the server draws it -- page one of the very PDF
 * the email attaches (GET /events/certificates/{id}/image) -- and Download
 * is that PDF. Revoked, it says so and shows neither. The id goes to the
 * API exactly as the link carried it.
 *
 * To show someone it's genuine, the page offers the check's link
 * (/verify/{number}) to share.
 */
export default function Certificate({ id, result, apiBase = API_BASE_URL }) {
  const img = useRef(null);
  const [picture, setPicture] = useState("loading"); // loading | shown | failed
  const [copied, setCopied] = useState(false);
  const state = result?.state;
  const base = `${apiBase}/api/v1/events/certificates/${encodeURIComponent(id)}`;

  // A picture that failed before the page woke up fired its error unheard.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.currentSrc) setPicture(el.naturalWidth > 0 ? "shown" : "failed");
  }, [id]);

  if (state === "revoked") {
    return (
      <div className="dc-wrap vf-wrap">
        <section className="cert-own" aria-labelledby="cert-own-title">
          <Heading title={result.eventName} />
          <div className="vf-result vf-tone--revoked cert-own-missing" role="status">
            <div className="vf-verdict">
              <span className="vf-verdict-badge" aria-hidden="true">
                <Icon name="alert" size={28} />
              </span>
              <div>
                <h2>This certificate was revoked</h2>
                <p>
                  {result.orgName ? `${result.orgName} issued it, then withdrew it.` : "The club issued it, then withdrew it."} It is no longer valid,
                  so it can&rsquo;t be shown or downloaded.
                </p>
              </div>
            </div>
          </div>
          <div className="cert-own-actions">
            <Link className="dc-btn dc-btn--ghost" to="/verify">
              <Icon name="shield" size={16} /> Check a certificate
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (state !== "valid") {
    const missing = state === "not_found" || state === "invalid";
    return (
      <div className="dc-wrap vf-wrap">
        <section className="cert-own" aria-labelledby="cert-own-title">
          <Heading />
          {missing ? (
            <Missing />
          ) : (
            <Unreachable
              limited={state === "limited"}
              retry={
                // A plain link: the page asks again on the server, with or without JavaScript.
                <a className="dc-btn" href={`/certificates/${encodeURIComponent(id)}`}>
                  Try again
                </a>
              }
            />
          )}
        </section>
      </div>
    );
  }

  const number = NUMBER_PATTERN.test(result.number ?? "") ? result.number : null;
  const checkUrl = number ? `${SITE_URL}${verifyPath(number)}` : null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(checkUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="dc-wrap vf-wrap">
      <section className="cert-own" aria-labelledby="cert-own-title">
        <Heading title={result.eventName} />

        <dl className="vf-facts vf-tone--muted">
          <div>
            <dt>Awarded to</dt>
            <dd>{result.attendeeName || "—"}</dd>
          </div>
          <div>
            <dt>Issued by</dt>
            <dd>
              <Club result={result} />
            </dd>
          </div>
          <div>
            <dt>Date issued</dt>
            <dd>{formatDate(result.issuedAt) || "—"}</dd>
          </div>
        </dl>

        <figure className="vf-preview" hidden={picture === "failed"}>
          {/* The club's design, drawn by the API: never through Next's optimiser. */}
          <img
            ref={img}
            src={`${base}/image`}
            alt="The certificate, as the club designed it"
            referrerPolicy="no-referrer"
            decoding="async"
            onLoad={() => setPicture("shown")}
            onError={() => setPicture("failed")}
          />
        </figure>
        {picture === "failed" ? (
          <p className="cert-own-note" role="status">
            The picture didn&rsquo;t load just now. The PDF is the same certificate.
          </p>
        ) : null}

        <div className="cert-own-actions">
          <a className="dc-btn" href={`${base}/pdf`} rel="nofollow noreferrer">
            Download PDF
          </a>
          <Link className="dc-btn dc-btn--ghost" to={number ? verifyPath(number) : "/verify"}>
            <Icon name="shield" size={16} /> {number ? "Check it's genuine" : "Check a certificate"}
          </Link>
        </div>

        {number ? (
          <div className="cert-own-share">
            <p className="cert-own-label">Certificate number</p>
            <p className="vf-mono cert-own-number">{number}</p>
            <p>
              To show someone it&rsquo;s genuine, share the check&rsquo;s link rather than this page: anyone can open it, and it shows what MyOtherApp&rsquo;s
              records say about this certificate.
            </p>
            <div className="cert-own-link">
              <span className="vf-mono">{checkUrl.replace(/^https?:\/\//, "")}</span>
              <button type="button" className="dc-btn dc-btn--sm dc-btn--ghost" onClick={copy}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/**
 * Where the ticket's details send an old address's holder: the certificate's
 * page the API named (`certificate_url`), by its public id; null for
 * anything else, so nothing loops back here or leaves for another page.
 */
export function certificatePageOf(url) {
  const href = siteHref(url);
  if (!href) return null;
  let path = href;
  if (!href.startsWith("/")) {
    try {
      path = new URL(href).pathname;
    } catch {
      return null;
    }
  }
  const found = /^\/certificates\/([^/?#]+)\/?(?:[?#]|$)/.exec(path);
  return found && isCertificatePublicId(found[1]) ? href : null;
}

/**
 * An address from before certificates had ids of their own
 * (/certificates/{ticket id}). It opens nothing by itself. Someone who may
 * hold the ticket (signed in, or the guest token a registration left) is
 * sent on to the certificate's page, when the ticket's details name one
 * (GET /events/tickets/{id}, read as the ticket's page reads it); everyone
 * else, and a ticket without a certificate, gets the page that can't be
 * shown. The certificate's picture and PDF are never asked for by this id.
 */
export function OldCertificateAddress({ ticketId, loadTicket = eventsApi.fetchTicket, canAsk = mayHoldIt, leave = leaveFor }) {
  const navigate = useNavigate();
  const [state, setState] = useState("asking"); // asking | missing | unreachable
  const [attempt, setAttempt] = useState(0);
  // The latest ways out, without asking for the ticket again when they change.
  const out = useRef({ navigate, leave });
  useEffect(() => {
    out.current = { navigate, leave };
  });

  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => (canAsk() ? loadTicket(ticketId) : null))
      .then(
        (answer) => {
          if (!alive) return;
          const page = certificatePageOf(answer?.ticket?.certificate_url);
          if (page) {
            if (page.startsWith("/")) out.current.navigate(page, { replace: true });
            else out.current.leave(page);
            return;
          }
          setState(answer?.problem === "unreachable" ? "unreachable" : "missing");
        },
        () => alive && setState("unreachable")
      );
    return () => {
      alive = false;
    };
  }, [ticketId, attempt, loadTicket, canAsk]);

  return (
    <div className="dc-wrap vf-wrap">
      <section className="cert-own" aria-labelledby="cert-own-title">
        <Heading />
        {state === "missing" ? (
          <Missing />
        ) : state === "unreachable" ? (
          <Unreachable
            retry={
              <button
                type="button"
                className="dc-btn"
                onClick={() => {
                  setState("asking");
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </button>
            }
          />
        ) : (
          <p className="cert-own-note" role="status">
            Opening your certificate&hellip;
          </p>
        )}
      </section>
    </div>
  );
}
