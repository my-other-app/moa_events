# MyOtherApp, the public site

https://myotherapp.in: events and clubs near you, each event's and club's page, the clubs' posts, registration, tickets, the live room. (www.myotherapp.in and events.myotherapp.in redirect to it.)

Next.js 16 (App Router), React 19, plain JavaScript. Every public page is rendered on the server: events, clubs, posts, the home page and the site's own pages are regenerated at most once a minute (ISR); the find pages (`/events`, `/clubs`) are rendered for their address and kept a minute at the edge. The signed-in and transactional pages (registration, tickets, the live room) still render in the browser while they are ported. **How the site is put together, which page is which, and how to port the rest: [docs/NEXT_MIGRATION.md](docs/NEXT_MIGRATION.md).**

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

| Variable | Was (Vite) | What it is | Default |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `VITE_API_BASE_URL` | The API's origin, without `/api/v1` | `https://api.myotherapp.in` |
| `API_BASE_URL` | (new, optional) | The API's origin for the server only (a private address, say) | `NEXT_PUBLIC_API_BASE_URL` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `VITE_GOOGLE_CLIENT_ID` | Google sign-in's web client id; unset, the site has no sign-in | none |
| `NEXT_PUBLIC_RAZORPAY_KEY` | `VITE_RAZORPAY_KEY` | Razorpay's publishable key, for orders that don't bring their own | none |
| `NEXT_PUBLIC_PLAY_STORE_URL` | `VITE_PLAY_STORE_URL` | "Get the app" on Android | the Play Store listing |
| `NEXT_PUBLIC_APP_STORE_URL` | `VITE_APP_STORE_URL` | "Get the app" on iPhone; unset, it says "coming soon" | none |
| `REVALIDATE_SECRET` | (new, optional) | Turns on `POST /api/revalidate` (the API saying an event or club changed) | off |
| `API_SITE_TOKEN` | (new, optional) | Sent to the API as `X-Site-Token` on every server read, for it to tell the site's server from a visitor; the API counts all site reads in one bucket for the token. With it, reads made for one visitor also send `X-Visitor-IP` (their address, from Vercel's `X-Forwarded-For`), used only to place them. Never sent from the browser | not sent |
| `ANDROID_APP_SHA256` | (new) | The Android app's signing-certificate SHA-256 fingerprints, comma-separated, for `/.well-known/assetlinks.json`. Use the **Play App Signing** key's (Play Console → Test and release → App integrity → App signing); add the upload key's as well to test a locally signed build. Colons and case don't matter. Read at build, so set it, then deploy | unset: `assetlinks.json` is `[]`, and Android opens the links in the browser |

| `DEMO_NOINDEX` | (new, optional) | `off` turns off everything below about the demo clubs: their pages are indexed and listed again. Server only; redeploy after changing it | on |
| `DEMO_CLUB_SLUGS` | (new, optional) | The demo clubs' slugs, comma-separated; replaces the built-in list of eight (`""`: none, so only `is_demo` and a `demo.myotherapp.in` address count) | the eight seeded clubs |

`MOA_API_URL` (the old link-preview function's) is still read by the server as a last fallback; it can be removed.

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

The Vercel project `moa-events`, framework Next.js (`vercel.json`). Deployed from the CLI:

```sh
vercel deploy --prod
```

Images from S3 are presigned links that expire: pages never embed them, they point at `/media/...`, which redirects to the current link (see the migration doc).
