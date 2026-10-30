"use client";

import { useEffect, useState } from "react";
import { eventsApi } from "@/api/events";

/*
 * The ticket as the club designed it, drawn by the server.
 *
 * A club designs its ticket in its dashboard (ticket_templates: the logos,
 * the background, the layout). The API renders that design -- the same
 * template, the same payload, the same engine -- for the PDF the email
 * attaches and as a PNG at GET /events/tickets/{id}/image. The app has
 * shown that PNG for a while (lib/features/events/data/ticket_images.dart);
 * this page drew a third ticket of its own from the raw fields, so the same
 * registration looked like two different tickets and a club's design never
 * reached the web.
 *
 * Why a blob and not <img src>: the render is read with the token, exactly
 * as the ticket's details are (the API allows the holder, the owning club
 * or a co-host, and an admin -- a QR is an entry pass, not a public
 * picture). An <img> sends no Authorization header, so the picture is
 * fetched through the API client and shown from an object URL. Anyone who
 * can read the ticket's details can read its picture: one access rule, one
 * token, so this adds no door the page didn't already pass through.
 *
 * Nothing is cached by hand. The answer is `private, max-age=300` with an
 * ETag, so the browser does what the app does for itself: the same ticket
 * opened again is a 304, or nothing at all.
 */

/** An object URL for `blob`, or null where the browser has none (jsdom, an old engine). */
function objectUrlFor(blob) {
  try {
    return typeof URL?.createObjectURL === "function" ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

function revoke(url) {
  try {
    if (url && typeof URL?.revokeObjectURL === "function") URL.revokeObjectURL(url);
  } catch {
    /* nothing to let go of */
  }
}

/**
 * The rendered ticket for `ticketid`: `{state, url}`, where state is
 * "loading", "shown" or "missing".
 *
 * "missing" is every way the render can fail to arrive -- an older server,
 * a render that broke, no connection, or a browser holding no token that
 * may read this ticket -- and the page falls back to the ticket it draws
 * itself. It is never nothing on screen.
 *
 * `skip` is for a ticket that must show no QR at all (the event was called
 * off): the picture carries one, so it is not asked for.
 */
export function useRenderedTicket(ticketid, { skip = false, attempt = 0, load = eventsApi.fetchTicketImage } = {}) {
  const [design, setDesign] = useState({ state: "loading", url: null });

  useEffect(() => {
    if (!ticketid || skip) {
      setDesign({ state: "missing", url: null });
      return undefined;
    }
    let alive = true;
    let made = null;
    setDesign({ state: "loading", url: null });
    Promise.resolve()
      .then(() => load(ticketid))
      .then(
        (blob) => {
          if (!alive) return;
          made = blob ? objectUrlFor(blob) : null;
          setDesign(made ? { state: "shown", url: made } : { state: "missing", url: null });
        },
        () => alive && setDesign({ state: "missing", url: null })
      );
    return () => {
      alive = false;
      revoke(made);
    };
  }, [ticketid, skip, attempt, load]);

  return design;
}
