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

/** The store buttons. The App Store one shows only when its link is configured. */
export function StoreButtons({ tone = "dark" }) {
  return (
    <div className="dc-stores">
      <a className={`dc-btn ${tone === "light" ? "dc-btn--accent" : ""}`} href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
        Get it on Google Play
      </a>
      {APP_STORE_URL ? (
        <a className="dc-btn dc-btn--ghost" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
          Download on the App Store
        </a>
      ) : null}
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
 * account, and accounts live in the app.
 */
export function AppPrompt({ open, onClose, title = "Get MyOtherApp", message }) {
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
      <button type="button" className="dc-modal-later" onClick={onClose}>
        Not now
      </button>
    </Dialog>
  );
}
