import "server-only";
import { cache } from "react";
import { parseShareRow } from "@/utils/share";
import { apiGet } from "./api";
import { TAGS } from "./discover";

/**
 * The attendees' share row for an event's page (GET /api/v1/events/{id}/share,
 * feature-register/social-posting-contract.md), read on the server with the
 * page and kept as long (a minute, tagged with the event): the same links
 * for everyone, each platform's own tracking link.
 *
 * Never throws and never holds the page up for long: an API without the
 * route (404), an event without a row, a slow or failing answer — all are
 * null, and the page has no row.
 */
const EVENT_ID = /^\d{1,12}$/;

export const getShareRow = cache(async (eventId, ref = null) => {
  if (!EVENT_ID.test(String(eventId ?? ""))) return null;
  try {
    const { data } = await apiGet(`/api/v1/events/${eventId}/share`, { revalidate: 60, tags: [TAGS.event(ref || String(eventId))], timeoutMs: 3000 });
    const row = data ? parseShareRow(data) : null;
    return row && row.length ? row : null;
  } catch {
    return null;
  }
});
