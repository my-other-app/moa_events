import { Fragment } from "react";
import { Link } from "@/lib/router";
import { CONTACT_EMAIL } from "@/config";
import { LEGAL } from "@/content/legal";
import { SUPPORT } from "@/content/support";
import Icon from "./icons";
import { Block } from "./legalpage";

/**
 * Support: how to reach us, the common questions, and how to delete an
 * account, laid out as the legal pages are (a list of its sections beside
 * the text on a desk) and rendered on the server from @/content/support
 * (src/app/support). /support is the App Store's Support URL;
 * /support#delete-account, the account-deletion address given to Google
 * Play, is in the HTML, so the browser opens on that section by itself.
 * Each question has its own id too (/support#tickets).
 */
export function SupportView() {
  return (
    <div className="dc-wrap">
      <article className="dc-legal dc-support" aria-labelledby="dc-support-title">
        <header className="dc-legal-head">
          <p className="dc-eyebrow">
            <Icon name="comment" size={16} /> Help
          </p>
          <h1 id="dc-support-title">{SUPPORT.title}</h1>
          <p className="dc-support-lede">{SUPPORT.lede}</p>
          <div className="dc-support-ctas">
            <a className="dc-btn" href={`mailto:${CONTACT_EMAIL}`}>
              <Icon name="mail" size={16} /> Email support
            </a>
            <a className="dc-btn dc-btn--ghost" href="#delete-account">
              Delete your account
            </a>
          </div>
        </header>

        <div className="dc-legal-layout">
          <nav className="dc-legal-toc" aria-label="On this page">
            <h2>On this page</h2>
            <ul>
              {SUPPORT.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.heading}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="dc-prose">
            {SUPPORT.sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`}>
                <h2 id={`${s.id}-title`}>{s.heading}</h2>
                {(s.blocks || []).map((b, i) => (
                  <Block key={i} block={b} />
                ))}
                {(s.questions || []).map((q) => (
                  <Fragment key={q.id}>
                    <h3 id={q.id}>{q.q}</h3>
                    {q.blocks.map((b, i) => (
                      <Block key={i} block={b} />
                    ))}
                  </Fragment>
                ))}
              </section>
            ))}
          </div>
        </div>
      </article>

      <aside className="dc-legal-foot" aria-label="Our policies">
        <div>
          <h2>Our policies</h2>
          <p>How we handle your data, and the rules for using MyOtherApp.</p>
        </div>
        <div className="dc-support-policies">
          {[LEGAL.privacy, LEGAL.terms].map((doc) => (
            <Link key={doc.key} className="dc-btn dc-btn--ghost" to={doc.path}>
              {doc.title} <Icon name="arrowRight" size={16} />
            </Link>
          ))}
        </div>
      </aside>
    </div>
  );
}
