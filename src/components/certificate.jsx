"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/lib/router";
import Icon from "@/components/discover/icons";
import { eventsApi } from "@/api/events";
import { getSession, guestToken } from "@/auth/session";
import { API_BASE_URL, SITE_URL } from "@/config";
import { certificateNumberOf, verifyPath } from "@/utils/certcode";

/** Someone on this browser may hold the ticket: signed in, or the guest a registration left. */
const mayHoldIt = () => Boolean(getSession() || guestToken());

/**
 * A guest's certificate, from the link in its email or My tickets
 * (/certificates/{ticket id}).
 *
 * It shows the club's own design as the server draws it: the picture is
 * page one of the very PDF the email attaches (GET
 * /events/certificates/{ticket}/image), and Download is that PDF. Both are
 * public by ticket id already, so the page shows a visitor nothing the
 * address doesn't open on its own.
 *
 * The number, and the public check's link, come only from the ticket's
 * details, which only the guest (signed in, or the guest token their
 * registration left), their club or an admin can read. Anyone else gets
 * the picture, the PDF and the check by the number printed on it. The
 * address holds the ticket's code, which is the door's QR: the guest is
 * told to share the check's link instead.
 */
export default function Certificate({ ticketid, apiBase = API_BASE_URL, loadDetails = eventsApi.fetchTicketDetails, canAsk = mayHoldIt }) {
  const img = useRef(null);
  const [state, setState] = useState("loading"); // loading | shown | missing
  const [number, setNumber] = useState(null);
  const [copied, setCopied] = useState(false);
  const base = `${apiBase}/api/v1/events/certificates/${encodeURIComponent(ticketid)}`;

  // A picture that failed before the page woke up fired its error unheard.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.currentSrc) setState(el.naturalWidth > 0 ? "shown" : "missing");
  }, [ticketid]);

  useEffect(() => {
    if (!ticketid || !canAsk()) return undefined;
    let alive = true;
    loadDetails(ticketid).then((data) => {
      if (alive && data) setNumber(certificateNumberOf(data.ticket_id || ticketid, data.certificate_no) || null);
    });
    return () => {
      alive = false;
    };
  }, [ticketid, loadDetails, canAsk]);

  // Nothing to share for a certificate the server won't draw (not issued, or revoked).
  const shared = state === "missing" ? null : number;
  const checkUrl = shared ? `${SITE_URL}${verifyPath(shared)}` : null;
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
        <p className="dc-eyebrow">
          <Icon name="award" size={14} /> Certificate
        </p>
        <h1 id="cert-own-title">{number ? "Your certificate" : "Certificate"}</h1>

        <figure className="vf-preview" hidden={state === "missing"}>
          {/* The club's design, drawn by the API: never through Next's optimiser. */}
          <img
            ref={img}
            src={`${base}/image`}
            alt="The certificate, as the club designed it"
            referrerPolicy="no-referrer"
            decoding="async"
            onLoad={() => setState("shown")}
            onError={() => setState("missing")}
          />
        </figure>

        {state === "missing" ? (
          <div className="vf-result vf-tone--muted cert-own-missing" role="status">
            <div className="vf-verdict">
              <span className="vf-verdict-badge" aria-hidden="true">
                <Icon name="fileText" size={28} />
              </span>
              <div>
                <h2>This certificate can&rsquo;t be shown</h2>
                <p>It hasn&rsquo;t been issued yet, or the club has revoked it. Certificates are issued by the club after the event.</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="cert-own-actions">
          {state !== "missing" ? (
            <a className="dc-btn" href={`${base}/pdf`} rel="nofollow noreferrer">
              Download PDF
            </a>
          ) : null}
          <Link className="dc-btn dc-btn--ghost" to={shared ? verifyPath(shared) : "/verify"}>
            <Icon name="shield" size={16} /> {shared ? "Check it's genuine" : "Check a certificate"}
          </Link>
        </div>

        {shared ? (
          <div className="cert-own-share">
            <p className="cert-own-label">Certificate number</p>
            <p className="vf-mono cert-own-number">{shared}</p>
            <p>
              To show someone it&rsquo;s genuine, share the check, not this page: its address carries your ticket&rsquo;s code, which is what the door
              scans.
            </p>
            <div className="cert-own-link">
              <span className="vf-mono">{checkUrl.replace(/^https?:\/\//, "")}</span>
              <button type="button" className="dc-btn dc-btn--sm dc-btn--ghost" onClick={copy}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        ) : (
          <p className="cert-own-note">
            Anyone can check a certificate is genuine at <strong>myotherapp.in/verify</strong>, with the number printed on it or by scanning its QR
            code.
          </p>
        )}
      </section>
    </div>
  );
}
