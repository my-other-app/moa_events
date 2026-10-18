# The site on Next.js: what is where, and how to port the rest

The public site moved from a Vite single-page app to Next.js 16 (App Router). Step 1 built the foundation and server-rendered the pages search engines care most about: every event and every club. Step 2 server-rendered the rest of the public site: the home page, find events, find clubs, the posts and the site's own pages (about, privacy, terms, for clubs, pricing). The signed-in and transactional pages (registration, `/me/*`, the live room, the competition, play, feedback, tickets, certificates) are ported separately; until then they render in the browser exactly as before, at the same address. This document is the map, and the one pattern for porting the rest.

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

Reading the API on the server: `src/server/discover.js` (`getEventPage`, `getClubPage`, `getClubEvents`, `getEvents`, `getNewestEvents`, `getClubs`, `getHome`, `getNearHome`, `getThreads`, `getThread`, `getComments`, `getPlans`, the sitemap's), and `src/server/listings.js` for the find pages' first page. Each returns the same parsed shapes the browser gets from `@/api/discover` (both use `@/api/parse`), `null` when the API says 404, and throws `ApiError` otherwise. Every read goes through Next's data cache (`revalidate: 60`, tagged `event:{ref}` / `club:{slug}` / `lists` / `sitemap`), and React's `cache()` makes a page's `generateMetadata` and the page share one read.

Images: the API's posters, logos and photos are presigned S3 links that die within the hour. **No server-rendered HTML may hold one.** Before a page renders, `stableEventPage` / `stableClubPage` (src/seo/stabilize.js) swap every image for its `/media/...` address; `src/app/media/[...path]/route.jsx` looks the current link up and redirects (307, cached at most five minutes and never past the link's life; a link with under ten minutes left is fetched again past the caches). Components don't change: they render whatever address they get. Structured data and feeds use the same addresses; share pictures are `/og/events/{slug}` and `/og/clubs/{slug}`.

## Every route

**SSR + ISR** = rendered on the server, cached, regenerated in the background at most once a minute (`revalidate = 60`); a failed regeneration keeps serving the last good copy. **Dynamic** = rendered per request. **Client** = the page's component renders in the browser (`ClientPage`, `ssr: false`); its `<head>` (title, description, canonical, Open Graph) is still server-rendered.

| Address | Kind | File | Notes |
| --- | --- | --- | --- |
| `/events/{slug}` | **SSR + ISR** | `events/[slug]/page.jsx` | Event + BreadcrumbList JSON-LD; islands: share, calendar, live strip, section tabs, "Read more", poster fallback |
| `/clubs/{slug}` | **SSR + ISR** | `clubs/[slug]/page.jsx` | Organization (+ upcoming events) + BreadcrumbList; islands: follow (button, count, empty state, prompt), `?follow=` hint, visit count, Show more |
| `/` | **SSR + ISR** | `page.jsx` + `homepage.jsx` | the same for everyone: hero, categories, numbers, this week, clubs, online, popular, posts; Organization and WebSite (SearchAction) JSON-LD, RSS link. Islands: near you (`/api/near`, below), the search and its place |
| `/events` | **Dynamic** (edge-cached 60 s) | `events/page.jsx` + `eventspage.jsx` | filters in the query; the first 12 events, chips and count in the HTML; ItemList JSON-LD; canonical / noindex rules below; RSS link to the same list. Islands: filters, place, sheet, dates, order, "Load more", the calendar (`?view=calendar`) |
| `/clubs` | **Dynamic** (edge-cached 60 s) | `clubs/page.jsx` + `clubspage.jsx` | the same for clubs (`interest`, `sort`, `radius_km`, `near`); ItemList |
| `/threads` | **SSR + ISR** | `threads/page.jsx` + `threadspage.jsx` | the first 12 posts; "Load more" and the signed-in line are islands |
| `/threads/{id}` | **SSR + ISR** | `threads/[id]/page.jsx` | the post (read as nobody), counts, comments; DiscussionForumPosting + BreadcrumbList; like, vote, "Add a comment" are islands (read again as the signed-in reader); gone → `threads/[id]/not-found.jsx` (404) |
| `/about` | **SSR + ISR** | `about/page.jsx` + `aboutpage.jsx` | words from `@/content/about`, the home page's numbers |
| `/privacy`, `/terms` | **Static** | `privacy/page.jsx`, `terms/page.jsx` + `legalpage.jsx` | words from `@/content/legal` |
| `/for-clubs` | **SSR + ISR** | `for-clubs/page.jsx` + `forclubspage.jsx` | plans and numbers in the HTML; the plans' SoftwareApplication JSON-LD; the billing switch is the island, the drawings client components |
| `/pricing` | **SSR + ISR** (5 min) | `pricing/page.jsx` + `pricingpage.jsx` | every card and the comparison table in the HTML; SoftwareApplication with an Offer per plan and cycle |
| `/api/near` | Route handler | `api/near/route.js` | near one visitor, for the home page (below) |
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
| `/api/share/{path}` (or `?path=`) | Route handler | `api/share/[...path]/route.js` | the preview page bots get for client pages (below); only the registration, live and competition pages still use it |
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

WhatsApp, Telegram, Slack, X, LinkedIn, Facebook, Discord and search engines read the HTML they are sent. Server-rendered pages need no help. For **client pages** (now only registration, the live room and the competition under `/events/{slug}/`), next.config.mjs rewrites a bot's request (by user agent) to `/api/share/{the same path}`, which answers with the page's title, description, picture and words. The list is `BOT_PAGES` in `src/seo/bots.js`. **When you port a page, delete its line there.** When the last one goes, delete `src/server/share`, `src/app/api/share` and `src/seo/bots.js`.

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

## Near you on the home page

The home page is one static page for everyone (ISR, at most once a minute): the hero, this week, the clubs, online, popular and the posts are in its HTML, read with no place. "Events near you" (and, once the visitor is placed, "Clubs near …" instead of the most followed) is the `NearYou` island (`homeislands.jsx`): once the page is in the browser it asks **`/api/near`**, which places the visitor on the server:

1. the point they shared in this browser ("Use my location", `?lat=&lng=`), else
2. Vercel's guess from their connection: `x-vercel-ip-latitude`, `-longitude`, `-city` go to the API as the point (the city names it when the API names none), else
3. their address, as `X-Visitor-IP` (when `API_SITE_TOKEN` is set), for the API to place them itself, else
4. nowhere: an empty answer, without asking the API (it would place this server).

A guess is the same for everyone Vercel puts at the same spot, so that answer is kept at the edge for a minute (stale for five more while it is remade), `Vary: X-Vercel-IP-Latitude, X-Vercel-IP-Longitude, X-Vercel-IP-City`: one copy per place, never another place's. An answer for a shared point or an address is the visitor's alone (`private, max-age=60`). Sharing or forgetting a location asks again.

**Why not a page rendered per request with the geo headers.** Measured against the production API with `next start`: the static home answers in 1–12 ms (on Vercel, from the edge, for everyone, with no function run); a page rendered per visit has to read `/discover/home` for the place first, 0.3–1.1 s on a miss, and with the edge varied by city a site with visitors in many towns and modest traffic misses most of the time. The near-you answer is 2 KB and arrives a moment after the page; the rest of the page never waits for it, and the edge copy per place is shared. Crawlers (which come from the US) get the full, place-free page rather than an empty "near Mountain View". The cost: the near-you rail is filled after the first paint (a skeleton holds its place, and it collapses when there is nothing near).

## The find pages: addresses, canonicals, the place

Every filter of `/events` lives in the address (`q`, `when`, `from`/`to`, `category`, `type`, `price`, `sort`, `radius_km`, `near`, plus `view=calendar&month=`), and the server renders the first page for it. `near=lat,lng` is the place; without it the list is **everywhere** (radius 0, no distances, no order by distance), so the HTML depends on the address alone and the edge keeps each address a minute (`Vercel-CDN-Cache-Control` in next.config). A place the visitor kept in this browser is put into the address on arrival (with the order by distance a link asked for). `/clubs` works the same way.

Which addresses search engines keep (`src/seo/listings.js`): the page itself (an order alone counts as the page: canonical `/events`), and one browsing filter alone with something in it, at its own tidy canonical (`/events?category=3`, `?type=online`, `?price=free`, `?when=this_week`; `/clubs?interest=4`). Every other mix (words, days, a place, a radius, the calendar, two filters) is `noindex, follow` with no canonical. Tracking parameters never reach a canonical. Category chips are real links, so crawlers can reach the kept addresses.

## Known limits and follow-ups

- The whole stylesheet (157 KB, 29 KB gzipped) loads on every page, as it did before. Splitting it per route is safe once the client pages are ported.
- Page weights (HTML, production data): home 90 KB (13 KB gzipped), /events 42 KB, /clubs 32 KB, /threads 24 KB, a post 27 KB, /about 40 KB, /privacy 30 KB, /terms 40 KB, /pricing 100 KB (12 KB gzipped; 35 KB of it the table's tick icons), /for-clubs 154 KB (25 KB gzipped; 68 KB of it the drawings). Event and club cards are client components (much markup, little data), so a list sends each card's data, not its markup twice.
- `/events/{old slug}?query` loses its query in the 308 (the page is ISR). Ids and the old top-level addresses keep it.
- The feeds read each event's page for its words only for cards without `summary` (an older API); with it, none.
- Import `JsonLd` as `@/seo/JsonLd.jsx`: on a case-blind disk (macOS) vitest resolves `@/seo/JsonLd` to `jsonld.js`.
- Later pages of a list ("Load more"), the calendar's month and the date picker's dots are read by the browser from the API directly, as before (on localhost that needs the browser's CORS checks off).
- Past 1,000 results the API stops counting (`total: 1000`, `total_capped: true`): the pages say "1,000+", and "Load more" goes on until a page comes back short.

## What the backend should add (for better search results)

The site reads only what the discover API sends; these would make the pages, structured data, sitemaps and feeds better. Each works with the site as it is: the site uses a field once the API sends it.

1. **Paged sitemap** (in progress on `perf/discover-scale-2`): `GET /discover/sitemap/index` → `{page_size, pages: [{kind: "events"|"clubs", page, entries, updated_at}]}` and `GET /discover/sitemap/{kind}/{page}` → `{kind, page, pages, items: [{slug, updated_at}]}`, 404 past the last page. The site tries `/sitemap/index` first and falls back to `/discover/sitemap` on a 404, so nothing needs switching on. Please keep page boundaries stable (id order), and include every public event, past ones too (they stay indexable), not just the last year.
2. **On-demand revalidation**: when an event or club is published, edited, cancelled or unpublished, `POST https://myotherapp.in/api/revalidate` with `Authorization: Bearer <REVALIDATE_SECRET>` and `{"events": ["<slug>", "<id>"], "clubs": ["<slug>"], "sitemap": true}`. Pages then change within seconds instead of a minute, and an unpublished event stops being served from the cache at once.
3. **Event status**: `cancelled`, `postponed`, `rescheduled` (with `previous_starts_at`) and `moved_online` on the event page, kept public with the status rather than a 404. The structured data then says `EventCancelled` / `EventPostponed` / `EventRescheduled` / `EventMovedOnline` (today it is always `EventScheduled`), and the page can say so.
4. **When it changed and when it went up** (done on `perf/discover-scale-2`): `updated_at` and `created_at` on the event page and on cards; events have no separate publish time, so the site reads `published_at ?? created_at` for the feeds' `pubDate` and "newest first". The feed asks `/discover/events?sort=newest` (created first, then id, newest first: one read, in the API's order); an API that answers that with 422 gets the old way (120 by date, sorted here by `published_at`/`created_at`, else the id).
5. **A short summary on cards** (done there too): `summary`, plain text of at most 200 characters, on cards and the event page. The feeds use it and read no event's page; a card without one (an older API) still has its page read (cached, within a 6-second budget).
6. **A real venue address**: `locality` (city), `region` (state), `postal_code`, `country` for an event's venue, and a city for clubs. Google recommends them in an Event's `PostalAddress`; today the site can only send the venue's name as `streetAddress`.
7. **Attendance mode**: in person, online, or both, explicitly. Today "both" is guessed from an online event that also has a pinned venue.
8. **Stable image addresses**: public, content-addressed URLs (CloudFront, or a public-read bucket) instead of presigned links that expire within the hour. `/media/...` keeps working either way, but the redirect hop and its API read go away, and `next/image` could resize posters. At the least, presign for days, not an hour.
9. **Rate limits and who is asking** (done on the backend, PR #70): the site's server reads the API from Vercel's addresses, shared by every visitor. With `API_SITE_TOKEN` set (both sides), every server read sends `X-Site-Token`, and the API counts all of them in one bucket for the token (3000 a minute), not per visitor. Every read made for one visitor (the find pages, `/api/near`) also sends `X-Visitor-IP: <their address>` (the first hop of Vercel's `X-Forwarded-For`, else `X-Real-IP`), used only to place them. Reads made for nobody (ISR pages, feeds, sitemaps, media and share pictures) send the token alone. (Next's data cache keys a read by its headers, so a visitor's address also keeps their answer to themselves; shared reads stay shared.) Until the API trusts `X-Visitor-IP`, a read without a point would be placed by the server's address, so the site asks for everywhere (`radius_km=0`) unless the visitor's address goes along.
10. **Test events**: production lists `[TEST] …` events; they are public, so they are in the sitemap and feeds and will be indexed. Mark them unlisted (or not public).
