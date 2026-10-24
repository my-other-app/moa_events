# MyOtherApp, the public site

https://myotherapp.in: events and clubs near you, each event's and club's page, the clubs' posts, registration, tickets, the live room. (www.myotherapp.in and events.myotherapp.in redirect to it.)

Next.js 16 (App Router), React 19, plain JavaScript. Every public page is rendered on the server: events, clubs, posts, the home page and the site's own pages are regenerated at most once a minute (ISR); the find pages (`/events`, `/clubs`) are rendered for their address and kept a minute at the edge. The signed-in and transactional pages (registration, tickets, the live room) are rendered on the server too, and hydrate in the browser. **How the site is put together, which page is which, and how to add a page: [docs/NEXT_MIGRATION.md](docs/NEXT_MIGRATION.md).**

## Run it

```sh
npm ci
npm run dev        # http://localhost:3000, against the production API (reads only, unless you sign in)
npm test           # vitest
npm run lint
npm run build && npm start
node scripts/check-seo.mjs http://localhost:3000   # what a crawler sees: HTML, JSON-LD, 308s, 404s, sitemap, feeds
```

Search (titles, structured data, the city pages, the demo clubs, Search Console): **[docs/SEO.md](docs/SEO.md)**.

Node 20.9 or newer. The API allows only the site's own origins, so pages that call it from the browser (the client pages) need a local API, or the browser's CORS checks off, on localhost; server-rendered pages work as they are.

## Settings

Set these on the Vercel project (Production and Preview). `NEXT_PUBLIC_*` values are written into the browser bundle at build time, so a change needs a new deploy.

| Variable | What it is | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | The API's origin, without `/api/v1` | `https://api.myotherapp.in` |
| `API_BASE_URL` | The API's origin for the server only (a private address, say) | `NEXT_PUBLIC_API_BASE_URL` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google sign-in's web client id; unset, the site has no sign-in | none |
| `NEXT_PUBLIC_RAZORPAY_KEY` | Razorpay's publishable key, for orders that don't bring their own | none |
| `NEXT_PUBLIC_PLAY_STORE_URL` | "Get the app" on Android | the Play Store listing |
| `NEXT_PUBLIC_APP_STORE_URL` | "Get the app" on iPhone; unset, it says "coming soon" | none |
| `REVALIDATE_SECRET` | Turns on `POST /api/revalidate` (the API saying an event or club changed) | off |
| `API_SITE_TOKEN` | Sent to the API as `X-Site-Token` on every server read, for it to tell the site's server from a visitor; the API counts all site reads in one bucket for the token. With it, reads made for one visitor also send `X-Visitor-IP` (their address, from Vercel's `X-Forwarded-For`), used to place them and, for the certificate check (`/verify/{number}`), as the person the API counts the check against. **Needed for `/verify`:** without it every visitor's check counts against Vercel's shared addresses (20 a minute between them). Never sent from the browser | not sent |
| `ANDROID_APP_SHA256` | The Android app's signing-certificate SHA-256 fingerprints, comma-separated, for `/.well-known/assetlinks.json`. Use the **Play App Signing** key's (Play Console → Test and release → App integrity → App signing); add the upload key's as well to test a locally signed build. Colons and case don't matter. Read at build, so set it, then deploy | unset: `assetlinks.json` is `[]`, and Android opens the links in the browser |
| `DEMO_NOINDEX` | `off` turns off everything below about the demo clubs: their pages are indexed and listed again. Server only; redeploy after changing it | on |
| `DEMO_CLUB_SLUGS` | The demo clubs' slugs, comma-separated; replaces the built-in list of eight (`""`: none, so only `is_demo` and a `demo.myotherapp.in` address count) | the eight seeded clubs |
| `NEXT_PUBLIC_SENTRY_DSN` | The Sentry project's DSN: turns error tracking on, in the browser and on the server (see below). Unset, Sentry is off and its code is never loaded | off |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | The environment events are filed under | Vercel's `production` / `preview`; `local` for any other build |
| `NEXT_PUBLIC_SENTRY_RELEASE` | The release events are filed under | `moa-events@<commit>` |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | The share of page loads and server requests traced, 0 to 1 | `0.05` |
| `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_RATE` | The share of sessions that hit an error recorded as a replay (every word, input and picture masked), 0 to 1 | `0`: no replay |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Build only, all three or none: the source maps (browser and server) are uploaded to Sentry for the release, then deleted from the build so they are never served; a failed upload is logged and the build goes on. The token is an organization auth token (Sentry → Settings → Auth Tokens) | not uploaded |

`.env.example` lists them all, for a local `.env.local`.

## Error tracking (Sentry)

Off until `NEXT_PUBLIC_SENTRY_DSN` is set on the Vercel project (Production, and Preview if wanted), then redeploy. Without it nothing is loaded, nothing listens and nothing is sent; `src/sentry/sentry.test.js` holds that.

- **Browser**: the SDK is its own chunk (about 80 KB), fetched three seconds after the page's load event, when the browser is idle (`src/sentry/lazy.js`, started from `src/instrumentation-client.js`), so it never competes with the page for its first paint or LCP (an event's poster often lands just after the load event). Errors thrown before it arrives are held and sent once it is in; web vitals are read back from the browser. Errors a page's error boundary catches are sent from `app/error.jsx` and `app/global-error.jsx`. The browser adds no trace headers to requests: on Next's own prefetches they cost a throttled mobile about 2 s of main-thread work after load (Lighthouse, home page).
- **Server**: `src/instrumentation.js` starts it in `register()` and sends every error Next catches while rendering a page or running a route (`onRequestError`).
- **What is kept out** (`src/sentry/options.js`): `sendDefaultPii` is off; no cookies, no request bodies, no user, and only the `User-Agent`, `Accept`, `Accept-Language`, `Content-Type`, `Host` and `Referer` headers (so no `Authorization`, no addresses); emails and phone numbers are masked in every message, breadcrumb, URL and context; the codes in `/tickets/…`, `/certificates/…`, `/verify/…` and `/feedback/…/…` addresses become `[code]`. No session replay unless its rate is set.
- **Noise dropped**: the API refusing `localhost` (CORS, while the site runs on a developer's machine), bots' 404s and their page loads, Next's `notFound()` / `redirect()`, cancelled requests, ResizeObserver warnings, browser extensions.
- **In Sentry's project settings**, also turn on Security & Privacy → "Prevent Storing of IP Addresses" (and keep the default data scrubber on): browsers' addresses are otherwise read off the connection by Sentry itself.

The site has no Edge routes or middleware, so only the Node runtime is set up. `@sentry/nextjs` is on 10.x; 11.x (September 2026) changes what is collected by default (`dataCollection` replaces `sendDefaultPii`), so moving to it means re-checking the list above.

## Demo clubs and search engines

Production has eight made-up showcase clubs (contact addresses at `*.demo.myotherapp.in`: `borrow-checkers-kochi`, `neural-tide`, `thattukada-design-club`, `pooram-sound-society`, `founders-verandah`, `sulaimani-striders`, `kandal-kootam`, `respawn-room`) with their events and posts. People can see and open all of it. Search engines are told to leave it alone, because invented events with Event structured data would mislead searchers and make the site look spammy:

- the club's page, each of its events' pages and each of its posts say `<meta name="robots" content="noindex, follow">`;
- they are left out of the sitemaps, the ItemLists on `/events`, `/clubs`, the topic pages and the city pages;
- a find page or a city page that shows only demo content is `noindex` too.

One helper decides (`src/seo/demo.js`). A club is demo when the API says `is_demo: true` (once it sends it), when its contact address (or an event's contact address) is at `demo.myotherapp.in`, or when its slug is in `DEMO_CLUB_SLUGS` (default: the eight above). Events and posts carry only their club's slug, so the list is what catches them until the API sends `is_demo`.

**When real clubs replace the demo:** delete the demo clubs, or set `DEMO_NOINDEX=off` on the Vercel project and redeploy. Nothing else changes.

## App links

`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` tell iOS and Android that the MyOtherApp app may open `/events` and `/events/…`, `/clubs` and `/clubs/…`, `/threads` and `/threads/…`, `/topics` and `/topics/…`, `/tickets/…`, `/certificates/…` and `/feedback/…`. The live room (`/events/{slug}/live`), the feeds, `/play`, `/api`, `/og`, `/media`, `/for-clubs` and `/pricing` stay in the browser on iPhone. What is claimed, and why, is in `src/seo/appLinks.js`. Only `myotherapp.in` is claimed: `www.` and `events.` redirect, and neither Apple nor Google follows a redirect for these files.

Check them after a deploy:

```sh
curl -sI https://myotherapp.in/.well-known/apple-app-site-association   # 200, content-type: application/json, no location
curl -s  https://myotherapp.in/.well-known/apple-app-site-association | jq .
curl -s  https://myotherapp.in/.well-known/assetlinks.json | jq .
# What Apple's CDN has (it caches for up to a day):
curl -s  https://app-site-association.cdn-apple.com/a/v1/myotherapp.in | jq .
# Google's verdict for the app's links:
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://myotherapp.in&relation=delegate_permission/common.handle_all_urls" | jq .
```

## Deploy

The Vercel project `moa-events` deploys `main` on every merge (Vercel's Git integration). Don't also deploy from the CLI: a CLI deploy can race the Git one and win with older code.

The framework is Next.js, set in `vercel.json`, which overrides the project's own Framework Preset. That preset still says **Vite** from before the move: set it to Next.js in the project's Settings → Build and Deployment so the two agree.

Images from S3 are presigned links that expire: pages never embed them, they point at `/media/...`, which redirects to the current link (see the migration doc).
