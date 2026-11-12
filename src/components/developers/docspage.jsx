import { Link } from "@/lib/router";
import { SitePage } from "@/components/discover/chrome";
import { Crumbs } from "@/components/discover/citypage";
import Icon from "@/components/discover/icons";
import { DOCS_GROUPS, DOCS_UPDATED, docsPage, neighbours } from "@/content/developers/nav";
import { developerDocs } from "@/content/developers/pages";
import COPY from "@/content/developers/openapi.json";
import { apiContext, listWebhooks, scopeList } from "@/developers/openapi";
import { docsStructuredData, docsTrail } from "@/developers/seo";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { Block } from "./blocks";
import { Reference, ScopesTable, WebhookTypes, referenceToc } from "./reference";

/*
 * A developer docs page (/developers/...): breadcrumbs, the docs' menu
 * (beside the page on a desk, a "Menu" that opens above it on a phone),
 * the page's title, its words (src/content/developers/pages.js) or the
 * API reference, and "Previous" / "Next". All of it on the server; the
 * copy buttons are the only islands.
 */

const updated = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(`${DOCS_UPDATED}T00:00:00+05:30`));

function NavList({ current, toc, variant }) {
  return (
    <div className="dv-nav">
      {DOCS_GROUPS.map((g, gi) => (
        <div key={g.name} className="dv-nav-group">
          <p className="dv-nav-name" id={`dv-nav-${variant}-${gi}`}>
            {g.name}
          </p>
          <ul aria-labelledby={`dv-nav-${variant}-${gi}`}>
            {g.pages.map((p) => {
              const here = p.slug === current;
              return (
                <li key={p.slug}>
                  <Link to={p.slug ? `/developers/${p.slug}` : "/developers"} className={here ? "is-current" : undefined} aria-current={here ? "page" : undefined}>
                    {p.title}
                  </Link>
                  {here && toc.length ? (
                    <ul className="dv-nav-toc" aria-label={`On this page: ${p.title}`}>
                      {toc.map((t) => (
                        <li key={t.id}>
                          <a href={`#${t.id}`}>{t.heading}</a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Pager({ slug }) {
  const { previous, next } = neighbours(slug);
  if (!previous && !next) return null;
  return (
    <nav className="dv-pager" aria-label="Previous and next page">
      {previous ? (
        <Link className="dv-pager-link" to={previous.path} rel="prev">
          <span className="dv-pager-dir">
            <Icon name="arrowLeft" size={14} /> Previous
          </span>
          <strong>{previous.title}</strong>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link className="dv-pager-link dv-pager-link--next" to={next.path} rel="next">
          <span className="dv-pager-dir">
            Next <Icon name="arrowRight" size={14} />
          </span>
          <strong>{next.title}</strong>
        </Link>
      ) : null}
    </nav>
  );
}

/** The frame of every docs page. `toc`: [{id, heading}] for "On this page". */
export function DocsFrame({ page, toc = [], children }) {
  return (
    <div className="dc-wrap dv">
      <Crumbs trail={docsTrail(page)} />
      <div className="dv-layout">
        <nav className="dv-side" aria-label="Developer docs">
          <NavList current={page.slug} toc={toc} variant="side" />
        </nav>
        {/* A new menu for each page, so it opens closed after following a link in it. */}
        <nav className="dv-menu-wrap" aria-label="Developer docs" key={page.slug}>
          <details className="dv-menu">
            <summary>
              <Icon name="menu" size={18} />
              <span>
                Developer docs <span className="dv-menu-current">· {page.title}</span>
              </span>
              <Icon name="chevronDown" size={16} className="dv-menu-chev" />
            </summary>
            <NavList current={page.slug} toc={toc} variant="menu" />
          </details>
        </nav>
        <article className="dv-main" aria-labelledby="dv-title">
          <header className="dv-head">
            <p className="dc-eyebrow">
              <Icon name="code" size={16} /> Developers{page.slug ? ` · ${page.group}` : ""}
            </p>
            <h1 id="dv-title">{page.heading || page.title}</h1>
            <p className="dv-updated">
              Updated <time dateTime={DOCS_UPDATED}>{updated}</time>
            </p>
          </header>
          <div className="dc-prose dv-prose">{children}</div>
          <Pager slug={page.slug} />
        </article>
      </div>
    </div>
  );
}

/**
 * A whole docs page for `slug`, from the OpenAPI document `doc` (and where
 * it came from, `source`: "api" or "copy"). The Webhooks page's table of
 * types falls back to the copy's when the API's document has no webhooks.
 */
export function DeveloperPage({ slug, doc, source }) {
  const page = docsPage(slug);
  const api = apiContext(doc);
  const content = developerDocs(api)[page.slug];
  const isReference = page.slug === "reference";
  const extra = {
    scopes: <ScopesTable scopes={scopeList(doc)} />,
    webhookTypes: <WebhookTypes doc={listWebhooks(doc).length ? doc : COPY} />,
  };
  const toc = isReference ? referenceToc(doc) : content.sections.map((s) => ({ id: s.id, heading: s.heading }));
  return (
    <SitePage>
      <JsonLd data={docsStructuredData(page)} />
      <DocsFrame page={page} toc={toc}>
        <div className="dv-intro">
          {content.intro.map((b, i) => (
            <Block key={i} block={b} api={api} extra={extra} />
          ))}
        </div>
        {content.sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`}>
            <h2 id={`${s.id}-title`}>{s.heading}</h2>
            {s.blocks.map((b, i) => (
              <Block key={i} block={b} api={api} extra={extra} />
            ))}
          </section>
        ))}
        {isReference ? <Reference doc={doc} source={source} /> : null}
      </DocsFrame>
    </SitePage>
  );
}
