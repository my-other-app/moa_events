import { Link } from "@/lib/router";
import { clubPagePath, eventPagePath } from "@/seo/urls";
import { imageUrl } from "@/utils/format";
import { firstName, hasAchievements, linkIcon, linkLabel, monthLabel } from "@/utils/profiles";
import { EmptyState, Img } from "../discover/bits";
import { Face } from "../discover/eventparts";
import Icon from "../discover/icons";

/**
 * A person's profile, laid out (feature-register/profiles-networking-contract.md):
 * their picture, name, handle, headline, organisation and city, the actions
 * (`actions`: Save to your network and Save contact, from the islands), then
 * their bio, contact details, links, projects, achievements and interests:
 * each only when the API sent it to this reader. A section the owner keeps
 * from this reader (`hidden`) is left out and named in one line; a private
 * profile the reader may not see yet (`locked`) shows its header and says so.
 *
 * Everything a person wrote is rendered as text. Their links are http(s)
 * only (parsePublicProfile drops the rest) and go out as
 * rel="nofollow noopener noreferrer ugc".
 */
export const UGC_REL = "nofollow noopener noreferrer ugc";

const SECTION_NAMES = { links: "links", projects: "projects", achievements: "achievements", interests: "interests", org: "organisation" };

/** "links, projects and interests". */
function listOf(words) {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

function Section({ id, title, count = 0, children }) {
  return (
    <section id={id} className="sp-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="sp-h2">
        {title}
        {count ? <span className="sp-count">{count}</span> : null}
      </h2>
      {children}
    </section>
  );
}

const hostOf = (url) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
};

function Links({ links, name }) {
  return (
    <Section id="links" title="Links">
      <ul className="pf-links" aria-label={`${name} elsewhere`}>
        {links.map((l, i) => (
          <li key={`${l.url}-${i}`}>
            <a className="pf-link" href={l.url} target="_blank" rel={UGC_REL}>
              <Icon name={linkIcon(l)} size={17} />
              <span className="pf-link-label">{linkLabel(l)}</span>
              <span className="pf-link-host">{hostOf(l.url)}</span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Project({ project }) {
  const meta = [project.role, monthLabel(project.month)].filter(Boolean).join(" · ");
  return (
    <li className="pf-project">
      {project.image ? (
        <span className="pf-project-image">
          <Img src={imageUrl(project.image, "medium")} alt="" />
        </span>
      ) : null}
      <div className="pf-project-body">
        <h3 className="pf-project-title">{project.title}</h3>
        {meta ? <p className="pf-project-meta">{meta}</p> : null}
        {project.summary ? <p className="pf-project-summary">{project.summary}</p> : null}
        {project.tags.length ? (
          <ul className="pf-tags" aria-label="Tags">
            {project.tags.map((t) => (
              <li key={t} className="ep-chip">
                {t}
              </li>
            ))}
          </ul>
        ) : null}
        {project.url ? (
          <a className="pf-project-link" href={project.url} target="_blank" rel={UGC_REL}>
            <Icon name="external" size={15} /> {hostOf(project.url) || "Open"}
          </a>
        ) : null}
      </div>
    </li>
  );
}

function Achievements({ a }) {
  return (
    <Section id="achievements" title="On MyOtherApp">
      {a.eventsAttended ? (
        <p className="pf-stat">
          <Icon name="calendar" size={16} /> Went to <strong>{a.eventsAttended}</strong> {a.eventsAttended === 1 ? "event" : "events"}
        </p>
      ) : null}
      {a.talks?.length ? (
        <>
          <h3 className="pf-h3">Talks</h3>
          <ul className="pf-rows">
            {a.talks.map((t, i) => (
              <li key={`${t.eventName}-${i}`}>
                {t.title ? <span className="pf-row-main">&ldquo;{t.title}&rdquo;</span> : null}
                {t.eventSlug ? (
                  <Link className="pf-row-sub" to={eventPagePath({ slug: t.eventSlug })}>
                    {t.eventName}
                  </Link>
                ) : (
                  <span className="pf-row-sub">{t.eventName}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {a.certificates?.length ? (
        <>
          <h3 className="pf-h3">Certificates</h3>
          <ul className="pf-rows">
            {a.certificates.map((c, i) => (
              <li key={`${c.eventName}-${i}`}>
                <Icon name="award" size={15} />{" "}
                {c.url ? (
                  <a className="pf-row-main" href={c.url} target="_blank" rel={UGC_REL}>
                    {c.eventName}
                  </a>
                ) : (
                  <span className="pf-row-main">{c.eventName}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {a.clubs?.length ? (
        <>
          <h3 className="pf-h3">Clubs</h3>
          <ul className="pf-tags">
            {a.clubs.map((c, i) => (
              <li key={`${c.slug || c.name}-${i}`}>
                {c.slug ? (
                  <Link className="ep-chip" to={clubPagePath(c)}>
                    {c.name}
                  </Link>
                ) : (
                  <span className="ep-chip">{c.name}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Section>
  );
}

export function ProfileView({ profile: p, actions = null }) {
  const first = firstName(p.name);
  const hidden = p.locked ? [] : p.hidden.map((s) => SECTION_NAMES[s]).filter(Boolean);
  return (
    <article className="sp pf" aria-labelledby="pf-title">
      <div className="dc-wrap sp-wrap">
        {p.isMe ? <p className="sp-note pf-me">This is your profile. Edit it in the MyOtherApp app.</p> : null}
        <header className="sp-head">
          <Face name={p.name} src={p.picture} size={128} />
          <div className="sp-intro">
            <h1 id="pf-title" className="sp-name">
              {p.name}
            </h1>
            <p className="pf-handle">@{p.handle}</p>
            {p.headline ? <p className="sp-headline">{p.headline}</p> : null}
            {p.org || p.city ? (
              <p className="sp-facts">
                {p.org ? (
                  <span>
                    <Icon name="users" size={15} /> {p.org.name}
                  </span>
                ) : null}
                {p.city ? (
                  <span>
                    <Icon name="pin" size={15} /> {p.city}
                  </span>
                ) : null}
              </p>
            ) : null}
            {actions ? <div className="sp-actions pf-actions">{actions}</div> : null}
          </div>
        </header>

        {p.locked ? (
          <div className="pf-private">
            <EmptyState title="This profile is private" message={`Only people ${first} has saved to their network can see the rest of it.`} />
          </div>
        ) : (
          <>
            {p.bio ? (
              <Section id="about" title={`About ${first}`}>
                <p className="sp-bio pf-bio">{p.bio}</p>
              </Section>
            ) : null}

            {p.contact.email || p.contact.phone ? (
              <Section id="contact" title="Contact">
                <dl className="pf-contact">
                  {p.contact.email ? (
                    <div>
                      <dt>
                        <Icon name="mail" size={15} /> Email
                      </dt>
                      <dd>{p.contact.email}</dd>
                    </div>
                  ) : null}
                  {p.contact.phone ? (
                    <div>
                      <dt>
                        <Icon name="phone" size={15} /> Phone
                      </dt>
                      <dd>{p.contact.phone}</dd>
                    </div>
                  ) : null}
                </dl>
              </Section>
            ) : null}

            {p.links.length ? <Links links={p.links} name={p.name} /> : null}

            {p.projects.length ? (
              <Section id="projects" title="Projects" count={p.projects.length}>
                <ul className="pf-projects">
                  {p.projects.map((pr, i) => (
                    <Project key={pr.id ?? `i${i}`} project={pr} />
                  ))}
                </ul>
              </Section>
            ) : null}

            {hasAchievements(p.achievements) ? <Achievements a={p.achievements} /> : null}

            {p.interests.length ? (
              <Section id="interests" title="Interests">
                <ul className="pf-tags">
                  {p.interests.map((t, i) => (
                    <li key={t.id ?? `${t.name}-${i}`} className="ep-chip">
                      {t.emoji ? <span aria-hidden="true">{t.emoji}</span> : null}
                      {t.name}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {hidden.length ? (
              <p className="pf-hidden">
                <Icon name="shield" size={15} /> {first} shares their {listOf(hidden)} only with people they know.
              </p>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

/** A profile address nobody answers to (unknown, hidden or blocked): said kindly, with somewhere to go. */
export function ProfileMissing() {
  return (
    <div className="dc-wrap">
      <div className="dc-section">
        <EmptyState as="h1" title="We couldn't find that profile" message="The link may be old, or the profile may not be available.">
          <Link className="dc-btn" to="/events">
            Find events
          </Link>
          <Link className="dc-btn dc-btn--ghost" to="/clubs">
            Browse clubs
          </Link>
        </EmptyState>
      </div>
    </div>
  );
}

/**
 * A scanned QR that doesn't lead to a profile any more:
 *   "inactive"       410 PROFILE_CODE_INACTIVE: its owner made a new code
 *   "scanning-off"   403 PROFILE_SCANNING_OFF: its owner turned saving by QR off
 */
const CODE_PROBLEMS = {
  inactive: {
    title: "This QR code was replaced",
    message: "Its owner made a new code, so this one doesn't open their profile any more. Ask them to show you the new one.",
  },
  "scanning-off": {
    title: "Saving by QR is off",
    message: "This person has turned off saving by QR code for now. Ask them for another way to stay in touch.",
  },
};

export function ProfileCodeProblem({ state }) {
  const said = CODE_PROBLEMS[state] || CODE_PROBLEMS.inactive;
  return (
    <div className="dc-wrap">
      <div className="dc-section">
        <EmptyState as="h1" title={said.title} message={said.message}>
          <Link className="dc-btn" to="/events">
            Find events
          </Link>
        </EmptyState>
      </div>
    </div>
  );
}
