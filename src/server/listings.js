import "server-only";
import { cache } from "react";
import { ANYWHERE, PAGE_SIZE } from "@/api/parse";
import { clubsPageState, eventsPageState } from "@/seo/listings";
import { stableCard, stableClubCard, stablePage } from "@/seo/stabilize";
import { getClubs, getEvents } from "./discover";

/**
 * The find pages' first page of results, read for one visitor (these pages
 * are rendered per request: their address is their content). Keyed by the
 * page's query string and the visitor's address, so the page and its
 * metadata read once.
 *
 * A list about no place (no ?near=) is every event or club, by date or
 * popularity, the same for everyone: the API is asked for "anywhere" and
 * whatever distances it adds (it may place the visitor by their address)
 * are dropped, so the HTML depends on the address alone.
 */

const placeless = (page) => ({ ...page, items: page.items.map((i) => (i.distance_km === null ? i : { ...i, distance_km: null })) });

export const listEvents = cache(async (search, ip = null) => {
  const state = eventsPageState(new URLSearchParams(search));
  // The calendar reads its month in the browser; the server needs only the categories and the place.
  const filters = state.calendar ? { ...state.filters, when: "", from: "", to: "", sort: "" } : state.filters;
  const page = await getEvents(filters, { where: state.near || ANYWHERE, visitor: { ip }, limit: state.calendar ? 1 : PAGE_SIZE });
  return { state, page: stablePage(state.near ? page : placeless(page), stableCard) };
});

export const listClubs = cache(async (search, ip = null) => {
  const state = clubsPageState(new URLSearchParams(search));
  const page = await getClubs(state.filters, { where: state.near || ANYWHERE, visitor: { ip }, limit: PAGE_SIZE });
  return { state, page: stablePage(state.near ? page : placeless(page), stableClubCard) };
});
