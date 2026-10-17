import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/config";
import { imageUrl, initial } from "@/utils/format";
import Icon from "./icons";
import logoIcon from "@/assets/logo-icon.png";

/**
 * An image that steps aside for its fallback when it is missing or fails to
 * load. The box around it reserves the space, so nothing jumps. `extra`
 * shows only with the image (a date pinned to a poster, say), never with
 * the fallback.
 */
export function Img({ src, alt, fallback = null, className, extra = null, loading = "lazy" }) {
  const [failed, setFailed] = useState(null);
  if (!src || failed === src) return fallback;
  const img = <img className={className} src={src} alt={alt} loading={loading} decoding="async" onError={() => setFailed(src)} />;
  return extra ? (
    <>
      {img}
      {extra}
    </>
  ) : (
    img
  );
}

/** A club's round logo, or its initial when it has none. */
export function Avatar({ name, src, size = 32, alt = "" }) {
  return (
    <span className="dc-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}>
      <Img src={imageUrl(src, size > 64 ? "medium" : "thumbnail")} alt={alt} fallback={<span aria-hidden="true">{initial(name)}</span>} />
    </span>
  );
}

/** A titled block on a page, with an optional "See all". */
export function Section({ id, title, sub, seeAll, children, className = "" }) {
  const headingId = `${id}-title`;
  return (
    <section id={id} className={`dc-section ${className}`} aria-labelledby={headingId}>
      <div className="dc-section-head">
        <div>
          <h2 className="dc-section-title" id={headingId}>
            {title}
          </h2>
          {sub ? <p className="dc-section-sub">{sub}</p> : null}
        </div>
        {seeAll ? (
          <Link className="dc-seeall" to={seeAll} aria-label={`See all: ${title}`}>
            See all <Icon name="arrowRight" size={16} />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function ErrorState({ title = "That didn't load", message = "Something went wrong on our side or with the connection. Try again in a moment.", onRetry }) {
  return (
    <div className="dc-state dc-state--error" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry ? (
        <div className="dc-state-actions">
          <button type="button" className="dc-btn" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, message, children, as = "h2" }) {
  const Heading = as;
  return (
    <div className="dc-state">
      <Heading>{title}</Heading>
      {message ? <p>{message}</p> : null}
      {children ? <div className="dc-state-actions">{children}</div> : null}
    </div>
  );
}

/** The stores' marks, drawn once in one colour so the two badges match. */
export function AppleGlyph() {
  return (
    <svg className="dc-store-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
      />
    </svg>
  );
}

export function PlayGlyph() {
  return (
    <svg className="dc-store-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z"
      />
    </svg>
  );
}

/**
 * The two store badges, drawn here in the site's own type and colours
 * rather than pasted in as images. The Play one always links; the App
 * Store one links once VITE_APP_STORE_URL is set and until then says it is
 * coming soon, as plain text. `tone="light"` is for a dark background.
 */
export function StoreButtons({ tone = "dark", size = "md", appStoreUrl = APP_STORE_URL, playStoreUrl = PLAY_STORE_URL }) {
  const cls = `dc-store dc-store--${size}${tone === "light" ? " dc-store--on-dark" : ""}`;
  return (
    <div className="dc-stores">
      <a className={cls} href={playStoreUrl} target="_blank" rel="noopener noreferrer" aria-label="Get it on Google Play">
        <PlayGlyph />
        <span className="dc-store-text" aria-hidden="true">
          <small>Get it on</small>
          <strong>Google Play</strong>
        </span>
      </a>
      {appStoreUrl ? (
        <a className={cls} href={appStoreUrl} target="_blank" rel="noopener noreferrer" aria-label="Download on the App Store">
          <AppleGlyph />
          <span className="dc-store-text" aria-hidden="true">
            <small>Download on the</small>
            <strong>App Store</strong>
          </span>
        </a>
      ) : (
        <span className={`${cls} is-soon`}>
          <AppleGlyph />
          <span className="dc-store-text">
            <small>Coming soon on the</small> <strong>App Store</strong>
          </span>
        </span>
      )}
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * A small dialog: Escape and the backdrop close it, Tab stays inside, and
 * focus goes back to whatever opened it.
 */
export function Dialog({ open, onClose, labelledBy, className, backdropClassName, children }) {
  const box = useRef(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    const first = box.current?.querySelector("[data-autofocus]") || box.current?.querySelector(FOCUSABLE);
    first?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current?.();
      } else if (e.key === "Tab" && box.current) {
        const items = [...box.current.querySelectorAll(FOCUSABLE)];
        if (!items.length) return;
        const head = items[0];
        const tail = items[items.length - 1];
        if (e.shiftKey && document.activeElement === head) {
          e.preventDefault();
          tail.focus();
        } else if (!e.shiftKey && document.activeElement === tail) {
          e.preventDefault();
          head.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (before && typeof before.focus === "function") before.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div
      className={`dc-scope ${backdropClassName}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close.current?.();
      }}
    >
      <div ref={box} className={className} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>,
    document.body
  );
}

/**
 * "Do this in the app": following, liking, voting and commenting need an
 * account, and accounts live in the app. `alt`, when given, is the other way
 * (signing in here), under an "or".
 */
export function AppPrompt({ open, onClose, title = "Get MyOtherApp", message, alt = null }) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} labelledBy={id} className="dc-modal" backdropClassName="dc-modal-backdrop">
      <button type="button" className="dc-iconbtn" aria-label="Close" onClick={onClose}>
        <Icon name="close" size={20} />
      </button>
      <img className="dc-modal-mark" src={logoIcon} alt="" width="56" height="56" />
      <h2 id={id}>{title}</h2>
      <p>{message || "Follow clubs, get your tickets in a tap and hear about events before they fill up. Free on your phone."}</p>
      <StoreButtons />
      {alt ? (
        <div className="dc-modal-alt">
          <span className="dc-modal-or">or</span>
          {alt}
        </div>
      ) : null}
      <button type="button" className="dc-modal-later" onClick={onClose}>
        Not now
      </button>
    </Dialog>
  );
}
