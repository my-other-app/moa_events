import { Suspense } from "react";
import { Link } from "@/lib/router";
import { CONTACT_EMAIL } from "@/config";
import { DATA_DELETION } from "@/content/datadeletion";
import { LEGAL } from "@/content/legal";
import Icon from "../discover/icons";
import { Block } from "../discover/legalpage";
import { DeletionStatus } from "./deletionstatus";

/**
 * /data-deletion, laid out as /support is (the legal pages' layout): what we
 * keep from a club's social accounts, how to disconnect one, what we delete,
 * and, when Facebook sends someone here with a confirmation code, their
 * request's status at the top (an island: the code is in the address).
 * Rendered on the server from @/content/datadeletion.
 */
export function DataDeletionView() {
  const doc = DATA_DELETION;
  return (
    <div className="dc-wrap">
      <article className="dc-legal dc-support" aria-labelledby="dd-title">
        <header className="dc-legal-head">
          <p className="dc-eyebrow">
            <Icon name="shield" size={16} /> Privacy
          </p>
          <h1 id="dd-title">{doc.title}</h1>
          <p className="dc-support-lede">{doc.lede}</p>
          <Suspense fallback={null}>
            <DeletionStatus />
          </Suspense>
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
        <Link className="dc-btn dc-btn--ghost" to={LEGAL.privacy.path}>
          {LEGAL.privacy.title} <Icon name="arrowRight" size={16} />
        </Link>
      </aside>
    </div>
  );
}
