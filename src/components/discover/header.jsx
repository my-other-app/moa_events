"use client";

import { Suspense, lazy, useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, useNavigate, usePathname } from "@/lib/router";
import { assetSrc } from "@/utils/asset";
import { HeaderAccount } from "../auth/account";
import Icon from "./icons";
import wordmark from "@/assets/wordmark-sm.png";

// "Get the app" opens a dialog: its code comes the first time it is opened.
const AppPrompt = lazy(() => import("./dialog").then((m) => ({ default: m.AppPrompt })));

/**
 * The bar on top of every public page: the wordmark home, the three ways
 * in (events, clubs, posts) and the page for clubs that run events, a
 * search that lands on find-events, signing in (when the build has it) and
 * the way to the app.
 */
export function SiteHeader() {
  const navigate = useNavigate();
  const pathname = usePathname();
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
          <img src={assetSrc(wordmark)} alt="MyOtherApp" width="108" height="26" />
        </Link>
        <nav className="dc-nav" aria-label="Discover">
          <NavLink to="/events">Events</NavLink>
          <NavLink to="/clubs">Clubs</NavLink>
          <NavLink to="/threads">Threads</NavLink>
          {/* The clubs' page and its pricing are one place to a visitor. */}
          <NavLink to="/for-clubs" className={({ isActive }) => (isActive || pathname === "/pricing" ? "active dc-nav-clubs" : "dc-nav-clubs")}>
            For clubs
          </NavLink>
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
      {appOpen ? (
        <Suspense fallback={null}>
          <AppPrompt open onClose={() => setAppOpen(false)} />
        </Suspense>
      ) : null}
    </header>
  );
}
