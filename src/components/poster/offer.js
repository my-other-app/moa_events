"use client";

import { useEffect, useState } from "react";
import { postersApi } from "@/api/posters";

/**
 * Whether a ticket has a poster to make: `{phrase, made}` when the API says
 * so (GET /posters/{ticket} with `available: true`), else null -- posters
 * off, not open yet, the ticket not sent or no longer good, an API without
 * posters, no connection, a browser that may not read the ticket. Null
 * until it has answered, so the button never flashes in and out.
 *
 * `made`: a photo is in, or a format is already drawn ("Your poster"
 * rather than "Make your poster").
 */
export function usePosterOffer(ticketid, { skip = false, load = postersApi.availability } = {}) {
  const [offer, setOffer] = useState(null);
  useEffect(() => {
    if (!ticketid || skip) {
      setOffer(null);
      return undefined;
    }
    let alive = true;
    Promise.resolve()
      .then(() => load(ticketid))
      .then(
        (p) => {
          if (!alive) return;
          setOffer(p?.available ? { phrase: p.moment?.phrase || null, made: Boolean(p.photo) || p.formats.some((f) => f.render.status === "ready") } : null);
        },
        () => alive && setOffer(null),
      );
    return () => {
      alive = false;
    };
  }, [ticketid, skip, load]);
  return offer;
}
