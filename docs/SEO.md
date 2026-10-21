# Search: how the site is set up to rank in India, and what is left to do off-site

The site is myotherapp.in. Its audience is India, Kerala first: Kochi, Thiruvananthapuram, Kozhikode, Thrissur, Kannur and Kottayam. This page covers what the code does for search, how to check it, and the steps only the owner can take (Search Console, Bing, profiles, links). How pages are rendered is in [NEXT_MIGRATION.md](NEXT_MIGRATION.md).

## What the site says to search engines

| Where | What |
| --- | --- |
| Every page | `<html lang="en-IN">`, `og:locale` `en_IN`, one canonical on `https://myotherapp.in`, title and description, Open Graph and Twitter card (`src/seo/metadata.js`). `/favicon.ico` (16, 32, 48 px), `/icon-192.png`, `/apple-touch-icon.png`, `/manifest.webmanifest`. |
| Home `/` | Organization (`areaServed` India and Kerala, `sameAs` = `SOCIAL_PROFILES` in `src/config.js` plus the app stores) and WebSite with a SearchAction (`/events?q=`). |
| Event `/events/{slug}` | Event: name, start and end in India time (`+05:30`), `eventStatus`, `eventAttendanceMode` (a VirtualLocation for online events), a Place with the venue's city, state, PIN code and `addressCountry: IN`, the poster plus the same picture at 16:9, 4:3 and 1:1 (`/og/events/{slug}?ratio=`), description, an Offer in INR (price, availability, url, validFrom), organizer (the club, by `@id`) and performers (the speakers). BreadcrumbList. The club's RSS feed. |
| Club `/clubs/{slug}` | Organization (address and `areaServed` = its city, `knowsAbout`, `sameAs`, its upcoming events). BreadcrumbList. Its RSS feed. |
| Topic `/topics/{slug}` | CollectionPage, ItemList, BreadcrumbList, visible breadcrumbs. |
| City `/events/in/{city}`, `/clubs/in/{city}` | CollectionPage about the City, ItemList, BreadcrumbList, visible breadcrumbs, the place's feed. |
| Find pages `/events`, `/clubs` | ItemList of what is shown. One filter alone is indexed at its own canonical; any mix is `noindex, follow` (`src/seo/listings.js`). |
| Posts `/threads`, `/threads/{id}` | CollectionPage and ItemList; each post a DiscussionForumPosting (author, `datePublished`, likes and comment counts, comments). |
| `/sitemap.xml` | An index: `pages.xml`, `topics.xml`, `cities.xml` (when a city page is worth indexing), `events-{n}.xml`, `clubs-{n}.xml`. |

The JSON-LD is built by pure functions in `src/seo` (`jsonld.js`, `structured.js`, `citypages.js`) and checked by `src/seo/validate.js` against Google's rules for each rich result. `src/app/_tests/event-jsonld.test.js` renders an event page and checks every field Google requires and recommends.

Things deliberately not done:

- `hreflang`: there is one language version, so it would add nothing.
- `geo.region` / `geo.placename` meta tags: Google ignores them. India targeting comes from the content, the `.in` domain, `lang="en-IN"` and the addresses in the structured data.
- `rel="prev"`/`rel="next"`: Google no longer reads them, and the site has no `?page=N` addresses. "Load more" is for people; the sitemaps list every event and club.
- Visible breadcrumbs on event, club and post pages: those pages have no breadcrumb UI, so they carry the BreadcrumbList in JSON-LD only. Topic and city pages show them.

## City pages

`/events/in/kochi` is "Events in Kochi: hackathons, workshops and meetups". It shows the city's upcoming in-person events, its first clubs, the topics and the other cities. `/clubs/in/kochi` lists the city's clubs. `/events/in` is the hub. All three are regenerated every five minutes (ISR).

- **How a city is read.** The API has no city filter, so a city is a point and a radius (`src/seo/cities.js`). An event belongs to one city: the city its venue's words name last ("…, Payyannur, Kannur 670309" is Kannur), else the nearest city whose radius holds its point.
- **Other names.** `/events/in/cochin`, `/trivandrum`, `/calicut` and `/bangalore` 308 to the city's own slug, from `next.config.mjs` (`cityRedirects()`), with the query kept. An unknown city is a 404.
- **When a page is indexed.** Only while it lists something real, meaning not the demo clubs'. Otherwise it is `noindex, follow`. Only indexed pages go into `cities.xml`, and only indexed cities go into the hub's ItemList.
- **Where they are linked.** "Browse by city" on `/events` links every city with upcoming events, and the footer links "Events by city". The iOS app leaves `/events/in` and `/clubs/in` to the browser.
- **To add a city:** add a row to `CITIES` with its centre, a radius, the names people write it by and, for the big ones, a line of our own for the introduction.
- **Not built (cheap later):** topic and city together ("hackathons in Kochi"). Add these once a city has enough events in one topic to fill a page, as `/topics/{slug}/in/{city}`, with the same rule of indexing only when there is something real.

## Demo clubs

The eight made-up showcase clubs, and their events and posts, are `noindex, follow`. They are also left out of the sitemaps and of every ItemList. Everything about this, including the one switch (`DEMO_NOINDEX=off`), is in the [README](../README.md#demo-clubs-and-search-engines). While production holds only demo content, every city page is `noindex`, `cities.xml` is not listed, and the events and clubs sitemaps are empty. That is intended: they fill as real clubs join.

## Checking it

```sh
npm test                                                  # the builders, the routes, the sitemaps, the demo rules
npm run build && npm start
node scripts/check-seo.mjs http://localhost:3000 <event-slug> <club-slug>
```

After a deploy, check one event page in Google's [Rich Results Test](https://search.google.com/test/rich-results) and the [Schema Markup Validator](https://validator.schema.org/). A demo event still validates there, because the test reads the page; Google won't index it.

## The owner's to-do list

### 1. Google Search Console: a Domain property, verified by DNS

1. Go to https://search.google.com/search-console, then **Add property** and choose **Domain**. Enter `myotherapp.in`. A Domain property covers `www.`, `events.`, http and every club's subdomain.
2. Google shows a TXT record like `google-site-verification=…`. In Cloudflare, open **DNS**, then **Records**, then **Add record**:
   - Type `TXT`, Name `@`, Content the whole string, TTL Auto.
   - Leave any other TXT records (SPF and the like) alone.
3. Back in Search Console, choose **Verify**. It can take a few minutes, or up to an hour.
4. **Sitemaps:** submit `https://myotherapp.in/sitemap.xml`.
5. **URL inspection:** inspect `https://myotherapp.in/`, `/events` and one real event, and choose **Request indexing**. Once real clubs are on, do the same for `/events/in/kochi`.
6. There is no country setting to make: Google retired International Targeting, and the `.in` domain already targets India.
7. Watch **Pages** (why something isn't indexed), **Enhancements, then Events**, and **Core Web Vitals**. The last one fills once Chrome users visit (the CrUX field data).

### 2. Bing Webmaster Tools (Bing's index also feeds DuckDuckGo and Yahoo)

1. Go to https://www.bing.com/webmasters and choose **Import from Google Search Console**. That is the quickest way, and it brings the sitemap along.
2. Or add the site by hand and verify it with the DNS option, which is a CNAME record in Cloudflare (Name as given, Target `verify.bing.com`, **DNS only**, with the cloud grey).
3. Submit `https://myotherapp.in/sitemap.xml` if the import didn't.
4. Optional: turn on IndexNow in Bing. It needs a key file at the site root and a call when an event is published. The backend can call it next to `/api/revalidate`.

### 3. Fill in the brand's profiles

Create, or collect, MyOtherApp's own Instagram, LinkedIn, X and YouTube pages. Put their URLs in `SOCIAL_PROFILES` in `src/config.js`, which feeds the home page's Organization `sameAs`, then deploy. Link back to `https://myotherapp.in` from each profile's bio. Set `NEXT_PUBLIC_APP_STORE_URL` once the iPhone app is listed, which adds it too.

### 4. Off-site actions, in order of value

- **Links from colleges and clubs.** Every club that runs its events here should link its MyOtherApp club page from its own site, its Instagram bio and its college's student-activities page. College IEDC, IEEE, GDG, TinkerHub, KSUM and μLearn chapter pages in Kerala are the most relevant links the site can get. The club's page (`/clubs/{slug}`) and its subdomain site are the targets.
- **Event listings.** When a club posts an event elsewhere (college notice boards, KSUM, Meetup, LinkedIn events), include the `myotherapp.in/events/{slug}` link as the registration link.
- **Local press and blogs.** Write up notable events ("Kochi's biggest student hackathon this month") and pitch them to local tech newsletters and Kerala startup media, with a link to the event or city page.
- **The app store listings** link to `https://myotherapp.in`, and the site links back (already in the Organization's `sameAs`).
- **Google Business Profile** isn't applicable: there is no storefront or service area to verify. Don't create one for the brand. Clubs with a physical space of their own can make their own.
- **Later:** a Wikidata item for MyOtherApp once there is independent coverage to cite.

## What the backend should add for search

Each one works with the site as it is: the site uses a field once the API sends it.

1. **`is_demo: true`** on a club, everywhere a club appears: the club page, the club ref on event cards and event pages, posts, the clubs list and the sitemap rows. Then demo detection no longer needs the slug list, and an event's sitemap row can be judged without reading the demo clubs' events.
2. **The club in each event sitemap row** (`club_slug`). This is also read already.
3. **An event's venue address in parts:** `locality` (or `city`), `region`, `postal_code`. Today the city and state are worked out from the venue's words and point, and the PIN code from its words.
4. **`event_status`** (`cancelled`, `postponed`, `rescheduled` with `previous_starts_at`, `moved_online`), and **`attendance_mode`** (`in_person`, `online`, `mixed`). Both are mapped to schema.org already.
5. **A city filter or a city on events** (`?city=kochi`, or a geocoded `city` field). It would replace the point-and-radius reads with one indexed query, and fix venues whose pin is wrong.
6. **The media CDN** (`APP_MEDIA_CDN_URL=https://media.myotherapp.in`, infra/cloudflare/media). Pictures then come from Cloudflare near the reader, over HTTP/2, cached for a year, instead of presigned S3 links from us-east-1 that no cache keeps. This is the biggest Core Web Vitals win left (see below). Also send a `large` poster size (800 px wide) on the event page, so the poster can take a `srcset`.
7. **On-demand revalidation** (already described in NEXT_MIGRATION.md): call `/api/revalidate` on publish, edit and cancel, with `"sitemap": true`.

## Core Web Vitals

PageSpeed Insights' public API answered every call without a key with a quota of zero (HTTP 429). These numbers are Lighthouse 13.5 (mobile, simulated slow 4G), run from Kerala against production on 2026-10-21:

| Page | Performance | LCP | TBT | CLS |
| --- | --- | --- | --- | --- |
| Home | 94 | 2.9 s | 20 ms | 0.001 |
| Event | 73 | 8.5 s | 60 ms | 0 |
| Club | 94 | 2.8 s | 70 ms | 0 |

An event page's LCP is its poster: a 125 KB, 1080×1350 JPEG reached through `/media` (a 307) from S3 in us-east-1, over HTTP/1.1, with no cache lifetime. Lighthouse puts 1.6 s of it in loading the file. What was in the site's code, and done:

- `<link rel="preconnect">` to the picture host on the event, club, home and city pages.
- The club cover was answering 404. It loads again, with `fetchpriority="high"`.
- The page icon was a 690 KB SVG. The icons are now 3 to 22 KB PNGs.
- The 404s that showed in the console are gone.

The rest is infra:

- the media CDN (item 6 above);
- a mid-size poster for `srcset`;
- WebP. Club logos are 150 px PNGs shown at 40 to 56 px.

Measured again with `next start` (the median of three Lighthouse runs, origin/main against this branch, the same production API and S3):

| Page | Before | After |
| --- | --- | --- |
| Home | 91; LCP 3.3 s; 7 console 404s (club covers) | 90; LCP 3.7 s; no errors; best practices 96 → 100 |
| Event | 75; LCP 7.7 s; 1,488 KiB | 75; LCP 7.0–8.8 s across runs; 1,191 KiB |
| Club | 90; LCP 3.6 s (the tagline: the cover was a 404) | 81; LCP 5.1 s (the cover, now loading, is the largest paint) |

Two things to know when reading these. First, the event LCP swings by more than a second from run to run, because it is the S3 download itself, so the preconnect's saving is lost in that noise. Second, the club page's LCP rose because its cover now shows. A demo page's Lighthouse SEO score is 69 because it is `noindex`, which is intended. The console errors left on localhost are CORS refusals of `localhost` by the API, which production doesn't have.

Fonts are self-hosted by `next/font`: two preloaded, with `display: swap` and size-adjusted fallbacks. CLS is 0.
