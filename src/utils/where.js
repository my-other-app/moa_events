import { useCallback, useEffect, useState } from "react";

/**
 * Where the visitor is, for "near you". Nothing is stored until they ask
 * for it: until then the API guesses from the connection (the `where` it
 * sends back says so). "Use my location" asks the browser once and keeps
 * the point — rounded to about a hundred metres — in this browser only.
 */
export const WHERE_KEY = "moa.where";
const EVENT = "moa:where";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v) => Math.round(v * 1000) / 1000;

export function readWhere() {
  try {
    const raw = JSON.parse(localStorage.getItem(WHERE_KEY));
    const lat = num(raw?.lat);
    const lng = num(raw?.lng);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng, city: typeof raw.city === "string" ? raw.city : null };
  } catch {
    return null;
  }
}

function announce() {
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* no window */
  }
}

export function saveWhere({ lat, lng, city = null }) {
  try {
    localStorage.setItem(WHERE_KEY, JSON.stringify({ lat: round(lat), lng: round(lng), city }));
  } catch {
    /* private mode: the choice lasts this page only */
  }
  announce();
}

export function clearWhere() {
  try {
    localStorage.removeItem(WHERE_KEY);
  } catch {
    /* private mode */
  }
  announce();
}

/** What the location pill says: the city the API placed us in, or as close as we can get. */
export function whereLabel(where, stored) {
  if (where?.city) return `Near ${where.city}`;
  if (stored || where?.source === "browser") return "Near you";
  return "Anywhere";
}

/** Asks the browser where it is. Resolves {lat, lng}; rejects with a line to show. */
export function locateBrowser({ timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const geo = typeof navigator !== "undefined" ? navigator.geolocation : null;
    if (!geo) {
      reject(new Error("This browser cannot share a location."));
      return;
    }
    geo.getCurrentPosition(
      (pos) => resolve({ lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) }),
      (err) =>
        reject(
          new Error(
            err && err.code === 1
              ? "Location is blocked for this site, so we kept the area we guessed."
              : "We could not get your location, so we kept the area we guessed."
          )
        ),
      { enableHighAccuracy: false, timeout, maximumAge: 10 * 60 * 1000 }
    );
  });
}

/**
 * The stored point and a setter; every page using it hears a change made
 * anywhere (another tab included). `null` means "let the server guess".
 */
export function useWhere() {
  const [where, setWhere] = useState(readWhere);
  useEffect(() => {
    const sync = () => setWhere(readWhere());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = useCallback((next) => (next ? saveWhere(next) : clearWhere()), []);
  return [where, update];
}
