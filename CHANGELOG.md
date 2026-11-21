# Changelog

What changed on myotherapp.in, the public website where guests find events, register, keep their tickets and join the live room.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The website goes live continuously, so each section is the date a set of changes went live.

## 2026-11-21 - DevFest release

Releasing today, 21 November 2026.

### Added

- **"I'm attending" posters.** Under your ticket, "Make your poster" opens the poster the club designed for the event, with your name on it. It shows only when the organisers turn posters on.
- Add your photo to the poster, then move and zoom it inside the design's frame. Pick square, portrait or story, where the organisers offer them.
- Share your poster with its caption from your phone, or download it and copy the caption. The poster's link counts the people who register through it.
- **Quests.** At events that run one, a quest card under your ticket and on the event page shows your tasks, your points, the next milestone and your rewards.
- Each task has a button to do it: scan people's QR codes in the app, join the live room, give feedback, make your poster, follow the club or open your ticket. Station tasks say where to get scanned.
- Enter the codes shown at the event. The page says right away if a code worked, or why not.
- Pick or change your swag size while a reward is held for you, and see which swag desk to collect it from. See the leaderboard when the organisers turn it on.
- **The live room in the event's own look.** The room and the quiz show the organisers' colours, logo, fonts, answer shapes and timer style.
- New quiz question kinds: several right answers with partial credit, true or false, type the answer, and put things in order. Poll questions in a quiz carry no points.
- Quiz rounds and teams, pause and reveal, double points, streaks, and questions that move on by themselves. When a round ends, you join the next one with the same name.
- More poll kinds: pick several, star or number ratings, ranking and open text. Results show as bars, columns, a donut or a word cloud.

### Fixed

- The live room opens even when the server is slow to answer.
- Answer tiles in the quiz no longer split words, and screen readers say a team's name once.

### Security

- Updated the site's web framework and a networking library to fix security issues.

## 2026-11-18

### Added

- Links to the iPhone app on the App Store, now that it is out: "Get the app", the store badges and the footer.
- On a phone with the app, profile links, personal QR links and the Network link open in the app.

## 2026-11-16

### Added

- Links for hidden tickets, such as speaker or staff tickets, now work all the way through registration. If a link is out of date, the page says so, and you can still pick another ticket.

Behind the scenes: groundwork for stricter security settings and faster event and club listings.

## 2026-11-15

### Security

- Stronger security settings on every page. Pictures load only from MyOtherApp's own storage.

## 2026-11-14

### Added

- Public profiles at myotherapp.in/u/ followed by a handle. Save someone's contact card, or save them to your network when you are signed in.
- Personal QR links open the person's profile, ready to save.
- A Network page that tells you where to find your network in the app.

## 2026-11-13

### Changed

- An event or club whose web address changed sends you to the new address and keeps the link's tracking code.

### Fixed

- When a club declines your registration, the event page says so and links to your registration, instead of offering Register again.

## 2026-11-12

### Added

- **Help page** at myotherapp.in/help: answers to common questions, an "Ask us" form with screenshots, and My requests with our replies.
- "Get help" buttons next to some payment and account error messages.
- **Speaker pages** with a bio, links and talks. Follow a speaker, and speaker names on event pages link to their page.
- Speakers can claim their profile from the invite email and edit it.
- **"Give your ticket back"** page for the link in ticket emails, to free your place on a free ticket before the event starts.
- **"Share this event"** on event pages: X, LinkedIn, Facebook, WhatsApp and Copy link. Shared events also get better link previews.
- A data deletion page, and new sections on clubs' social accounts in the Privacy Policy and Terms.
- A "Talk to us" form on the For clubs page.
- Developer docs for the Integrations API at myotherapp.in/developers. The full docs open from a link made in the club dashboard.

## 2026-11-08

### Added

- Registration questions can depend on your earlier answers, so you only see the ones that apply to you.
- When a club needs more details after you registered, a personal page lets you add them, and a "details needed" note shows on your ticket.

### Changed

- Certificate pages and the certificate check at /verify use each certificate's own number and link.

### Fixed

- The ticket page says why a ticket did not load (it belongs to another account, the ticket does not exist, or there is no connection), and offers a way forward.

### Security

- Ticket, certificate and feedback pages are no longer cached, and never pass their address on to other sites.

## October 2026

The website became the web side of MyOtherApp, at myotherapp.in.

### Added

- New event pages with the agenda, speakers, organisers, sponsors and partners. Events hosted by two clubs show both.
- A new home page. Find events by city, topic and date, and see clubs near you.
- Club pages and club websites.
- A new registration flow with ticket types, discount codes, merchandise add-ons and waiting lists.
- On events that review each registration, request a place and follow your request.
- Sign in with Google or email, see your tickets under My tickets, and follow clubs.
- Get updates from a club on WhatsApp if you opt in.
- Tickets in the club's own design, and a public certificate check at /verify.
- The live room on your phone, with quiz, Q&A and polls, and a team page for event competitions.
- Like and comment on club posts.
- For clubs and Pricing pages, a Support page, and About, Privacy and Terms pages.
- Faster pages that show up well in search and in link previews.
- Links that open the app on phones that have it.

### Fixed

- Start times show in India time.
- A revoked ticket never shows a QR code.
- Removing every add-on before paying no longer charges for them.

## Earlier

February to July 2026: the first event website. It had event pages, registration with online payment, tickets, and participation certificates. It moved to myotherapp.in in July 2026.
