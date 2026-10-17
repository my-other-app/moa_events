import { useEffect, useState } from "react";
import { discoverApi } from "@/api/discover";
import { CLUBS_URL, SITE_URL } from "@/config";
import { FOR_CLUBS } from "@/content/forclubs";
import { formatCount } from "@/utils/format";
import { useJsonLd, usePageSeo } from "@/utils/meta";
import { usePlans } from "@/utils/plans";
import { cheapestPaid, formatMoney, loginUrl, plansJsonLd, signupUrl, yearlyOffer } from "@/utils/pricing";
import { SitePage } from "./chrome";
import { Avatar } from "./bits";
import { ClubFaq, ClubsCta } from "./clubsparts";
import { HeroFan, PhaseArt } from "./forclubsart";
import { Pricing } from "./pricing";
import Icon from "./icons";
import "@/styles/discover.css";
import "@/styles/cards-hero.css";
import "@/styles/pages.css";
import "@/styles/forclubs.css";

/** Where "Start free" goes: the dashboard's sign-up, on the Free plan. */
const START_FREE_URL = signupUrl(CLUBS_URL, "free", "monthly");

/** The facts under the buttons, from the plans themselves: a free plan, the lowest price, the trial. */
function PlanFacts({ data }) {
  if (!data) return null;
  const facts = [];
  if (data.plans.some((p) => p.monthly === 0 && !p.contactSales)) facts.push("A free plan to start on");
  const from = cheapestPaid(data);
  if (from) facts.push(`Paid plans from ${formatMoney(from, data.currency)} a month`);
  const trial = data.plans.find((p) => p.featured && p.trialDays > 0) || data.plans.find((p) => p.trialDays > 0 && p.monthly > 0);
  if (trial) facts.push(`Try ${trial.name} free for ${trial.trialDays} days`);
  if (!facts.length) return null;
  return (
    <ul className="fc-facts">
      {facts.map((f) => (
        <li key={f}>
          <Icon name="check" size={16} />
          {f}
        </li>
      ))}
    </ul>
  );
}

/** The live numbers from the front page, with a few of the clubs' faces; nothing when there are none. */
function LiveStats({ home }) {
  const stats = home?.stats;
  if (!stats || !(stats.upcoming_events > 0 || stats.clubs > 0)) return null;
  const faces = (home.clubs || []).filter((c) => c.logo).slice(0, 4);
  return (
    <p className="dc-hero2-stats fc-live">
      {faces.length ? (
        <span className="dc-hero2-faces" aria-hidden="true">
          {faces.map((c) => (
            <Avatar key={c.slug || c.id} name={c.name} src={c.logo} size={30} />
          ))}
        </span>
      ) : null}
      {stats.clubs > 0 ? (
        <span className="dc-hero2-stat">
          <strong>{formatCount(stats.clubs)}</strong> {stats.clubs === 1 ? "club" : "clubs"}
        </span>
      ) : null}
      {stats.upcoming_events > 0 ? (
        <span className="dc-hero2-stat">
          <strong>{formatCount(stats.upcoming_events)}</strong> upcoming {stats.upcoming_events === 1 ? "event" : "events"}
        </span>
      ) : null}
      <span className="fc-live-label">
        <span className="dc-hero2-livedot" aria-hidden="true" /> on MyOtherApp right now
      </span>
    </p>
  );
}

function Phase({ phase, index }) {
  const titleId = `fc-${phase.id}-title`;
  const cls = ["fc-phase", phase.dark ? "fc-phase--dark" : "", index % 2 ? "fc-phase--flip" : ""].filter(Boolean).join(" ");
  return (
    <section id={phase.id} className={cls} aria-labelledby={titleId}>
      <div className="fc-phase-head">
        <div className="fc-phase-copy">
          <p className="fc-phase-when">
            <span className="fc-phase-num" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            {phase.when}
          </p>
          <h2 id={titleId}>{phase.title}</h2>
          <p className="fc-phase-lede">{phase.lede}</p>
        </div>
        <PhaseArt name={phase.art} />
      </div>
      <ul className={`fc-feats fc-feats--${phase.features.length}`}>
        {phase.features.map((f) => (
          <li key={f.title} className="fc-feat">
            <span className="dc-feature-icon" aria-hidden="true">
              <Icon name={f.icon} size={20} />
            </span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
            {f.points?.length ? (
              <ul className="fc-feat-points">
                {f.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * MyOtherApp for clubs: what the dashboard does for a club before, during
 * and after an event and in between, how a club gets on, the plans, the
 * questions organisers ask, and the way in. Every "Start free" and "Log in"
 * goes to the clubs dashboard; nothing here signs anyone up itself.
 */
export default function ForClubsPage() {
  usePageSeo({ title: FOR_CLUBS.title, description: FOR_CLUBS.description, path: FOR_CLUBS.path });
  const plans = usePlans();
  useJsonLd(plans.data ? plansJsonLd(plans.data, { url: `${SITE_URL}${FOR_CLUBS.path}`, siteUrl: SITE_URL, description: FOR_CLUBS.description }) : null);
  const [home, setHome] = useState(null);

  useEffect(() => {
    let alive = true;
    discoverApi.home().then(
      (d) => alive && setHome(d),
      () => {}
    );
    return () => {
      alive = false;
    };
  }, []);

  const offer = yearlyOffer(plans.data?.yearlyMonthsFree);

  return (
    <SitePage>
      <div className="dc-wrap">
        <section className="dc-hero2 fc-hero" aria-labelledby="fc-title">
          <div className="dc-hero2-copy">
            <p className="fc-kicker">
              <Icon name="users" size={15} /> MyOtherApp for clubs
            </p>
            <h1 id="fc-title" className="dc-hero2-title fc-hero-title">
              <span>Run your club&rsquo;s events</span> <span className="dc-hl">from one place.</span>
            </h1>
            <p className="dc-hero2-lede">{FOR_CLUBS.lede}</p>
            <div className="fc-hero-ctas">
              <a className="dc-btn fc-btn-lg" href={START_FREE_URL}>
                Start free <Icon name="arrowRight" size={18} />
              </a>
              <a className="dc-btn dc-btn--ghost fc-btn-lg" href="#pricing">
                See pricing
              </a>
            </div>
            <p className="fc-hero-login">
              Already run a club here?{" "}
              <a className="dc-link" href={loginUrl(CLUBS_URL)}>
                Log in
              </a>
            </p>
            <PlanFacts data={plans.data} />
            <LiveStats home={home} />
          </div>
          <HeroFan />
        </section>
      </div>

      <section className="fc-strip" aria-label="What's in the clubs dashboard">
        <ul>
          {FOR_CLUBS.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </section>

      <div className="dc-wrap">
        <div className="fc-intro">
          <p className="dc-eyebrow">What you get</p>
          <h2>
            From the first sign-up to <span className="dc-hl">the last certificate.</span>
          </h2>
          <p>One dashboard for the whole life of an event — and for your club in between.</p>
        </div>

        {FOR_CLUBS.phases.map((phase, i) => (
          <Phase key={phase.id} phase={phase} index={i} />
        ))}

        <section className="dc-about-block fc-how" aria-labelledby="fc-how-title">
          <div className="dc-about-blockhead">
            <p className="dc-eyebrow">How it works</p>
            <h2 id="fc-how-title">Apply, get verified, go live.</h2>
          </div>
          <ol className="dc-steps">
            {FOR_CLUBS.steps.map((s, i) => (
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

        <section id="pricing" className="fc-pricing" aria-labelledby="fc-pricing-title">
          <div className="fc-center-head">
            <p className="dc-eyebrow">Pricing</p>
            <h2 id="fc-pricing-title">Plans that grow with your club</h2>
            <p>Start free, and move up when your events do.{offer ? ` Pay yearly and get ${offer}.` : ""}</p>
          </div>
          <Pricing plans={plans} compare="link" />
        </section>

        <ClubFaq yearlyMonthsFree={plans.data?.yearlyMonthsFree ?? null} />
        <ClubsCta />
      </div>
    </SitePage>
  );
}
