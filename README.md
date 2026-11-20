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
| `NEXT_PUBLIC_APP_STORE_URL` | "Get the app" on iPhone | the App Store listing |
| `REVALIDATE_SECRET` | Turns on `POST /api/revalidate` (the API saying an event or club changed) | off |
| `API_SITE_TOKEN` | Sent to the API as `X-Site-Token` on every server read, for it to tell the site's server from a visitor; the API counts all site reads in one bucket for the token. With it, reads made for one visitor also send `X-Visitor-IP` (their address, from Vercel's `X-Forwarded-For`), used to place them and, for the certificate check (`/verify/…`, and a certificate's own page, `/certificates/{public id}`), as the person the API counts the check against. **Needed for `/verify`:** without it every visitor's check counts against Vercel's shared addresses (20 a minute between them). Never sent from the browser | not sent |
| `ANDROID_APP_SHA256` | The Android app's signing-certificate SHA-256 fingerprints, comma-separated, for `/.well-known/assetlinks.json`. Use the **Play App Signing** key's (Play Console → Test and release → App integrity → App signing); add the upload key's as well to test a locally signed build. Colons and case don't matter. Read at build, so set it, then deploy | unset: `assetlinks.json` is `[]`, and Android opens the links in the browser |
| `DEMO_NOINDEX` | `off` turns off everything below about the demo clubs: their pages are indexed and listed again. Server only; redeploy after changing it | on |
| `DEMO_CLUB_SLUGS` | The demo clubs' slugs, comma-separated; replaces the built-in list of eight (`""`: none, so only `is_demo` and a `demo.myotherapp.in` address count) | the eight seeded clubs |
| `NEXT_PUBLIC_SENTRY_DSN` | The Sentry project's DSN: turns error tracking on, in the browser and on the server (see below). Unset, Sentry is off and its code is never loaded | off |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | The environment events are filed under | Vercel's `production` / `preview`; `local` for any other build |
| `NEXT_PUBLIC_SENTRY_RELEASE` | The release events are filed under | `moa-events@<commit>` |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | The share of page loads and server requests traced, 0 to 1 | `0.05` |
| `NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_RATE` | The share of sessions that hit an error recorded as a replay (every word, input and picture masked), 0 to 1 | `0`: no replay |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Build only, all three or none: the source maps (browser and server) are uploaded to Sentry for the release, then deleted from the build so they are never served; a failed upload is logged and the build goes on. The token is an organization auth token (Sentry → Settings → Auth Tokens) | not uploaded |
| `NEXT_PUBLIC_SESSION_COOKIE` | `on` keeps a visitor's tokens (the account's, and a registration's guest token) in HttpOnly cookies the site's own server reads, instead of in localStorage; calls that need a token go through `/api/gateway` (see "Session cookies" below). Read at build, by the browser bundle and the server alike | off: tokens in localStorage, as before |
| `CSP_ENFORCE` | Build only. `on` enforces the script policy (`next.config.mjs`, `reportOnlyPolicy`) on every address instead of only reporting it. Watch the reports first (`docker compose logs website \| grep csp-report` on the box, and Sentry when it is on: every report also goes to `POST /api/csp-report`, logged as one line per kind) | off: the policy is sent as `Content-Security-Policy-Report-Only` |

`.env.example` lists them all, for a local `.env.local`.

## Error tracking (Sentry)

Off until `NEXT_PUBLIC_SENTRY_DSN` is set on the Vercel project (Production, and Preview if wanted), then redeploy. Without it nothing is loaded, nothing listens and nothing is sent; `src/sentry/sentry.test.js` holds that.

- **Browser**: the SDK is its own chunk (about 80 KB), fetched three seconds after the page's load event, when the browser is idle (`src/sentry/lazy.js`, started from `src/instrumentation-client.js`), so it never competes with the page for its first paint or LCP (an event's poster often lands just after the load event). Errors thrown before it arrives are held and sent once it is in; web vitals are read back from the browser. Errors a page's error boundary catches are sent from `app/error.jsx` and `app/global-error.jsx`. The browser adds no trace headers to requests: on Next's own prefetches they cost a throttled mobile about 2 s of main-thread work after load (Lighthouse, home page).
- **Server**: `src/instrumentation.js` starts it in `register()` and sends every error Next catches while rendering a page or running a route (`onRequestError`).
- **What is kept out** (`src/sentry/options.js`): `sendDefaultPii` is off; no cookies, no request bodies, no user, and only the `User-Agent`, `Accept`, `Accept-Language`, `Content-Type`, `Host` and `Referer` headers (so no `Authorization`, no addresses); emails and phone numbers are masked in every message, breadcrumb, URL and context; the codes in `/tickets/…`, `/certificates/…`, `/verify/…`, `/feedback/…/…`, `/answers/…/…`, `/posters/…` and `/help/survey/…` addresses, the token in `/tickets/cancel?t=…` and a signed link's key (`?s=…`, the poster link), become `[code]`. No session replay unless its rate is set.
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

`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` tell iOS and Android that the MyOtherApp app may open `/events` and `/events/…`, `/clubs` and `/clubs/…`, `/threads` and `/threads/…`, `/topics` and `/topics/…`, `/tickets/…`, `/certificates/…`, `/feedback/…`, `/answers/…` (the details a club asks for after sign-up), people's profiles (`/u/…`), their QR codes (`/p/…`, the app's save flow) and the recap's Network link (`/network`; the Android app's intent filter must list all three), and the live room and quiz (`/events/{slug}/live`, `/play/…`), which the app shows natively. The feeds, `/api`, `/og`, `/media`, `/for-clubs`, `/pricing`, `/tickets/cancel` (giving a ticket back, under the claimed `/tickets/…`), `/tickets/…/poster` (an older form of the poster link, which redirects to `/posters/…`: no app claims that), claiming a speaker profile (`/speakers/claim/…`) and editing one (`/speakers/me`) stay in the browser on iPhone; the Android app's router must send `/tickets/cancel` to the browser itself (Android can't leave a path out). Speakers' pages (`/speakers/{slug}`) aren't claimed yet: add `/speakers/*` to `APP_PATHS` once the app's Speaker screen is in a release. What is claimed, and why, is in `src/seo/appLinks.js`. Only `myotherapp.in` is claimed: `www.` and `events.` redirect, and neither Apple nor Google follows a redirect for these files.

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

### Self-hosted (the Oracle box)

The site also builds as a container for the one-box setup in moa_backend
(`ops/server`, `docs/MOVE_TO_ORACLE.md`), which replaces Vercel at the cutover:

- `Dockerfile`: `next build` with `NEXT_OUTPUT=standalone` (next.config.mjs
  turns standalone output on only then, so Vercel builds are unchanged), a
  `node:22-alpine` runner as the unprivileged `node` user, a health check,
  `.next/cache` kept in a volume on the box (Next's data cache, so ISR and
  `/api/revalidate` work as on Vercel).
- `deploy/build/production.env` and `staging.env`: the public build-time
  values (`NEXT_PUBLIC_*`, `ANDROID_APP_SHA256`), baked into each
  environment's image. Public values only; secrets are GitHub secrets.
- `.github/workflows/image.yml`: builds linux/amd64 + linux/arm64 and pushes
  `ghcr.io/my-other-app/moa-website:<sha>` (staging: `staging-<sha>`); on
  push only once the repository variable `ORACLE_IMAGES` is `true`. It can
  deploy through the box's deploy gate.
- Run-time settings (`API_BASE_URL`, `REVALIDATE_SECRET`, `API_SITE_TOKEN`,
  `DEMO_*`) live on the box, not in the image.
- What Vercel's edge did is done there by Cloudflare and Caddy: the
  `www.`/`events.` redirects, the visitor's address (`X-Forwarded-For`) and
  place (Cloudflare's location headers, passed on as `x-vercel-ip-*`).

### Edge cache (Cloudflare, in front of the box)

`/events`, `/clubs` and `/topics/{slug}` are rendered per request, but their
HTML depends on the address alone, so an edge may keep each address a minute
(and serve it stale for five while it is made again). Next marks full page
loads of exactly those paths with `Cloudflare-CDN-Cache-Control` (and
`Vercel-CDN-Cache-Control` for previews); a client navigation (an RSC request,
`RSC: 1` or `?_rsc=`) is never marked, because Cloudflare keys its cache by the
address alone. Cloudflare keeps no HTML unless a Cache Rule says it may, so the
header does nothing until this rule exists (Cloudflare dashboard → the
`myotherapp.in` zone → Caching → Cache Rules → Create rule):

- **Name:** Site find pages, one minute
- **Expression** (Edit expression):

  ```
  (http.host eq "myotherapp.in"
    and (http.request.uri.path in {"/events" "/clubs"}
         or (starts_with(http.request.uri.path, "/topics/") and not ends_with(http.request.uri.path, ".xml")))
    and not any(http.request.headers.names[*] eq "rsc")
    and not any(http.request.headers.names[*] eq "next-router-prefetch")
    and not any(http.request.headers.names[*] eq "next-router-state-tree")
    and not http.request.uri.query contains "_rsc=")
  ```
- **Cache eligibility:** Eligible for cache.
- **Edge TTL:** Use cache-control header if present, bypass cache if not.
- **Browser TTL:** Respect origin (the browser keeps getting `private, no-store`).
- **Cache key:** the default (the query string is part of it: `/events?city=pune` is its own copy).

No cookie needs to bypass it: these pages never read one, and a signed-in
visitor's own lists are read in the browser. Check it: `curl -sI
https://myotherapp.in/events | grep -i cf-cache-status` says `MISS`, then `HIT`
within the minute; `curl -sI -H 'RSC: 1' https://myotherapp.in/events` never
says `HIT`. A change an organiser makes shows on these pages within about a
minute (six at most, while a stale copy is served); the event's own page is
refreshed at once by `/api/revalidate`, as before. To undo, turn the rule off.

## Session cookies (`NEXT_PUBLIC_SESSION_COOKIE=on`)

Off by default: the site keeps the visitor's tokens in localStorage and the
browser sends them to the API itself. With `on` in the build env (and a new
build), page script never holds a token:

- **Cookies.** `__Host-moa_session` (the account's access and refresh tokens),
  `__Host-moa_guest` (a registration's guest token) and `__Host-moa_payas` (a
  waiting-list claim's guest, an hour at most): HttpOnly, Secure,
  SameSite=Lax, Path=/, no Domain, so no other myotherapp.in host (a club's
  site) can set or replace them. Plain names on a developer's `http://localhost`.
- **The gateway.** A call that needs a token goes to
  `/api/gateway/api/v1/...` (`src/server/session/gateway.js`), which adds the
  token, renews it when it is about to run out (one renewal at a time per
  session, shared by every tab's calls), and passes the call to the API over
  the box's own network (`API_BASE_URL`) with the visitor's address
  (`X-Forwarded-For`) and user agent: the API limits and records each visitor as
  their own, as when the browser called it. It never sends the site's
  `X-Site-Token` (that is for the site's public reads) and never passes the
  browser's cookies on. A visitor's calls with no token still go straight to the
  API. Only the site's own pages may use it (`Sec-Fetch-Site` / `Origin`).
- **Tokens never reach the page.** A sign-in's tokens become the session cookie
  and the answer says only `{session: {sid, user}}`; a registration's
  `auth_token` becomes the guest cookie (`{kept: "guest"}`). localStorage keeps
  only who is signed in (`moa.session`: `{cookie: true, sid, user, profile,
  claims}`) and whether there is a guest (`moa.guest`), so every tab still shows
  it.
- **People signed in before the switch stay signed in.** On their first page load
  the tokens in localStorage go to `POST /api/session` (`action: adopt`), into the
  cookies, and are then cleared there. If the site's server can't be reached they
  stay put for the next load.
- **Signing out** (`DELETE /api/session`) ends the session on the API too.
- **Turning it off again** (rebuild without it) signs website visitors out once:
  the older build can't read the cookies, which then simply run out. The app is
  not affected.

The API needs no change: the site's server reads the tokens in the API's
answers and the browser no longer calls it with them. Keep
`FORWARDED_ALLOW_IPS` believing the website container (it is `*` in
`ops/server/compose.yml`): the API takes the visitor's address from
`X-Forwarded-For` only from a proxy it trusts, and otherwise every signed-in
visitor would share the website container's one address in its rate limits.
