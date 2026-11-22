import { TIER_LABEL, tierOf } from "@/utils/games";

/** A small set of emblems for a hero with no art: the key picks one, a name picks when there is none. */
const EMBLEMS = [
  "M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17l-6.1 3.6 1.4-6.8L2.2 9.1l6.9-.8z",
  "M12 2c3 4 6 6 6 11a6 6 0 0 1-12 0c0-5 3-7 6-11z",
  "M13 2L4 14h6l-1 8 9-12h-6z",
  "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z",
  "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5l3 5-3 5-3-5z",
  "M3 17l4-9 5 6 5-6 4 9z",
];

const pick = (hero) => {
  const seed = hero.emblem || hero.name || "";
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return EMBLEMS[h % EMBLEMS.length];
};

/**
 * One hero card, the same everywhere (reveal, deck, previews): a frame and
 * colour per tier, the art (or an emblem until there is art), name, tagline,
 * and a locked state that hides who it is. `size`: sm | md | lg.
 */
export default function HeroCard({ hero, size = "md", locked = false, burst = false }) {
  const tier = tierOf(hero?.tier);
  if (locked) {
    return (
      <div className={`hc hc--${size} hc--locked hc--${tier}`} role="img" aria-label={`Locked ${TIER_LABEL[tier]} card`}>
        <div className="hc-art" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="hc-lock">
            <path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z" />
          </svg>
        </div>
        <div className="hc-body">
          <span className="hc-tier">{TIER_LABEL[tier]}</span>
          <strong className="hc-name">Locked</strong>
        </div>
      </div>
    );
  }
  return (
    <article className={`hc hc--${size} hc--${tier}${burst ? " hc--burst" : ""}`} aria-label={`${hero.name}, ${TIER_LABEL[tier]} card`}>
      <header className="hc-top">
        <span className="hc-tier">{TIER_LABEL[tier]}</span>
        {hero.number ? <span className="hc-no">#{String(hero.number).padStart(2, "0")}</span> : null}
      </header>
      <div className="hc-art">
        {hero.art ? (
          <img src={hero.art} alt="" loading="lazy" />
        ) : (
          <svg viewBox="0 0 24 24" className="hc-emblem" aria-hidden="true">
            <path d={pick(hero)} />
          </svg>
        )}
      </div>
      <div className="hc-body">
        <strong className="hc-name">{hero.name}</strong>
        {hero.tagline ? <span className="hc-tagline">{hero.tagline}</span> : null}
      </div>
    </article>
  );
}
