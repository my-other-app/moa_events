import { Fragment } from "react";
import { Link } from "@/lib/router";
import { SUPPORT } from "@/content/support";
import { RichText } from "../discover/eventbits";
import Icon from "../discover/icons";
import { Block } from "../discover/legalpage";
import { MailCard } from "./helpbits";
import { HelpForm } from "./helpform";
import { MyRequests } from "./myrequests";

/**
 * /help, laid out: the answers to what people ask most, then "Ask us" (the
 * form, or "Email us" while the API has no desk), then "My requests" for a
 * signed-in person. Rendered on the server (src/app/help/page.jsx); the
 * form and the list are islands.
 *
 *   desk   {desk: "on", answers, topics} | {desk: "off"} | {desk: "unknown"}
 *          (src/server/support.js)
 *
 * The answers are the desk's own (GET /support/help, grouped by topic) when
 * it has published some; otherwise the site's (@/content/support, the same
 * questions /support answers), so the page is never empty.
 */

/** The desk's answers by topic, in the desk's order of first appearance. */
function byTopic(answers, topics) {
  const label = new Map((topics || []).map((t) => [t.key, t.label]));
  const groups = [];
  const at = new Map();
  for (const a of answers) {
    const k = a.topic || "other";
    if (!at.has(k)) {
      at.set(k, groups.length);
      groups.push({ key: k, label: label.get(k) || "More questions", items: [] });
    }
    groups[at.get(k)].items.push(a);
  }
  return groups;
}

function Answer({ id, question, children }) {
  return (
    <details id={id} className="fc-qa hp-qa">
      <summary>
        <span>{question}</span>
        <Icon name="plus" size={20} className="fc-qa-icon" />
      </summary>
      <div className="fc-qa-a">{children}</div>
    </details>
  );
}

function DeskAnswers({ answers, topics }) {
  const groups = byTopic(answers, topics);
  return groups.map((g) => (
    <div key={g.key} className="hp-group">
      {groups.length > 1 ? <h3 className="hp-group-title">{g.label}</h3> : null}
      <div className="fc-faq-list">
        {g.items.map((a) => (
          <Answer key={a.id} id={`q-${a.id}`} question={a.question}>
            <RichText text={a.answer} />
          </Answer>
        ))}
      </div>
    </div>
  ));
}

function SiteAnswers() {
  const questions = SUPPORT.sections.flatMap((s) => s.questions || []);
  return (
    <div className="fc-faq-list">
      {questions.map((q) => (
        <Answer key={q.id} id={`q-${q.id}`} question={q.q}>
          {q.blocks.map((b, i) => (
            <Fragment key={i}>
              <Block block={b} />
            </Fragment>
          ))}
        </Answer>
      ))}
    </div>
  );
}

export function HelpView({ desk }) {
  const on = desk?.desk === "on";
  const answers = on && desk.answers.length ? desk.answers : null;
  return (
    <div className="dc-wrap hp">
      <header className="dc-legal-head hp-head">
        <p className="dc-eyebrow">
          <Icon name="comment" size={16} /> Help
        </p>
        <h1 id="hp-title">How can we help?</h1>
        <p className="dc-support-lede">Answers to what people ask us most. Can&rsquo;t find yours? Ask us below and we&rsquo;ll reply by email.</p>
        <div className="dc-support-ctas">
          <a className="dc-btn" href="#ask">
            <Icon name="mail" size={16} /> Ask us
          </a>
          <Link className="dc-btn dc-btn--ghost" to="/support#delete-account">
            Delete your account
          </Link>
        </div>
      </header>

      <section className="hp-answers" aria-labelledby="hp-answers-title">
        <h2 id="hp-answers-title" className="hp-h2">
          Common questions
        </h2>
        {answers ? <DeskAnswers answers={answers} topics={desk.topics} /> : <SiteAnswers />}
      </section>

      <section id="ask" className="hp-ask" aria-labelledby="hp-ask-title">
        <div className="hp-ask-head">
          <h2 id="hp-ask-title" className="hp-h2">
            Ask us
          </h2>
          <p>We read every message. Tell us what happened, and add a screenshot if you have one.</p>
        </div>
        {desk?.desk === "off" ? <MailCard /> : <HelpForm topics={on && desk.topics.length ? desk.topics : null} />}
      </section>

      {desk?.desk === "off" ? null : <MyRequests />}
    </div>
  );
}
