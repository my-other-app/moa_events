/**
 * Server-rendered pages are cached (ISR) and crawled, and the API's images
 * are presigned links that die within the hour. Before a page renders,
 * every image in its data is swapped for the site's stable address for it
 * (/media/..., see ./urls.js); the components render whatever address they
 * are given, so they need no change. A missing image stays missing (null),
 * so the drawn covers and initials still show.
 *
 * Sizes keep working: a poster becomes {thumbnail, medium, large, original},
 * each a /media link with ?size=, and imageUrl(poster, size) picks as before.
 */
import { eventRefOf, media } from "./urls";

const sizes = (make) => ({ thumbnail: make("thumbnail"), medium: make("medium"), large: make("large"), original: make("original") });

/** A club as an event card (or a post) carries it. */
export function stableClubRef(club) {
  if (!club) return club;
  // Without a slug there is no stable address to give: the initials show instead.
  return { ...club, logo: club.logo && club.slug ? sizes((s) => media.clubLogo(club.slug, s)) : null };
}

/** The clubs co-hosting an event, when it has any: each logo on its club's stable address. */
const stableCohosts = (x) => (Array.isArray(x.cohosts) ? { cohosts: x.cohosts.map(stableClubRef) } : {});

/** An event card: its poster, its club's logo and its co-hosts'. */
export function stableCard(card) {
  if (!card) return card;
  const ref = eventRefOf(card);
  return {
    ...card,
    poster: card.poster && ref ? sizes((s) => media.eventPoster(ref, s)) : null,
    club: card.club ? stableClubRef(card.club) : card.club,
    ...stableCohosts(card),
  };
}

/** A club's post: its picture and the club's logo. */
export function stableThread(thread) {
  if (!thread) return thread;
  return {
    ...thread,
    image: thread.image ? sizes((s) => media.threadImage(thread.id, s)) : null,
    club: stableClubRef(thread.club),
  };
}

/** parseEventPage's result, with every image on a stable address. */
export function stableEventPage(page) {
  if (!page) return page;
  const ref = eventRefOf(page.event);
  return {
    ...page,
    event: {
      ...page.event,
      poster: page.event.poster ? sizes((s) => media.eventPoster(ref, s)) : null,
      poster_thumb: page.event.poster_thumb ? media.eventPoster(ref, "medium") : null,
      // Only /media reads it (posterOf), from the page before this.
      poster_large: null,
    },
    club: page.club
      ? {
          ...page.club,
          logo: page.club.logo && page.club.slug ? sizes((s) => media.clubLogo(page.club.slug, s)) : null,
          cover: page.club.cover && page.club.slug ? sizes((s) => media.clubCover(page.club.slug, s)) : null,
        }
      : null,
    speakers: page.speakers.map((s, i) => ({ ...s, photo: s.photo ? media.eventSpeaker(ref, s.id ?? `i${i}`) : null })),
    team: page.team.map((p, i) => ({ ...p, photo: p.photo ? media.eventTeam(ref, i) : null })),
    sponsors: (page.sponsors || []).map((b, i) => ({ ...b, logo: b.logo ? media.eventBacker(ref, "sponsor", b.id ?? `i${i}`) : null })),
    partners: (page.partners || []).map((b, i) => ({ ...b, logo: b.logo ? media.eventBacker(ref, "partner", b.id ?? `i${i}`) : null })),
    more_from_club: page.more_from_club.map(stableCard),
    similar: page.similar.map(stableCard),
    ...stableCohosts(page),
  };
}

/** parseClubPage's result, with every image on a stable address. */
export function stableClubPage(data) {
  if (!data) return data;
  const slug = data.club.slug;
  return {
    ...data,
    club: {
      ...data.club,
      logo: data.club.logo && slug ? sizes((s) => media.clubLogo(slug, s)) : null,
      cover: data.club.cover && slug ? sizes((s) => media.clubCover(slug, s)) : null,
    },
    upcoming: data.upcoming.map(stableCard),
    past: data.past.map(stableCard),
    threads: data.threads.map(stableThread),
    team: data.team.map((p, i) => ({ ...p, photo: p.photo && slug ? media.clubTeam(slug, i) : null })),
    partners: data.partners.map((p, i) => ({ ...p, logo: p.logo && slug ? media.clubPartner(slug, i) : null })),
  };
}

/** A club in a list (a card): its logo and its cover. */
export function stableClubCard(club) {
  if (!club) return club;
  const slug = club.slug;
  return {
    ...club,
    logo: club.logo && slug ? sizes((s) => media.clubLogo(slug, s)) : null,
    cover: club.cover && slug ? sizes((s) => media.clubCover(slug, s)) : null,
  };
}

/** parseHome's result, with every image on a stable address. */
export function stableHome(home) {
  if (!home) return home;
  return {
    ...home,
    near: home.near.map(stableCard),
    this_week: home.this_week.map(stableCard),
    online: home.online.map(stableCard),
    popular: home.popular.map(stableCard),
    clubs: home.clubs.map(stableClubCard),
    clubs_more: (home.clubs_more || []).map(stableClubCard),
    threads: home.threads.map(stableThread),
  };
}

/** A page of a list ({items, ...}) with each item made stable by `fn`. */
export const stablePage = (page, fn) => (page ? { ...page, items: page.items.map(fn) } : page);
