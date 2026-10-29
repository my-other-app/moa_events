"use client";

/*
 * The footer of every public page. A client component on purpose: it is the
 * same on every page, so the browser keeps its code once instead of every
 * page sending its whole markup twice (as HTML and as data).
 */
import { Link } from "@/lib/router";
import { APP_STORE_URL, CONTACT_EMAIL, PLAY_STORE_URL } from "@/config";
import { assetSrc } from "@/utils/asset";
import { feeds } from "@/seo/urls";
import Icon from "./icons";
import { AppleGlyph, PlayGlyph } from "./stores";
import { useTopicsNav } from "./topicsnav";
import wordmark from "@/assets/wordmark-sm.png";

export function SiteFooter() {
  const year = new Date().getFullYear();
  // "Topics" only once the site has them (the header has no room for a fifth link).
  const topics = useTopicsNav();
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
                <Link to="/events/in">Events by city</Link>
              </li>
              {topics ? (
                <li>
                  <Link to="/topics">Topics</Link>
                </li>
              ) : null}
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
                <Link to="/verify">Verify a certificate</Link>
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
          <nav aria-label="Help and legal">
            <h2>Help &amp; legal</h2>
            <ul>
              <li>
                <Link to="/support">Support</Link>
              </li>
              <li>
                <Link to="/privacy">Privacy</Link>
              </li>
              <li>
                <Link to="/terms">Terms</Link>
              </li>
            </ul>
          </nav>
        </div>
        <p className="dc-footer-legal" suppressHydrationWarning>© {year} MyOtherApp. All rights reserved. Times are shown in India Standard Time.</p>
      </div>
    </footer>
  );
}
