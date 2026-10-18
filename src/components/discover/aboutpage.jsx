import { useEffect, useState } from "react";
import { Link } from "@/lib/router";
import { discoverApi } from "@/api/discover";
import { CONTACT_EMAIL } from "@/config";
import { ABOUT } from "@/content/about";
import { formatCount } from "@/utils/format";
import { usePageSeo } from "@/utils/meta";
import { SitePage } from "./chrome";
import { StoreButtons } from "./bits";
import Icon from "./icons";
import logoIcon from "@/assets/logo-icon.png";
import { assetSrc } from "@/utils/asset";

/** The numbers on the front page, live: upcoming events, clubs, cities. Each shows only when there is one. */
function LiveNumbers({ stats }) {
  if (stats === null) {
    return (
      <div className="dc-about-live" aria-busy="true">
        <span className="dc-skel" style={{ width: "70%", height: 56 }} />
        <span className="dc-skel" style={{ width: "50%", height: 56 }} />
        <span className="dc-skel" style={{ width: "40%", height: 56 }} />
      </div>
    );
  }
  // As on the front page: a single city is not worth a number.
  const rows = [
    [stats?.upcoming_events, "upcoming event", "upcoming events", 0],
    [stats?.clubs, "club", "clubs", 0],
    [stats?.cities, "city", "cities", 1],
  ].filter(([n, , , floor]) => n > floor);
  if (!rows.length) {
    return (
      <div className="dc-about-live dc-about-live--mark" aria-hidden="true">
        <img src={assetSrc(logoIcon)} alt="" width="96" height="96" />
      </div>
    );
  }
  return (
    <div className="dc-about-live">
      <p className="dc-about-live-label">
        <span className="dc-hero2-livedot" aria-hidden="true" /> On MyOtherApp right now
      </p>
      <ul>
        {rows.map(([n, one, many]) => (
          <li key={one}>
            <strong>{formatCount(n)}</strong> {n === 1 ? one : many}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Feature({ icon, title, text }) {
  return (
    <li className="dc-feature">
      <span className="dc-feature-icon" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </li>
  );
}

/**
 * About MyOtherApp: what it is, what it does for students and for clubs,
 * how an event goes from a club's dashboard to the door, the live numbers,
 * and how to reach us. Nothing here that the product doesn't do today.
 */
export default function AboutPage() {
  usePageSeo({ title: ABOUT.title, description: ABOUT.description, path: ABOUT.path, noindex: false });
  // null while loading; false when the numbers couldn't be had (the page shows the mark instead).
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    discoverApi.home().then(
      (d) => alive && setStats(d.stats || false),
      () => alive && setStats(false)
    );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <SitePage>
      <div className="dc-wrap">
        <section className="dc-about-hero" aria-labelledby="dc-about-title">
          <div className="dc-about-hero-copy">
            <p className="dc-eyebrow">About MyOtherApp</p>
            <h1 id="dc-about-title">
              Where student clubs run their events — <span className="dc-hl">and students find them.</span>
            </h1>
            <p className="dc-about-lede">{ABOUT.lede}</p>
            <div className="dc-about-ctas">
              <Link className="dc-btn" to="/events">
                Find events
              </Link>
              <Link className="dc-btn dc-btn--ghost" to="/for-clubs">
                For clubs <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </div>
          <LiveNumbers stats={stats || (stats === false ? {} : null)} />
        </section>

        <section className="dc-about-block" aria-labelledby="dc-about-students">
          <div className="dc-about-blockhead">
            <p className="dc-eyebrow">For students</p>
            <h2 id="dc-about-students">Find it, get in, keep the certificate.</h2>
          </div>
          <ul className="dc-features">
            {ABOUT.students.map((f) => (
              <Feature key={f.title} {...f} />
            ))}
          </ul>
        </section>

        <section className="dc-about-clubs" aria-labelledby="dc-about-clubs">
          <div className="dc-about-blockhead">
            <p className="dc-eyebrow">For clubs</p>
            <h2 id="dc-about-clubs">
              Run every event from <em>one dashboard.</em>
            </h2>
            <p>Plan it, sell it, check people in and send the certificates — then see how it went.</p>
          </div>
          <ul className="dc-features dc-features--dark">
            {ABOUT.clubs.map((f) => (
              <Feature key={f.title} {...f} />
            ))}
          </ul>
          <div className="dc-about-clubs-cta">
            <Link className="dc-btn dc-btn--accent" to="/for-clubs">
              See everything clubs get <Icon name="arrowRight" size={16} />
            </Link>
            <Link className="dc-about-clubs-pricing" to="/pricing">
              Plans and pricing
            </Link>
          </div>
        </section>

        <section className="dc-about-block" aria-labelledby="dc-about-how">
          <div className="dc-about-blockhead">
            <p className="dc-eyebrow">How it works</p>
            <h2 id="dc-about-how">From a club&rsquo;s dashboard to the door, in three steps.</h2>
          </div>
          <ol className="dc-steps">
            {ABOUT.steps.map((s, i) => (
              <li key={s.title} className="dc-step">
                <span className="dc-step-num" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="dc-about-end" aria-label="Contact and the app">
          <div className="dc-about-card">
            <span className="dc-feature-icon" aria-hidden="true">
              <Icon name="mail" size={20} />
            </span>
            <h2>Get in touch</h2>
            <p>Questions, feedback, or a club you&rsquo;d like to bring on? Write to us.</p>
            <a className="dc-link dc-about-mail" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          </div>
          <div className="dc-about-card dc-about-card--app">
            <span className="dc-feature-icon" aria-hidden="true">
              <Icon name="phone" size={20} />
            </span>
            <h2>Get the app</h2>
            <p>Your tickets, the clubs you follow and their threads, in your pocket.</p>
            <StoreButtons />
          </div>
        </section>
      </div>
    </SitePage>
  );
}
