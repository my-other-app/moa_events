"use client";

/*
 * The event page's own icons and the club's typed text. Client components
 * for the same reason as icons.jsx: the page sends their names and text,
 * not their drawing twice.
 */
import { linkify } from "@/utils/linkify";
import Icon from "./icons";

/* ---------- small things ---------- */

/** Icons only this page needs, drawn like the rest (Feather-style, decorative). */
const PATHS = {
  share: (
    <>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </>
  ),
  calendarPlus: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="12" y1="13" x2="12" y2="19" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
      <line x1="13" y1="6" x2="13" y2="18" strokeDasharray="2 2" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 6h3v1a4 4 0 0 1-4 4" />
      <path d="M7 6H4v1a4 4 0 0 0 4 4" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  directions: (
    <>
      <polygon points="12 2 22 12 12 22 2 12 12 2" />
      <path d="M9 13v-2a1 1 0 0 1 1-1h5" />
      <polyline points="13 8 15 10 13 12" />
    </>
  ),
};

export function EpIcon({ name, size = 18 }) {
  if (!PATHS[name]) return <Icon name={name} size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

/** A club's typed text: paragraphs and line breaks kept, links made clickable, never parsed as HTML. */
export function RichText({ text, className = "" }) {
  const paragraphs = String(text || "")
    .split(/\n{2,}/)
    .map((p) => p.replace(/^\n+|\n+$/g, ""))
    .filter((p) => p.trim());
  return (
    <div className={`ep-rich ${className}`}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {linkify(p).map((t, j) =>
            t.type === "link" ? (
              <a key={j} href={t.href} target={t.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer nofollow ugc">
                {t.value}
              </a>
            ) : (
              t.value
            )
          )}
        </p>
      ))}
    </div>
  );
}
