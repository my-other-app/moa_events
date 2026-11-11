import { CONTACT_EMAIL } from "@/config";
import { mailtoHref } from "@/utils/help";
import Icon from "../discover/icons";

/*
 * The small pieces /help shares between the server's paint and its islands.
 * No hooks here: they render on either side.
 */

/**
 * "Email us": what the help form becomes while the API has no desk (it
 * answers 404), and when a request couldn't be sent that way. `subject` and
 * `body` go into the email, so nothing typed is lost.
 */
export function MailCard({ title = "Email us", text = null, subject = "", body = "" }) {
  return (
    <div className="hp-mail" role="status">
      <span className="hp-mail-icon" aria-hidden="true">
        <Icon name="mail" size={22} />
      </span>
      <div>
        <h3 className="hp-mail-title">{title}</h3>
        <p className="hp-mail-text">
          {text ||
            "Write to us and we'll reply by email. Add the event's name or link, or a screenshot, if you have one. If it's about your account, write from the email address on it."}
        </p>
        <a className="dc-btn hp-mail-btn" href={mailtoHref({ subject, body })}>
          <Icon name="mail" size={16} /> {CONTACT_EMAIL}
        </a>
      </div>
    </div>
  );
}

/** The warning every message box carries: what never to send us. */
export function SecretsNote({ card = false }) {
  return (
    <p className={`hp-secrets${card ? " is-strong" : ""}`} role={card ? "alert" : undefined}>
      <Icon name="shield" size={16} />
      <span>
        {card ? (
          <>
            <strong>That looks like a card number.</strong> Please take it out: we never need it, and we hide anything that looks like one.
          </>
        ) : (
          <>
            <strong>Never send passwords, OTPs or card numbers.</strong> We&rsquo;ll never ask for them.
          </>
        )}
      </span>
    </p>
  );
}

/** A request's status, as a chip. */
export function StatusChip({ status, label }) {
  return <span className={`hp-chip is-${status}`}>{label}</span>;
}
