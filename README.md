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

`MOA_API_URL` (the old link-preview function's) is still read by the server as a last fallback; it can be removed.

## Deploy

The Vercel project `moa-events`, framework Next.js (`vercel.json`). Deployed from the CLI:

```sh
vercel deploy --prod
```

Images from S3 are presigned links that expire: pages never embed them, they point at `/media/...`, which redirects to the current link (see the migration doc).
