import { Link } from "@/lib/router";
import Icon from "@/components/discover/icons";
import { API_BASE_URL } from "@/config";
import { EXAMPLE_NUMBER } from "@/utils/certcode";
import { formatDate, TZ } from "@/utils/format";
import { CheckForm } from "./checkform";
import { FileCheck } from "./filecheck";

/*
 * The public certificate verifier: /verify (the landing, indexable) and
 * /verify/{number} (a result, never indexed or cached). Rendered on the
 * server, so a result is whole without JavaScript; the form and the file
 * check are the only islands.
 */

export const VERIFY_META = {
  title: "Verify a MyOtherApp certificate",
  description:
    "Check whether a certificate issued on MyOtherApp is genuine and still valid: enter its number, scan its QR code or paste its link. No search by name or email.",
};

const checkedFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

/** "22 Oct 2026, 2:05:09 pm IST": when this page asked. */
export const checkedAtLabel = (iso) => `${checkedFmt.format(new Date(iso))} IST`;

function Trust() {
  return (
    <p className="vf-trust">
      <Icon name="shield" size={16} />
      <span>
        Only trust results shown on <strong>myotherapp.in/verify</strong>. A screenshot, a forwarded message or a page on any other address proves
        nothing.
      </span>
    </p>
  );
}

/** A certificate, drawn in CSS: where its number and QR sit. */
function CertificateSketch() {
  return (
    <div className="vf-sketch" aria-hidden="true">
      <div className="vf-sketch-sheet">
        <span className="vf-sketch-club" />
        <span className="vf-sketch-title">Certificate</span>
        <span className="vf-sketch-line vf-sketch-line--name" />
        <span className="vf-sketch-line" />
        <span className="vf-sketch-line vf-sketch-line--short" />
        <div className="vf-sketch-foot">
          <span className="vf-sketch-club-name">
            <span />
            <span />
          </span>
          <span className="vf-sketch-no">{EXAMPLE_NUMBER}</span>
          <span className="vf-sketch-qr" />
        </div>
      </div>
      <p className="vf-sketch-tags">
        <span>The number</span>
        <span>Its QR code</span>
      </p>
    </div>
  );
}

const LEGEND = [
  { tone: "valid", icon: "check", title: "Genuine", text: "Issued by the club on MyOtherApp and still valid. Check that the name, event and date match the certificate you were shown." },
  { tone: "revoked", icon: "alert", title: "Revoked", text: "It was issued, then withdrawn by the club. Don't accept it." },
  { tone: "notfound", icon: "close", title: "Not found", text: "No certificate has this number. Look for a typo first; if it is right, MyOtherApp didn't issue it." },
];

/** /verify: what it is, the box, how to read the answer, where the number is. */
export function VerifyLanding({ code = "", error = null }) {
  return (
    <div className="dc-wrap vf-wrap">
      <section className="vf-hero" aria-labelledby="vf-title">
        <p className="dc-eyebrow">
          <Icon name="shield" size={14} /> Certificate check
        </p>
        <h1 id="vf-title">Verify a MyOtherApp certificate</h1>
        <p className="vf-lede">
          Anyone can check whether a certificate issued on MyOtherApp is genuine and still valid, in a few seconds and without an account.
        </p>
        <CheckForm initial={code} error={error} />
      </section>

      <div className="vf-guide">
        <section className="vf-card" aria-labelledby="vf-where">
          <h2 id="vf-where">Where to find the number</h2>
          <CertificateSketch />
          <p>
            It is printed on the certificate as <span className="vf-mono">CERT-</span> and ten letters and digits, beside a QR code. Scanning the QR
            with a phone camera opens this check by itself. The letters O, I and L are never used, so a 0 or a 1 is always a digit.
          </p>
        </section>
        <section className="vf-card" aria-labelledby="vf-read">
          <h2 id="vf-read">How to read the result</h2>
          <ul className="vf-legend">
            {LEGEND.map((l) => (
              <li key={l.title} className={`vf-tone--${l.tone}`}>
                <span className="vf-legend-icon" aria-hidden="true">
                  <Icon name={l.icon} size={16} />
                </span>
                <div>
                  <h3>{l.title}</h3>
                  <p>{l.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="vf-private">
            <strong>No search by name or email.</strong> A certificate is found only by its own number, QR or link, so nobody can use this page to
            find out who went where.
          </p>
        </section>
      </div>
      <Trust />
    </div>
  );
}

const VERDICT = {
  valid: { tone: "valid", icon: "check", kicker: "Valid", title: "This certificate is genuine" },
  revoked: { tone: "revoked", icon: "alert", kicker: "Revoked", title: "Issued, then revoked by the club" },
  not_found: { tone: "notfound", icon: "close", kicker: "Not found", title: "No certificate has this number" },
  invalid: { tone: "notfound", icon: "close", kicker: "Not a number", title: "That isn't a certificate number" },
  limited: { tone: "muted", icon: "alert", kicker: "Slow down", title: "Too many checks from here" },
  unavailable: { tone: "muted", icon: "alert", kicker: "Try again", title: "We couldn't check just now" },
};

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

function Facts({ number, result }) {
  const rows =
    result.state === "valid"
      ? [
          ["Awarded to", result.attendeeName || "—"],
          ["Event", result.eventName || "—"],
          ["Issued by", <Club key="club" result={result} />],
          ["Date issued", formatDate(result.issuedAt) || "—"],
          ["Certificate number", <span key="no" className="vf-mono">{result.number || number}</span>],
        ]
      : result.state === "revoked"
        ? [
            ["Event", result.eventName || "—"],
            ["Issued by", <Club key="club" result={result} />],
            ["Certificate number", <span key="no" className="vf-mono">{result.number || number}</span>],
          ]
        : [["Number checked", <span key="no" className="vf-mono">{number}</span>]];
  return (
    <dl className="vf-facts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Explain({ state, result }) {
  if (state === "valid")
    return (
      <p>
        Issued on MyOtherApp{result.orgName ? ` by ${result.orgName}` : ""}, and not revoked. Check that the details below match the certificate
        you were shown.
      </p>
    );
  if (state === "revoked")
    return <p>The club issued this certificate, then withdrew it. It is no longer valid: don&rsquo;t accept it as proof.</p>;
  if (state === "not_found" || state === "invalid")
    return (
      <p>
        Check it for typos: a number looks like <span className="vf-mono">{EXAMPLE_NUMBER}</span>, and never uses the letters O, I or L. If it is
        right, this certificate wasn&rsquo;t issued on MyOtherApp.
      </p>
    );
  if (state === "limited") return <p>Wait a minute, then check again. Every check counts, so nobody can try numbers until one works.</p>;
  return <p>The check didn&rsquo;t go through. Try again in a minute.</p>;
}

/**
 * /verify/{number}: the verdict, big; the facts the API gave; the picture
 * of the certificate as issued and the file check, for a valid one; when
 * this was checked; and the box again.
 *
 *   number     the canonical number, or null when the address held none
 *   result     checkCertificate's answer ({state, ...}), or {state: "invalid"}
 *   checkedAt  ISO time the check was made
 */
export function VerifyResult({ number, result, checkedAt, apiBase = API_BASE_URL }) {
  const state = result?.state in VERDICT ? result.state : "unavailable";
  const v = VERDICT[state];
  const answered = state === "valid" || state === "revoked" || state === "not_found";
  const preview = state === "valid" ? `${apiBase}/api/v1/verify/certificates/${encodeURIComponent(number)}/image` : null;
  return (
    <div className="dc-wrap vf-wrap">
      <p className="vf-back">
        <Link className="dc-link" to="/verify">
          Verify a certificate
        </Link>
      </p>
      <section className={`vf-result vf-tone--${v.tone}`} aria-labelledby="vf-verdict" data-state={state}>
        <div className="vf-verdict">
          <span className="vf-verdict-badge" aria-hidden="true">
            <Icon name={v.icon} size={30} />
          </span>
          <div>
            <p className="vf-verdict-kicker">{v.kicker}</p>
            <h1 id="vf-verdict">{v.title}</h1>
            <Explain state={state} result={result || {}} />
          </div>
        </div>
        {number && state !== "limited" && state !== "unavailable" ? <Facts number={number} result={result} /> : null}
        {answered ? (
          <p className="vf-checked">
            <Icon name="shield" size={14} /> Verified just now from myotherapp.in &middot; <time dateTime={checkedAt}>{checkedAtLabel(checkedAt)}</time>
          </p>
        ) : null}
      </section>

      {preview ? (
        <figure className="vf-preview">
          {/* The API's own render, straight from it: never through Next's optimiser, never cached. */}
          <img src={preview} alt={`The certificate ${number} as issued`} referrerPolicy="no-referrer" decoding="async" />
          <figcaption>The certificate as we issued it. The name, event, date and number should match the paper or PDF you were given.</figcaption>
        </figure>
      ) : null}

      {state === "valid" ? <FileCheck number={number} apiBase={apiBase} /> : null}

      <section className="vf-again" aria-labelledby="vf-again-title">
        <h2 id="vf-again-title">Check another</h2>
        <CheckForm label="Certificate number, QR text or link" />
      </section>
      <Trust />
    </div>
  );
}
