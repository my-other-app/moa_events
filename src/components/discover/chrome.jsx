import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { CLUBS_URL, CONTACT_EMAIL, PLAY_STORE_URL } from "@/config";
import { HeaderAccount } from "../auth/account";
import { AppPrompt } from "./bits";
import Icon from "./icons";
import wordmark from "@/assets/wordmark-sm.png";
import "@/styles/discover.css";

/**
 * The bar on top of every public page: the wordmark home, the three ways
 * in (events, clubs, posts), a search that lands on find-events, signing in
 * (when the build has it) and the way to the app.
 */
export function SiteHeader() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [appOpen, setAppOpen] = useState(false);
  const input = useRef(null);
  const inputId = useId();
  const formId = useId();

  useEffect(() => {
    if (searchOpen) input.current?.focus();
  }, [searchOpen]);

  const submit = (e) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/events?q=${encodeURIComponent(term)}` : "/events");
    setSearchOpen(false);
  };

  return (
    <header className="dc-header dc-scope">
      <div className="dc-wrap dc-header-row">
        <Link to="/" className="dc-brand" aria-label="MyOtherApp home">
          <img src={wordmark} alt="MyOtherApp" width="108" height="26" />
        </Link>
        <nav className="dc-nav" aria-label="Discover">
          <NavLink to="/events">Events</NavLink>
          <NavLink to="/clubs">Clubs</NavLink>
          <NavLink to="/threads">Threads</NavLink>
        </nav>
        <form id={formId} className={`dc-header-search${searchOpen ? " is-open" : ""}`} role="search" onSubmit={submit}>
          <div className="dc-searchbox">
            <Icon name="search" size={16} />
            <label className="dc-sr" htmlFor={inputId}>
              Search events
            </label>
            <input ref={input} id={inputId} type="search" placeholder="Search events" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
            <button type="submit">Search</button>
          </div>
        </form>
        <button
          type="button"
          className="dc-header-searchtoggle"
          aria-label={searchOpen ? "Close search" : "Search events"}
          aria-expanded={searchOpen}
          aria-controls={formId}
          onClick={() => setSearchOpen((o) => !o)}
        >
          <Icon name={searchOpen ? "close" : "search"} size={20} />
        </button>
        <div className="dc-header-account">
          <HeaderAccount />
        </div>
        <button type="button" className="dc-btn dc-btn--sm dc-header-app" onClick={() => setAppOpen(true)}>
          Get the app
        </button>
      </div>
      <AppPrompt open={appOpen} onClose={() => setAppOpen(false)} />
    </header>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="dc-footer dc-scope">
      <div className="dc-wrap">
        <div className="dc-footer-grid">
          <div className="dc-footer-brand">
            <img src={wordmark} alt="MyOtherApp" width="100" height="24" />
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
            </ul>
          </nav>
          <nav aria-label="MyOtherApp">
            <h2>MyOtherApp</h2>
            <ul>
              <li>
                <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
                  Get the app
                </a>
              </li>
              <li>
                <a href={CLUBS_URL} target="_blank" rel="noopener noreferrer">
                  For clubs
                </a>
              </li>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
              </li>
            </ul>
          </nav>
        </div>
        <p className="dc-footer-legal">© {year} MyOtherApp. All rights reserved. Times are shown in India Standard Time.</p>
      </div>
    </footer>
  );
}

/** A discovery page: header, the page, footer. A new page starts at the top. */
export function SitePage({ children }) {
  const { pathname } = useLocation();
  useEffect(() => {
    try {
      window.scrollTo(0, 0);
    } catch {
      /* not in a browser */
    }
  }, [pathname]);
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
