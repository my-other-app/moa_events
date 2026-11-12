import { Fragment } from "react";
import { Link } from "@/lib/router";
import Icon from "@/components/discover/icons";
import { DOWNLOADS } from "@/content/developers/nav";
import { highlight, inlineParts, langOf } from "@/developers/text";
import { CopyButton } from "./copybutton";
import { SyncDiagram } from "./syncdiagram";

/*
 * The developer docs' building blocks, rendered on the server: a line's
 * marks, code with its colours and a copy button, tables, notes, and the
 * blocks of src/content/developers/pages.js. Links inside the site go
 * through the router; anything else is a plain <a>.
 */

const LANG_LABEL = { bash: "Shell", js: "JavaScript", python: "Python", php: "PHP", json: "JSON", http: "HTTP", text: "Text" };

export function SmartLink({ href, children, className }) {
  if (href.startsWith("/")) {
    return (
      <Link className={className} to={href}>
        {children}
      </Link>
    );
  }
  if (href.startsWith("#")) {
    return (
      <a className={className} href={href}>
        {children}
      </a>
    );
  }
  // Only addresses that go somewhere safe: words from a document never become a script.
  if (!/^(https?:|mailto:)/i.test(href)) return <span className={className}>{children}</span>;
  return (
    <a className={className} href={href} {...(/^https?:/i.test(href) ? { rel: "noopener" } : {})}>
      {children}
    </a>
  );
}

/** One line of the docs' words: `code`, **bold** and [links](…). */
export function Inline({ text }) {
  return inlineParts(text).map((part, i) => {
    if (part.code !== undefined) return <code key={i}>{part.code}</code>;
    if (part.strong !== undefined) return <strong key={i}>{part.strong}</strong>;
    if (part.link !== undefined)
      return (
        <SmartLink key={i} href={part.href}>
          {inlineParts(part.link).map((p, j) => (p.code !== undefined ? <code key={j}>{p.code}</code> : <Fragment key={j}>{p.text ?? p.strong ?? p.link}</Fragment>))}
        </SmartLink>
      );
    return <Fragment key={i}>{part.text}</Fragment>;
  });
}

/** Code, coloured, with its language (or file name) above it and a copy button. Scrolls sideways inside itself, never the page. */
export function CodeBlock({ code, lang = "text", title = null }) {
  const l = lang === "http" ? "text" : langOf(lang);
  const label = title || LANG_LABEL[lang] || LANG_LABEL[l] || "Code";
  return (
    <figure className="dv-code">
      <figcaption className="dv-code-head">
        <span className="dv-code-label">{label}</span>
        <CopyButton />
      </figcaption>
      <pre tabIndex={0}>
        <code className={`dv-lang-${lang}`}>
          {highlight(code, l).map((run, i) =>
            run.kind ? (
              <span key={i} className={`dv-t-${run.kind}`}>
                {run.text}
              </span>
            ) : (
              <Fragment key={i}>{run.text}</Fragment>
            )
          )}
        </code>
      </pre>
    </figure>
  );
}

/** A table that scrolls sideways inside itself on a phone. Cells are lines of the docs' words. */
export function DocTable({ head, rows, caption = null }) {
  return (
    <div className="dv-table" role="region" aria-label={caption || head.join(", ")} tabIndex={0}>
      <table>
        {caption ? <caption className="dc-sr">{caption}</caption> : null}
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col">
                {h ? <Inline text={h} /> : <span className="dc-sr">Name</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) =>
                c === 0 ? (
                  <th key={c} scope="row">
                    <Inline text={String(cell)} />
                  </th>
                ) : (
                  <td key={c}>
                    <Inline text={String(cell)} />
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Download OpenAPI" and "Postman collection". */
export function Downloads({ api }) {
  return (
    <div className="dv-downloads">
      <a className="dc-btn dc-btn--ghost dc-btn--sm" href={DOWNLOADS.openapi.path} download={DOWNLOADS.openapi.filename} type="application/json">
        <Icon name="download" size={16} /> Download OpenAPI
      </a>
      <a className="dc-btn dc-btn--ghost dc-btn--sm" href={DOWNLOADS.postman.path} download={DOWNLOADS.postman.filename} type="application/json">
        <Icon name="download" size={16} /> Postman collection
      </a>
      {api?.version ? <span className="dv-downloads-note">OpenAPI 3.1 · version {api.version}</span> : null}
    </div>
  );
}

function Cards({ items }) {
  return (
    <ul className="dv-cards">
      {items.map((c) => (
        <li key={c.title}>
          <SmartLink className="dv-card" href={c.href}>
            <strong>{c.title}</strong>
            <span>{c.text}</span>
            <Icon name="arrowRight" size={16} className="dv-card-go" />
          </SmartLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * One block of src/content/developers/pages.js. `extra` renders the blocks
 * that need the OpenAPI document (scopes, webhook types): {scopes, webhookTypes}.
 */
export function Block({ block, api, extra = {} }) {
  const [kind, a, b, c] = block;
  switch (kind) {
    case "p":
      return (
        <p>
          <Inline text={a} />
        </p>
      );
    case "h3":
      return b ? (
        <h3 id={b}>
          <Inline text={a} />
        </h3>
      ) : (
        <h3>
          <Inline text={a} />
        </h3>
      );
    case "ul":
    case "ol": {
      const List = kind;
      return (
        <List>
          {a.map((item, i) => (
            <li key={i}>
              <Inline text={item} />
            </li>
          ))}
        </List>
      );
    }
    case "code":
      return <CodeBlock lang={a} code={b} title={c || null} />;
    case "table":
      return <DocTable head={a} rows={b} caption={c || null} />;
    case "note":
    case "warn":
      return (
        <p className={`dv-note${kind === "warn" ? " dv-note--warn" : ""}`}>
          <Icon name={kind === "warn" ? "alert" : "zap"} size={16} className="dv-note-icon" />
          <span>
            <Inline text={a} />
          </span>
        </p>
      );
    case "cards":
      return <Cards items={a} />;
    case "downloads":
      return <Downloads api={api} />;
    case "diagram":
      return <SyncDiagram />;
    case "scopes":
      return extra.scopes || null;
    case "webhook-types":
      return extra.webhookTypes || null;
    default:
      return null;
  }
}
