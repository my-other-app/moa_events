import { SitePage } from "@/components/discover/chrome";
import { Crumbs } from "@/components/discover/citypage";
import Icon from "@/components/discover/icons";
import { CLUBS_URL, DEVELOPERS_EMAIL } from "@/config";
import { DOCS_UPDATED, docsPage } from "@/content/developers/nav";
import { DOCS_PUBLIC, PRIVATE_LINK_LABEL, PRIVATE_MESSAGE, PRIVATE_TITLE } from "@/developers/gate";
import { docsStructuredData, docsTrail } from "@/developers/seo";
import { JsonLd } from "@/seo/JsonLd.jsx";

/*
 * /developers: the one public page of the developer docs
 * (feature-register/private-dev-docs-contract.md, decision 1). What the
 * Integrations API does, the two ways in, that MyOtherApp gives access per
 * club, how to ask, and where people with access open the docs. On
 * purpose it names no endpoint, field, scope, error code or code sample:
 * those are behind the docs link (src/developers/gate.js). Indexed, in the
 * sitemap, linked from the footer. No docs menu: the private pages aren't
 * linked from here at all.
 */

/** The clubs dashboard's Settings → Integrations (it asks for a sign-in first). */
const INTEGRATIONS_URL = `${CLUBS_URL}/settings/integrations`;

const updated = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(`${DOCS_UPDATED}T00:00:00+05:30`));

export const WHAT_IT_DOES = [
  { title: "Publish events", text: "Create events from your own system, change them, and publish them on MyOtherApp." },
  { title: "Take registrations", text: "Register people from your own forms, under the event's own rules: its questions, places and dates." },
  { title: "Check people in", text: "Check people in at the door from your own scanner or app, and see who came." },
  { title: "Issue certificates", text: "Issue certificates to the people who came, and read them back into your records." },
  { title: "Sync both ways", text: "When something changes on MyOtherApp, we tell your system at once, with signed webhooks, so both stay in step." },
];

export const WAYS_IN = [
  { title: "Club API keys", text: "For a club's own systems: its website, an ERP, a college system. Once access is on, the club's owner or an admin makes keys in the club dashboard. A key belongs to one club." },
  { title: "Partner apps", text: "For a platform that works with many clubs, such as an event tool or a CRM. MyOtherApp registers the app, and each club chooses to connect it and what it may do." },
];

function Facts({ items }) {
  return (
    <ul className="dv-cards">
      {items.map((c) => (
        <li key={c.title}>
          <div className="dv-card dv-card--plain">
            <strong>{c.title}</strong>
            <span>{c.text}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PublicDevelopers() {
  const page = docsPage("");
  const mail = `mailto:${DEVELOPERS_EMAIL}?subject=${encodeURIComponent("API access for our platform")}`;
  return (
    <SitePage>
      <JsonLd data={docsStructuredData(page)} />
      <div className="dc-wrap dv dv-public">
        <Crumbs trail={docsTrail(page)} />
        <article className="dv-main" aria-labelledby="dv-title">
          <header className="dv-head">
            <p className="dc-eyebrow">
              <Icon name="code" size={16} /> Developers
            </p>
            <h1 id="dv-title">{page.heading}</h1>
            <p className="dv-updated">
              Updated <time dateTime={DOCS_UPDATED}>{updated}</time>
            </p>
          </header>
          <div className="dc-prose dv-prose">
            <div className="dv-intro">
              <p>
                The Integrations API connects MyOtherApp to the systems clubs already use, both ways. What your system does through it happens on MyOtherApp too, and what happens on
                MyOtherApp (in the dashboard, the app or the website) reaches your system.
              </p>
            </div>

            <section id="what-it-does" aria-labelledby="what-it-does-title">
              <h2 id="what-it-does-title">What the API does</h2>
              <Facts items={WHAT_IT_DOES} />
            </section>

            <section id="two-ways-in" aria-labelledby="two-ways-in-title">
              <h2 id="two-ways-in-title">Two ways in</h2>
              <Facts items={WAYS_IN} />
            </section>

            <section id="access" aria-labelledby="access-title">
              <h2 id="access-title">Access is given per club</h2>
              <p>
                Nothing is on by default. The MyOtherApp team turns API access on for each club, and registers each partner app.
              </p>
            </section>

            <section id="how-to-ask" aria-labelledby="how-to-ask-title">
              <h2 id="how-to-ask-title">How to ask for access</h2>
              <ul>
                <li>
                  <strong>For a club:</strong> the club&apos;s owner opens <strong>Settings → Integrations</strong> in the <a href={INTEGRATIONS_URL}>club dashboard</a>, and asks the MyOtherApp team from there.
                </li>
                <li>
                  <strong>For a platform:</strong> write to <a href={mail}>{DEVELOPERS_EMAIL}</a> with your platform&apos;s name, what it does, and how it would work with clubs.
                </li>
              </ul>
            </section>

            <section id="have-access" className="dv-callout" aria-labelledby="have-access-title">
              <h2 id="have-access-title">Already have access?</h2>
              <p>
                Open the docs from your dashboard: <strong>Settings → Integrations → Open developer docs</strong>. The guides, the API reference, the OpenAPI document and the Postman
                collection are there, for the people your club or MyOtherApp has given a docs link.
              </p>
              <p>
                <a className="dc-btn dc-btn--ghost dc-btn--sm" href={INTEGRATIONS_URL}>
                  Open the club dashboard <Icon name="external" size={16} />
                </a>
              </p>
            </section>
          </div>
        </article>
      </div>
    </SitePage>
  );
}

/** What a private docs address shows without access, in the site's frame (the proxy's own 404 says the same in plain HTML). */
export function PrivateDocs() {
  return (
    <SitePage>
      <div className="dc-wrap dv dv-public dv-private">
        <article className="dv-main" aria-labelledby="dv-title">
          <header className="dv-head">
            <p className="dc-eyebrow">
              <Icon name="code" size={16} /> Developers
            </p>
            <h1 id="dv-title">{PRIVATE_TITLE}</h1>
          </header>
          <div className="dc-prose dv-prose">
            <p>{PRIVATE_MESSAGE}</p>
            <p>
              <a href={DOCS_PUBLIC}>{PRIVATE_LINK_LABEL}</a>
            </p>
          </div>
        </article>
      </div>
    </SitePage>
  );
}
