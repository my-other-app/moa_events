"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/lib/router";
import Icon from "@/components/discover/icons";
import { eventsApi } from "@/api/events";
import { getSession, guestToken } from "@/auth/session";
import { API_BASE_URL, SITE_URL } from "@/config";
import { certificateNumberOf, verifyPath } from "@/utils/certcode";

/** Someone on this browser may hold the certificate: signed in, or the guest a registration left. */
const mayHoldIt = () => Boolean(getSession() || guestToken());

/**
 * A guest's certificate, from the link the API hands out
 * (/certificates/{id}, its `certificate_url`).
 *
 * It shows the club's own design as the server draws it: the picture is
 * page one of the very PDF the email attaches (GET
 * /events/certificates/{id}/image), and Download is that PDF. Both are
 * public by the link's id already, so the page shows a visitor nothing the
 * address doesn't open on its own. The id goes to the API exactly as the
 * link carried it: the site never reads what kind of id it is.
 *
 * The number, and the public check's link, are the holder's alone: the
 * number the API names in the details it gives for this id to the guest
 * (signed in, or the guest token their registration left), their club or
 * an admin -- never one worked out from the address. Anyone else gets the
 * picture, the PDF and the check by the number printed on it. The holder is
 * told to share the check rather than this page.
 *
 * Those details are the ticket's (GET /events/tickets/{id}), which answer
 * while the link's id is the ticket's. For a link with the certificate's
 * own id they say nothing, and the page shows the check by the printed
 * number until the API names the number for that id.
 */
export default function Certificate({ id, apiBase = API_BASE_URL, loadDetails = eventsApi.fetchTicketDetails, canAsk = mayHoldIt }) {
  const img = useRef(null);
  const [state, setState] = useState("loading"); // loading | shown | missing
  const [number, setNumber] = useState(null);
  const [copied, setCopied] = useState(false);
  const base = `${apiBase}/api/v1/events/certificates/${encodeURIComponent(id)}`;

  // A picture that failed before the page woke up fired its error unheard.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.currentSrc) setState(el.naturalWidth > 0 ? "shown" : "missing");
  }, [id]);

  useEffect(() => {
    if (!id || !canAsk()) return undefined;
    let alive = true;
    Promise.resolve()
      .then(() => loadDetails(id))
      .then(
        // The number from what the API said, never from the address.
        (data) => alive && data && setNumber(certificateNumberOf(data.ticket_id, data.certificate_no) || null),
        () => {}
      );
    return () => {
      alive = false;
    };
  }, [id, loadDetails, canAsk]);

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
