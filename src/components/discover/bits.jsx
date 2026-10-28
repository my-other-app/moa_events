import { Link } from "@/lib/router";
import { imageUrl, initial } from "@/utils/format";
import { sizeFor } from "@/utils/pictures";
import { LogoImg } from "./picture";
import Icon from "./icons";

/*
 * The small shared pieces. Everything defined here renders on the server or
 * in the browser alike; the interactive ones live in their own client files
 * (img.jsx, dialog.jsx) and are re-exported below, so callers import them
 * all from here as before.
 */
export { Img } from "./img";
export { LogoImg, PosterImg } from "./picture";
export { AppPrompt, Dialog } from "./dialog";
export { AppleGlyph, PlayGlyph, StoreButtons } from "./stores";

/**
 * A club's round logo, or its initial when it has none. A logo that is not
 * square sits whole inside the circle, on white, never cut (LogoImg).
 */
export function Avatar({ name, src, size = 32, alt = "" }) {
  return (
    <span className="dc-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}>
      <LogoImg src={imageUrl(src, sizeFor("logo", size))} alt={alt} fallback={<span aria-hidden="true">{initial(name)}</span>} />
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
