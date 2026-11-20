import Link from "next/link";

/** A picture in a frame: the poster button's icon. */
export function PosterIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 19a6 6 0 0 1 11 0" />
    </svg>
  );
}

/**
 * "Make your poster", under the ticket: shown only when the API says this
 * ticket has a poster to make (the event's switch on, a moment open, the
 * ticket good). `phrase` is the moment's ("I'm attending").
 */
export default function PosterCta({ href, phrase = "", made = false }) {
  const words = phrase ? `An “${phrase}” poster with your photo, to share.` : "A poster with your photo, to share.";
  return (
    <Link href={href} className="ticket-poster-cta">
      <span className="ticket-poster-cta-icon">
        <PosterIcon />
      </span>
      <span className="ticket-poster-cta-words">
        <span className="ticket-poster-cta-title">{made ? "Your poster" : "Make your poster"}</span>
        <span className="ticket-poster-cta-text">{words}</span>
      </span>
      <svg className="ticket-poster-cta-go" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}
