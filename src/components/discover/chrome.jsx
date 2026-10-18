import { Link } from "@/lib/router";
import { APP_STORE_URL, CONTACT_EMAIL, PLAY_STORE_URL } from "@/config";
import { assetSrc } from "@/utils/asset";
import { feeds } from "@/seo/urls";
import Icon from "./icons";
import { SiteHeader } from "./header";
import { AppleGlyph, PlayGlyph } from "./stores";
import wordmark from "@/assets/wordmark-sm.png";

/*
 * The frame of every public page. The header is interactive (search, the
 * account menu, "Get the app") and lives in header.jsx; the footer and the
 * frame itself render on the server.
 */
export { SiteHeader };

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="dc-footer dc-scope">
      <div className="dc-wrap">
        <div className="dc-footer-grid">
          <div className="dc-footer-brand">
            <img src={assetSrc(wordmark)} alt="MyOtherApp" width="100" height="24" />
            <p>Events and clubs near you — hackathons, workshops, meetups and more, run by the clubs on MyOtherApp.</p>
          </div>
          <nav aria-label="Discover more">
            <h2>Discover</h2>
            <ul>
              <li>
                <Link to="/events?sort=distance">Events near you</Link>
              </li>
              <li>
                <Link to="/events?type=online">Online events</Link>
              </li>
              <li>
                <Link to="/clubs">Clubs</Link>
              </li>
              <li>
                <Link to="/threads">Threads</Link>
              </li>
              <li>
                <a className="dc-footer-feed" href={feeds.events()} type="application/rss+xml">
                  <Icon name="rss" size={14} /> Events feed (RSS)
                </a>
              </li>
            </ul>
          </nav>
          <nav aria-label="MyOtherApp">
            <h2>MyOtherApp</h2>
            <ul>
              <li>
                <Link to="/about">About</Link>
              </li>
              <li>
                <Link to="/for-clubs">For clubs</Link>
              </li>
              <li>
                <Link to="/pricing">Pricing</Link>
              </li>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
              </li>
            </ul>
          </nav>
          <nav aria-label="Get the app">
            <h2>Get the app</h2>
            <ul className="dc-footer-apps">
              <li>
                <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
                  <PlayGlyph /> Android app
                </a>
              </li>
              <li>
                {APP_STORE_URL ? (
                  <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
                    <AppleGlyph /> iPhone app
                  </a>
                ) : (
                  <span className="is-soon">
                    <AppleGlyph />
                    <span>
                      iPhone app <small>Coming soon</small>
                    </span>
                  </span>
                )}
              </li>
            </ul>
          </nav>
          <nav aria-label="Legal">
            <h2>Legal</h2>
            <ul>
              <li>
                <Link to="/privacy">Privacy</Link>
              </li>
              <li>
                <Link to="/terms">Terms</Link>
              </li>
            </ul>
          </nav>
        </div>
        <p className="dc-footer-legal">© {year} MyOtherApp. All rights reserved. Times are shown in India Standard Time.</p>
      </div>
    </footer>
  );
}

/**
 * A discovery page: header, the page, footer. (Next scrolls a new page to
 * the top on navigation, as the old SPA did here by hand.)
 */
export function SitePage({ children }) {
  return (
    <div className="dc-page dc-scope">
      <a className="dc-skip" href="#dc-main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="dc-main" className="dc-main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
