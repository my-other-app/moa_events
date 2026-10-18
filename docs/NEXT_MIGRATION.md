# The site on Next.js: what is where, and how to port the rest

The public site moved from a Vite single-page app to Next.js 16 (App Router). Step 1 (this branch) built the foundation and server-rendered the pages search engines care most about: every event and every club. Every other page still renders in the browser exactly as before, at the same address. This document is the map, and the one pattern for porting the rest.

## How it fits together

```
src/app/                    routes (Next's file routing)
  layout.jsx                <html>, fonts (next/font), every stylesheet once, <Providers> (sign-in, ?ref=)
  _client/pages.jsx         ClientPage: the not-yet-ported pages, mounted in the browser (ssr: false)
  _client/event-scoped.js   the server half of /events/{slug}/register|live|compete
  _tests/                   route-level tests (private folder: not a route)
src/server/                 server-only: reading the API (api.js, discover.js), old addresses, feeds, the bots' preview page
src/seo/                    pure: addresses, metadata, JSON-LD, stable media, sitemap, robots, RSS, validators
src/og/                     the share pictures (next/og): layouts, fonts, fetching images
src/lib/router.jsx          react-router's API on Next's router (Link, NavLink, useNavigate, useSearchParams, ...)
src/api/                    the browser's API client (axios); parse.js holds the shapes both sides share
src/components/             the UI, unchanged in look; "use client" only where something reacts
```

Reading the API on the server: `src/server/discover.js` (`getEventPage`, `getClubPage`, `getClubEvents`, `getEvents`, `getThread`, the sitemap's). Each returns the same parsed shapes the browser gets from `@/api/discover` (both use `@/api/parse`), `null` when the API says 404, and throws `ApiError` otherwise. Every read goes through Next's data cache (`revalidate: 60`, tagged `event:{ref}` / `club:{slug}` / `lists` / `sitemap`), and React's `cache()` makes a page's `generateMetadata` and the page share one read.

Images: the API's posters, logos and photos are presigned S3 links that die within the hour. **No server-rendered HTML may hold one.** Before a page renders, `stableEventPage` / `stableClubPage` (src/seo/stabilize.js) swap every image for its `/media/...` address; `src/app/media/[...path]/route.jsx` looks the current link up and redirects (307, cached at most five minutes and never past the link's life; a link with under ten minutes left is fetched again past the caches). Components don't change: they render whatever address they get. Structured data and feeds use the same addresses; share pictures are `/og/events/{slug}` and `/og/clubs/{slug}`.

## Every route

**SSR + ISR** = rendered on the server, cached, regenerated in the background at most once a minute (`revalidate = 60`); a failed regeneration keeps serving the last good copy. **Dynamic** = rendered per request. **Client** = the page's component renders in the browser (`ClientPage`, `ssr: false`); its `<head>` (title, description, canonical, Open Graph) is still server-rendered.

| Address | Kind | File | Notes |
| --- | --- | --- | --- |
| `/events/{slug}` | **SSR + ISR** | `events/[slug]/page.jsx` | Event + BreadcrumbList JSON-LD; islands: share, calendar, live strip, section tabs, "Read more", poster fallback |
| `/clubs/{slug}` | **SSR + ISR** | `clubs/[slug]/page.jsx` | Organization (+ upcoming events) + BreadcrumbList; islands: follow (button, count, empty state, prompt), `?follow=` hint, visit count, Show more |
| `/` | Client | `page.jsx` → `homepage` | server head + Organization and WebSite (SearchAction) JSON-LD, RSS link |
| `/events` | Client | `events/page.jsx` → `eventspage` | filters in the query; RSS link |
| `/clubs` | Client | `clubs/page.jsx` → `clubspage` | |
| `/threads`, `/threads/{id}` | Client | `threads/…` → `threadspage` | a post is read as the signed-in person |
| `/about`, `/privacy`, `/terms` | Client | → `aboutpage`, `legalpage` | static words: the easiest to port |
| `/for-clubs`, `/pricing` | Client | → `forclubspage`, `pricingpage` | plans from `/api/v1/plans` |
| `/me/tickets`, `/me/following` | Client | `me/…` → `mepages` | signed in; `noindex`; `/me` → 307 `/me/tickets` (next.config) |
| `/events/{slug}/register` | Dynamic + client | `events/[slug]/register/page.jsx` → `register` | the server finds the event (404, 308 from an old slug with the query); `noindex` |
| `/events/{slug}/live`, `/compete` | Dynamic + client | → `live`, `compete` | same |
| `/play/{eventId}`, `/feedback/{eventId}/{registrationId}` | Client | → `play`, `feedback` | `noindex` |
| `/tickets/{ticketid}`, `/certificates/{ticketid}` | Client | → `ticket`, `certificate` | `noindex` |
| `/events/rss.xml`, `/clubs/{slug}/rss.xml` | Route handler | `events/rss.xml/route.js`, … | RSS 2.0 + the RSS event module; cached 10 min at the edge |
| `/sitemap.xml`, `/sitemaps/{name}.xml` | Route handler | `sitemap.xml/route.js`, `sitemaps/[name]/route.js` | a sitemap index; pages of ≤ 5,000 |
| `/robots.txt` | Metadata route | `robots.js` | |
| `/media/...` | Route handler | `media/[...path]/route.jsx` | stable image addresses (307) and the drawn cover (PNG) |
| `/og/events/{slug}`, `/og/clubs/{slug}` | Route handler | `og/…/route.jsx` | 1200×630 share pictures, `?v=` changes with what they show |
| `/api/share?path=…` | Route handler | `api/share/route.js` | the preview page bots get for client pages (below) |
| `/api/revalidate` | Route handler | `api/revalidate/route.js` | `POST`, `Bearer REVALIDATE_SECRET`: `{events, clubs, sitemap}` |
| anything else | 404 | `not-found.jsx` | the old 404 page; clubs have their own (`clubs/[slug]/not-found.jsx`) |

## The old addresses

All kept: they are on posters, QR codes printed on tickets, emails and the app's share links. Each answers a **308** that keeps the query (`?ref=`, `sref`, `utm_*`; the browser keeps the `#fragment`), or the 404 page when no public event goes by that name.

| Old address | Answer | Handled by |
| --- | --- | --- |
| `/{id}` | 308 → `/events/{slug}` | `[ref]/page.jsx` (`src/server/legacy.js`) |
| `/{slug}` (an event's) | 308 → `/events/{slug}` | same |
| `/{old slug}` | 308 → `/events/{current slug}` | same (the API resolves old slugs) |
| `/{ref}/live` | 308 → `/events/{slug}/live` | `[ref]/live/page.jsx` |
| `/{ref}/compete` | 308 → `/events/{slug}/compete` | `[ref]/compete/page.jsx` |
| `/register/{ref}` | 308 → `/events/{slug}/register` | `register/[ref]/page.jsx` |
| `/events/{id}` | 308 → `/events/{slug}` | next.config rewrites it to `/{id}` (so the query is kept) |
| `/events/{old slug}` | 308 → `/events/{slug}` | `events/[slug]/page.jsx` (ISR: the query isn't kept) |
| `/events/{id or old slug}/register` (`/live`, `/compete`) | 308 → `/events/{slug}/…` | the sub-page, query kept |
| `/clubs/{old slug}` | 308 → `/clubs/{slug}` | `clubs/[slug]/page.jsx` |
| `/me` | 307 → `/me/tickets` | next.config |
| `www.` and `events.myotherapp.in/*` | 308 → `https://myotherapp.in/*` | Vercel's domain settings (unchanged) |
| `{club}.myotherapp.in` | the club's site | the Cloudflare Worker (infra/cloudflare/club-sites), not this project |

The site's own words (`events`, `clubs`, `about`, …) have their own routes, which always win; `src/seo/legacy.js` lists the words that are never looked up as an event. `src/app/_tests/routes.test.js` checks which file answers each address and `_tests/event-routes.test.js` each redirect.

## Link-preview bots

WhatsApp, Telegram, Slack, X, LinkedIn, Facebook, Discord and search engines read the HTML they are sent. Server-rendered pages need no help. For **client pages**, next.config.mjs rewrites a bot's request (by user agent) to `/api/share`, which answers with the page's title, description, picture and words. The list is `BOT_PAGES` in `src/seo/bots.js`. **When you port a page, delete its line there.** When the last one goes, delete `src/server/share`, `src/app/api/share` and `src/seo/bots.js`.

## Porting a page: the one pattern

The event and club pages are the worked examples (`events/[slug]/page.jsx` + `components/discover/eventpage.jsx`, `clubs/[slug]/page.jsx` + `clubpage.jsx` + `clubislands.jsx`). For `/about`:

1. **Split the component.** Keep everything that only renders in a component with no hooks, no handlers and no browser APIs (the view: `AboutView({ data })`). Move what reacts to the reader into small `"use client"` islands, each taking plain props (no functions, no huge objects: pass the few fields it needs). Fetching moves out of the component.
   - An island that reads the query (`useSearchParams`, `useLocation`) must sit inside `<Suspense fallback={null}>`, or Next renders the whole page in the browser.
   - Don't read `localStorage`, `window` or the session while rendering; do it in an effect (the server knows nobody; `useAuth()` is "signed-out" on the server and in the first paint).
   - Something big to draw and small to describe (icons, covers) is cheaper as a client component: the page sends its props, not its drawing twice (HTML and React's data). Content stays server-rendered.
2. **Fetch on the server.** Add a reader in `src/server/discover.js` if there isn't one (always `apiGet` with a `revalidate`; `null` for 404). In `page.jsx`: `export const revalidate = 60;` (and for `[param]` routes `dynamicParams = true` and `generateStaticParams() { return []; }`), then `const data = await getX(...)`, `notFound()` for null, `permanentRedirect()` for a non-canonical address. Never read `searchParams` or `cookies()` in an ISR page: it makes the route dynamic. A page whose content depends on the query (the `/events` list) is dynamic: read `searchParams`, and keep the fetch cached.
3. **Stabilise images** before rendering: `stableClubPage(data)`, `stableCard(card)`, `stableThread(t)` (src/seo/stabilize.js). Add a `media` address and a `mediaTarget` case for any new kind of image.
4. **Metadata**: `export const metadata = pageMetadata({...})` or `generateMetadata` returning `pageMetadata(...)` / a builder like `eventMetadata`. It sets the title (the template adds " · MyOtherApp"), description, canonical on https://myotherapp.in, Open Graph (1200×630 picture, `en_IN`, site name) and the Twitter card. `noindex: true` for a person's pages and the steps of a flow.
5. **Structured data**: build it in a pure function in `src/seo` (like `eventStructuredData`), render `<JsonLd data={...} />`, and test it with `src/seo/validate.js`.
6. **Remove the client mount**: the page's line in `src/app/_client/pages.jsx`, its `BOT_PAGES` line, and any `usePageMeta` / `useShareMeta` / `useJsonLd` calls left in the component (the server sets the head now).
7. **Tests**: render the view with plain data inside `<MemoryRouter>` (as `eventpage.test.jsx` does) and test the route's server behaviour with a fake fetch (as `_tests/event-routes.test.js` does). Then `npm run build`, `npm start`, and `node scripts/check-seo.mjs`.
8. **Measure**: the HTML (`curl -s localhost:3000/x | wc -c`; aim under ~100 KB), and that the browser console shows no hydration warning.

### Rules that hold for every page

- Links and navigation come from `@/lib/router` (`Link to`, `NavLink`, `useNavigate`, ...), never `next/link`, `next/navigation` or `react-router-dom` directly, so components run the same in the app and in tests (vitest swaps the module for a react-router version, `src/test/router.jsx`).
- Stylesheets are imported once, in `src/app/layout.jsx`, in the old bundle's order. Add a new one there, not in a component.
- Env: `process.env.NEXT_PUBLIC_*` literally (Next inlines it), read through `src/config.js`. Server-only settings stay unprefixed.
- `npm run lint` uses Next's rules; the React Compiler's stricter hook rules are off until the old components are revisited.

## The signed-in flows (step 2's second half)

`/me/*`, the registration form, the live room, the competition, tickets and certificates stay client pages: they depend on the session in `localStorage` and work as before. To move signing in to the server later (the BFF/proxy-auth plan in docs/ARCHITECTURE_PLAN.md), the session must move to an httpOnly cookie first; until then, render these on the server only around the parts that don't depend on who is signed in (as `/events/{slug}/register` already finds the event on the server).

## What to remove when the last client page is ported

`src/app/_client/pages.jsx`, the bot rewrites (`src/seo/bots.js`, next.config's `beforeFiles` bot entries), `src/server/share` and `src/app/api/share`, `src/utils/meta.js`, and `react-router-dom` (a dev dependency kept only for the tests' router; the shim can then call `next/navigation` without the adapter).

## Known limits and follow-ups

- The whole stylesheet (157 KB, 29 KB gzipped) loads on every page, as it did before. Splitting it per route is safe once the client pages are ported.
- An event's page is about 60 KB of HTML (a very full one, with a dozen speakers and agenda items, about 140 KB; 16 KB gzipped). React sends server-rendered parts twice (HTML and its own data); keep big, static, prop-light things as client components and pass islands few props.
- `/events/{old slug}?query` loses its query in the 308 (the page is ISR). Ids and the old top-level addresses keep it.
- The feeds fetch each event's page for its words (cached, at most 6 s in all): see below for the backend change that removes this.

## What the backend should add (for better search results)

The site reads only what the discover API sends; these would make the pages, structured data, sitemaps and feeds better. Each works with the site as it is: the site uses a field once the API sends it.

1. **Paged sitemap** (in progress on `perf/discover-scale-2`): `GET /discover/sitemap/index` → `{page_size, pages: [{kind: "events"|"clubs", page, entries, updated_at}]}` and `GET /discover/sitemap/{kind}/{page}` → `{kind, page, pages, items: [{slug, updated_at}]}`, 404 past the last page. The site tries `/sitemap/index` first and falls back to `/discover/sitemap` on a 404, so nothing needs switching on. Please keep page boundaries stable (id order), and include every public event, past ones too (they stay indexable), not just the last year.
2. **On-demand revalidation**: when an event or club is published, edited, cancelled or unpublished, `POST https://myotherapp.in/api/revalidate` with `Authorization: Bearer <REVALIDATE_SECRET>` and `{"events": ["<slug>", "<id>"], "clubs": ["<slug>"], "sitemap": true}`. Pages then change within seconds instead of a minute, and an unpublished event stops being served from the cache at once.
3. **Event status**: `cancelled`, `postponed`, `rescheduled` (with `previous_starts_at`) and `moved_online` on the event page, kept public with the status rather than a 404. The structured data then says `EventCancelled` / `EventPostponed` / `EventRescheduled` / `EventMovedOnline` (today it is always `EventScheduled`), and the page can say so.
4. **When it changed and when it went up**: `updated_at` on the event page and on cards (sitemap `lastmod`, `dateModified`), and `published_at` (or `created_at`) on cards, for the feeds' `pubDate` and "newest first" (today: the start time and the id). A `sort=newest` on `/discover/events` would let the feed take the 50 newest directly.
5. **A short summary on cards**: `summary` (the first ~300 characters of `about`) on `/discover/events` items. The feeds then need no per-event read (today they fetch each event's page, cached, within a 6-second budget).
6. **A real venue address**: `locality` (city), `region` (state), `postal_code`, `country` for an event's venue, and a city for clubs. Google recommends them in an Event's `PostalAddress`; today the site can only send the venue's name as `streetAddress`.
7. **Attendance mode**: in person, online, or both, explicitly. Today "both" is guessed from an online event that also has a pinned venue.
8. **Stable image addresses**: public, content-addressed URLs (CloudFront, or a public-read bucket) instead of presigned links that expire within the hour. `/media/...` keeps working either way, but the redirect hop and its API read go away, and `next/image` could resize posters. At the least, presign for days, not an hour.
9. **Rate limits**: the site's server now reads the API from Vercel's addresses, shared by every visitor. Either exempt requests carrying `X-Site-Token` (set `API_SITE_TOKEN` on both sides) from the 120/minute per-address limit, or trust Vercel's `X-Forwarded-For`. Without lat/lng the API also places "the visitor" by that server address; the site works around it by asking for everywhere (`radius_km=0`) on the server.
10. **Test events**: production lists `[TEST] …` events; they are public, so they are in the sitemap and feeds and will be indexed. Mark them unlisted (or not public).
