import { Fragment } from "react";
import { Link } from "@/lib/router";
import { CONTACT_EMAIL } from "@/config";
import { LEGAL, inline, updatedLabel } from "@/content/legal";
import Icon from "./icons";

/** One line of a legal text: plain words, bold, and links (the site's own go through the router). */
export function Inline({ text }) {
  return inline(text).map((part, i) => {
    if (part.strong !== undefined) return <strong key={i}>{part.strong}</strong>;
    if (part.link !== undefined) {
      return part.href.startsWith("/") ? (
        <Link key={i} to={part.href}>
          {part.link}
        </Link>
      ) : (
        <a key={i} href={part.href}>
          {part.link}
        </a>
      );
    }
    return <Fragment key={i}>{part.text}</Fragment>;
  });
}

function Block({ block }) {
  const [kind, body] = block;
  if (kind === "h3") return <h3>{body}</h3>;
  if (kind === "ul" || kind === "ol") {
    const List = kind;
    return (
      <List>
        {body.map((item, i) => (
          <li key={i}>
            <Inline text={item} />
          </li>
        ))}
      </List>
    );
  }
  return (
    <p>
      <Inline text={body} />
    </p>
  );
}

/**
 * A legal text as a page to read: the title and when it last changed, a
 * list of its sections (beside it on a desk), then the text itself. All of
 * it rendered on the server, from @/content/legal (src/app/privacy, terms).
 * /privacy#delete-account, the account-deletion address given to Google
 * Play, is in the HTML, so the browser opens on that section by itself.
 */
export function LegalPage({ doc }) {
  const other = doc.key === "privacy" ? LEGAL.terms : LEGAL.privacy;
  return (
    <div className="dc-wrap">
      <article className="dc-legal" aria-labelledby="dc-legal-title">
        <header className="dc-legal-head">
          <p className="dc-eyebrow">
            <Icon name={doc.key === "privacy" ? "shield" : "fileText"} size={16} /> Legal
          </p>
          <h1 id="dc-legal-title">{doc.title}</h1>
          <p className="dc-legal-updated">
            Last updated <time dateTime={doc.updated}>{updatedLabel(doc.updated)}</time>
          </p>
        </header>

        <div className="dc-legal-layout">
          <nav className="dc-legal-toc" aria-label="On this page">
            <h2>On this page</h2>
            <ul>
              {doc.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.heading}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="dc-prose">
            {doc.intro.map((b, i) => (
              <Block key={i} block={b} />
            ))}
            {doc.sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`}>
                <h2 id={`${s.id}-title`}>{s.heading}</h2>
                {s.blocks.map((b, i) => (
                  <Block key={i} block={b} />
                ))}
              </section>
            ))}
          </div>
        </div>
      </article>

      <aside className="dc-legal-foot" aria-label="More">
        <div>
          <h2>Questions about this?</h2>
          <p>
            Write to us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </div>
        <Link className="dc-btn dc-btn--ghost" to={other.path}>
          {other.title} <Icon name="arrowRight" size={16} />
        </Link>
      </aside>
    </div>
  );
}
