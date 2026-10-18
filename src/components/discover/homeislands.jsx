"use client";

/**
 * The home page's client islands. The page itself is the same for everyone
 * and statically regenerated (homepage.jsx); these are the parts about the
 * one reading it: where they are (the pill in the search), the events near
 * them, the clubs nearest them, and the search box.
 *
 * <NearYou> asks /api/near once the page is in the browser: with the point
 * the visitor shared ("Use my location", kept in this browser), else with
 * nothing, and the server places them by Vercel's guess from their
 * connection. Sharing or forgetting a location asks again.
 */
import { createContext, useContext, useEffect, useId, useState } from "react";
import { useNavigate } from "@/lib/router";
import { nearParam, parseClub, parseEvent, parseWhere } from "@/api/parse";
import { useWhere } from "@/utils/where";
import { Section } from "./bits";
import { ClubCard } from "./clubcard";
import { EventRail, EventRailSkeleton } from "./eventcard";
import { LocationPill } from "./locationpill";
import Icon from "./icons";

const RAIL = 8;
const NearContext = createContext(null);

const list = (v, fn) => (Array.isArray(v) ? v.map(fn).filter(Boolean) : []);

/** The address /api/near is asked at: with the shared point, or bare for a guess. */
export const nearUrl = (point) => (point ? `/api/near?lat=${encodeURIComponent(point.lat)}&lng=${encodeURIComponent(point.lng)}` : "/api/near");

/** {status: "loading" | "ready" | "error", where, near, clubs} for the visitor, and their stored point. */
export function NearYou({ children }) {
  const [stored, setStored] = useWhere();
  const [state, setState] = useState({ status: "loading", where: null, near: [], clubs: [] });
  const lat = stored?.lat ?? null;
  const lng = stored?.lng ?? null;
  const known = stored !== undefined;

  useEffect(() => {
    // While the page hydrates, the stored point isn't read yet: wait for it rather than ask twice.
    if (!known) return undefined;
    let alive = true;
    setState((s) => ({ ...s, status: "loading" }));
    fetch(nearUrl(lat !== null ? { lat, lng } : null), { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`near: ${r.status}`))))
      .then(
        (d) => alive && setState({ status: "ready", where: parseWhere(d?.where), near: list(d?.near, parseEvent), clubs: list(d?.clubs, parseClub) }),
        () => alive && setState({ status: "error", where: null, near: [], clubs: [] })
      );
    return () => {
      alive = false;
    };
  }, [known, lat, lng]);

  return <NearContext.Provider value={{ ...state, stored, setStored }}>{children}</NearContext.Provider>;
}

const useNear = () => useContext(NearContext);

const placed = (where) => Boolean(where && where.lat !== null && where.lng !== null && where.source !== "none");

/** "Events near Pune": a skeleton while the visitor is being placed, then their events, or nothing. */
export function NearEvents() {
  const near = useNear();
  if (near.status === "loading") {
    return (
      <section className="dc-section" aria-busy="true" aria-label="Finding events near you">
        <div className="dc-section-head">
          <div className="dc-skel" style={{ width: 220, height: 30 }} />
        </div>
        <EventRailSkeleton />
      </section>
    );
  }
  if (!near.near.length || !placed(near.where)) return null;
  const city = near.where.city;
  return (
    <Section id="near" title={`Events near ${city || "you"}`} seeAll={`/events?sort=distance&near=${encodeURIComponent(nearParam(near.where))}`}>
      <EventRail events={near.near} limit={RAIL} />
    </Section>
  );
}

/**
 * The clubs: the most followed (the server's, for everyone) until the
 * visitor is placed, then the ones nearest them — when any of those has a
 * distance at all (clubs without a place can't be near anyone).
 */
export function NearClubs({ clubs }) {
  const near = useNear();
  const local = near.status === "ready" && placed(near.where) && near.clubs.some((c) => c.distance_km !== null) ? near.clubs : null;
  const shown = local || clubs;
  if (!shown.length) return null;
  return (
    <Section id="clubs" title={local ? `Clubs near ${near.where.city || "you"}` : "Popular clubs"} seeAll="/clubs">
      <div className="dc-rail dc-rail--cards dc-rail--clip">
        {shown.slice(0, RAIL).map((c) => (
          <ClubCard key={c.slug || c.id} club={c} />
        ))}
      </div>
    </Section>
  );
}

/** The hero's search: what (words) and where (the visitor's place, changeable). */
export function HeroSearch() {
  const near = useNear();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const searchId = useId();

  const search = (e) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/events?q=${encodeURIComponent(term)}` : "/events");
  };

  return (
    <form className="dc-hero2-search" role="search" onSubmit={search}>
      <div className="dc-hero2-field dc-hero2-what">
        <Icon name="search" size={20} />
        <label className="dc-sr" htmlFor={searchId}>
          Search events
        </label>
        <input id={searchId} type="search" placeholder="Search events or topics" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" autoComplete="off" />
      </div>
      <div className="dc-hero2-field dc-hero2-where">
        <LocationPill className="dc-where--bare" where={near.where} stored={near.stored} onChange={near.setStored} />
      </div>
      <button type="submit" className="dc-btn dc-hero2-go">
        <Icon name="search" size={18} />
        <span>Search</span>
      </button>
    </form>
  );
}
