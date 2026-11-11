/**
 * The words of the developer docs (/developers/...), page by page, from the
 * Integrations API contract (12 Nov 2026). Plain data: each page is an
 * intro and sections of blocks, and the addresses it quotes come from the
 * OpenAPI document (`api`: apiContext's), so a page never names an address
 * the API doesn't have.
 *
 * Blocks (rendered by src/components/developers/blocks.jsx):
 *   ["p", text]  ["h3", text, id?]  ["ul", [text…]]  ["ol", [text…]]
 *   ["code", lang, code, title?]  ["table", head, rows, caption?]
 *   ["note", text]  ["warn", text]  ["cards", [{title, text, href}]]
 *   ["downloads"]  ["diagram", "sync"]  ["scopes"]  ["webhook-types"]
 * Inside a text: `code`, **bold** and [label](href).
 */
import { CONTACT_EMAIL } from "@/config";
import {
  ERROR_EXAMPLE,
  PKCE_NODE,
  PKCE_PYTHON,
  RATE_LIMIT_EXAMPLE,
  SIGNATURE_HEADER,
  SIGNATURE_VECTOR,
  VERIFY_NODE,
  VERIFY_NODE_USE,
  VERIFY_PHP,
  VERIFY_PHP_USE,
  VERIFY_PYTHON,
  VERIFY_PYTHON_USE,
  WEBHOOK_BODY,
  etagExample,
  externalPaymentExample,
  idempotencyExample,
  oauthExamples,
  quickStart,
  updatedSinceExample,
} from "./examples";

const mail = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

/** The error codes: [code, HTTP status, what it means, what to do]. */
export const ERROR_CODES = [
  ["UNAUTHENTICATED", 401, "No key or token, or one that is wrong, revoked or expired; or the club disconnected your app.", "Check the key. A partner app: refresh the token, or ask the club to connect again."],
  ["FORBIDDEN_SCOPE", 403, "The key works but doesn't have the scope this needs (`details` names it).", "Ask the club for a key, or a connection, with that scope."],
  ["NOT_ALLOCATED", 403, "API access isn't turned on for this club, or was turned off.", `Ask the MyOtherApp team (${mail}).`],
  ["IP_NOT_ALLOWED", 403, "The key has a list of addresses it works from, and this call came from another.", "Call from an allowed address, or change the key's list in the dashboard."],
  ["CLUB_NOT_ACTIVE", 403, "The club is waiting for the MyOtherApp team's approval, or no longer exists.", "Wait for the approval (a club made with `POST /clubs`), or check the club."],
  ["APP_SUSPENDED", 403, "Your partner app is suspended by MyOtherApp.", `Write to ${mail}.`],
  ["PARTNER_MANAGED", 403, "The webhook endpoint belongs to a connected partner app: only that app manages it.", "Leave it to the app, or disconnect the app in the dashboard."],
  ["FORBIDDEN", 403, "Not allowed, for a reason with no code of its own (`message` says why).", "Read the message; ask the club or us if it's unclear."],
  ["NOT_FOUND", 404, "No such object, or not one you can see: another club's, or a test object asked for with a live key (and the other way round).", "Check the id, and whether you are in live or test mode."],
  ["METHOD_NOT_ALLOWED", 405, "That address doesn't take this method.", "Check the method in the [reference](/developers/reference)."],
  ["ALREADY_EXISTS", 409, "The `external_id` is already used for an object of this kind. `details.id` is that object.", "Use that object: it's the one you made before."],
  ["IDEMPOTENCY_IN_PROGRESS", 409, "A request with this Idempotency-Key (or this `external_id`) is still being answered.", "Wait a moment, then send it again with the same key."],
  ["PAYMENT_REQUIRED", 409, "A paid event: people pay on MyOtherApp's checkout (`details.checkout_url`), unless the event accepts registrations paid outside MyOtherApp.", "Send the person to the checkout address, or ask the club to turn that setting on."],
  ["EXTERNAL_PAYMENTS_OFF", 409, "You sent a `payment`, but this event doesn't accept registrations paid outside MyOtherApp.", "Ask the club to turn the setting on for the event, or send the person to its checkout."],
  ["CANCEL_IN_DASHBOARD", 409, "The event or registration has online payments: cancelling it is for the club, in its dashboard, where refunds are handled.", "Ask the club to cancel it in the dashboard."],
  ["EVENT_FULL", 409, "No places left.", "Tell the person. Places can free up when others cancel."],
  ["REGISTRATION_CLOSED", 409, "Registration isn't open: before `opens_at` or after `closes_at`.", "Check the event's registration dates."],
  ["ALREADY_REGISTERED", 409, "This person (by email) is already registered, or already has a request waiting for review. `details.id` is it.", "Use that registration."],
  ["ALREADY_CHECKED_IN", 409, "The person is already checked in, so this can't be done.", "If the check-in was a mistake, undo it first (`DELETE /checkins/{id}`)."],
  ["INVALID_STATE", 409, "The object isn't in a state that allows this: publishing an event that isn't a draft, say, or changing the club's profile in test mode.", "Read the object again and check its `status`."],
  ["EVENT_NOT_OPEN", 409, "The door isn't open for this event (a draft, or the club closed the door).", "Check the event; the club opens the door in the dashboard."],
  ["EVENT_CANCELLED", 409, "The event was cancelled, so it can't be changed.", "Nothing to retry."],
  ["EVENT_LOCKED", 409, "The event can't be changed this way any more (it is over, or locked by the club).", "Ask the club."],
  ["TICKET_REVOKED", 409, "The club revoked this ticket.", "Don't let it in; ask the club."],
  ["TICKET_TYPE_SOLD_OUT", 409, "That ticket type has no places left.", "Offer another ticket type."],
  ["TICKET_TYPE_NOT_ON_SALE", 409, "That ticket type isn't on sale now (before or after its sales dates, or hidden).", "Check `ticket_types` on the event."],
  ["LIMIT_REACHED", 409, "The club has as many webhook endpoints as it may have.", "Remove one you no longer use."],
  ["ENDPOINT_DISABLED", 409, "The webhook endpoint is turned off, so nothing can be sent to it.", "Turn it on again (`PATCH` with `enabled: true`), then send the delivery again."],
  ["CONFLICT", 409, "The request clashes with the object's state, for a reason with no code of its own (`message` says why).", "Read the object again and decide."],
  ["PRECONDITION_FAILED", 412, "`If-Match` didn't match: the object changed since you read it. Nothing was changed.", "Read it again, redo your change on the new version, and send it with the new ETag."],
  ["VALIDATION", 422, "A field is missing or wrong. `details.fields` names each one and why.", "Fix the request and send it again, with a new Idempotency-Key."],
  ["IDEMPOTENCY_MISMATCH", 422, "This Idempotency-Key was used in the last 24 hours for a different request.", "Make a new key for each new request."],
  ["TICKET_TYPE_REQUIRED", 422, "The event has ticket types: say which one with `ticket_type_id`.", "Send `ticket_type_id`."],
  ["TICKET_TYPE_NOT_FOUND", 422, "No such ticket type on sale for this event.", "Check `ticket_types` on the event."],
  ["DISCLOSURE_REQUIRED", 422, "`attendees:read` needs the club to confirm its registration form tells people their details are shared.", "The club confirms it when it gives the scope."],
  ["RATE_LIMITED", 429, "Too many requests this minute.", "Wait `Retry-After` seconds, then send it again. See [Rate limits](/developers/rate-limits)."],
  ["INTERNAL", 500, "Something went wrong on our side.", "Try again later with the same Idempotency-Key; tell us the `request_id` if it keeps happening."],
  ["WEBHOOKS_UNAVAILABLE", 503, "Webhooks aren't set up on our side yet.", `Write to ${mail}; nothing is wrong with your request.`],
];

/** Every page's intro and sections, by slug ("" is the overview). */
export function developerDocs(api) {
  const qs = quickStart(api.baseUrl);
  const oauth = oauthExamples(api);
  return {
    "": {
      intro: [
        [
          "p",
          "The Integrations API connects MyOtherApp to the systems clubs already use (a club's own website or ERP, another event tool, a college system) both ways. Publish an event, register someone, check them in or issue a certificate through the API, and it happens on MyOtherApp too. When it happens on MyOtherApp, we tell your system with a webhook, so it can do the same on its side.",
        ],
        ["downloads"],
      ],
      sections: [
        {
          id: "what-you-can-do",
          heading: "What you can do",
          blocks: [
            [
              "cards",
              [
                { title: "Events", text: "Create events as drafts, change them, publish them, cancel them.", href: "/developers/reference#tag-events" },
                { title: "Registrations", text: "Register people, change their answers, cancel registrations.", href: "/developers/reference#tag-registrations" },
                { title: "Check-ins", text: "Check people in at the door by ticket code, and undo a mistake.", href: "/developers/reference#tag-check-ins" },
                { title: "Certificates", text: "Issue certificates to everyone checked in, and read them back.", href: "/developers/reference#tag-certificates" },
                { title: "Webhooks", text: "Be told of every change, wherever it was made: dashboard, app, website or API.", href: "/developers/webhooks" },
                { title: "Partner apps", text: "One app for many clubs: each club connects it, and you can create clubs.", href: "/developers/authentication#partner-apps" },
              ],
            ],
          ],
        },
        {
          id: "two-ways-in",
          heading: "Two ways in",
          blocks: [
            [
              "ul",
              [
                "**Club API keys**, for a club's own systems. The club's owner or admin makes them in Club dashboard → Settings → Integrations, once API access is on for the club. A key belongs to one club and has its own scopes.",
                "**Partner apps**, for a platform that works with many clubs. The MyOtherApp team registers your app; each club connects it with OAuth 2.0 and chooses what it may do.",
              ],
            ],
            ["p", "Nothing is on by default: [Getting access](/developers/getting-access) explains how a club or a platform gets started. [Authentication](/developers/authentication) has the details of both."],
          ],
        },
        {
          id: "basics",
          heading: "The basics",
          blocks: [
            [
              "ul",
              [
                `Every address starts with \`${api.baseUrl}\`. HTTPS only.`,
                "JSON in and out. Send `Authorization: Bearer <key or token>` with every call.",
                "Ids are strings. Times are ISO 8601 with their offset (`2026-12-05T18:00:00+05:30`).",
                "Money is in paise, as a whole number, with `currency: \"INR\"`: ₹499 is `49900`.",
                "Lists come as `{\"data\": [...], \"next_cursor\": \"...\"}`. Send `?cursor=` with the next_cursor for the next page, up to `limit=100` at a time (25 if you don't say). The last page's next_cursor is null.",
                "Every answer has an `X-Request-Id` header. Quote it when you ask us about a call.",
              ],
            ],
          ],
        },
        {
          id: "versions",
          heading: "Versions",
          blocks: [
            [
              "p",
              "This is v1, a separate surface made for other systems. The `/api/v1` our own apps use is not part of it, and may change any day: don't build on it.",
            ],
            [
              "p",
              "v1 only grows. We add endpoints, fields, webhook types, scopes and error codes; we never remove or rename one. So ignore fields you don't know, and treat an error code you don't know by its HTTP status. A change that would break your code comes as v2, and v1 keeps working for six months after v2 arrives. Every change is in the [changelog](/developers/changelog).",
            ],
          ],
        },
        {
          id: "openapi",
          heading: "OpenAPI and Postman",
          blocks: [
            ["p", `The API describes itself in an OpenAPI 3.1 document at \`${api.openapiUrl}\` (public: no key needed). The [API reference](/developers/reference) here is made from it. Download it, or a Postman collection made from it, to generate a client or try calls:`],
            ["downloads"],
          ],
        },
        {
          id: "help",
          heading: "Help",
          blocks: [["p", `Write to us at ${mail}. For a call that went wrong, send its \`request_id\` (the \`X-Request-Id\` header): we can find exactly what happened.`]],
        },
      ],
    },

    "getting-access": {
      intro: [["p", "Nothing is on by default. The MyOtherApp team turns the API on for each club, and registers each partner app. Here is how that works, and what to send us."]],
      sections: [
        {
          id: "for-a-club",
          heading: "For a club's own systems",
          blocks: [
            [
              "ol",
              [
                `Write to us at ${mail}, from the club owner's or an admin's email address: which club, what you want to connect (your website, an ERP, a college system), and what it will do.`,
                "We turn on API access for the club, with a rate tier (standard: 600 reads and 120 writes a minute; high: five times that) and how many keys it may have (5, unless we agree more).",
                "**Settings → Integrations** appears in the club's dashboard, for the owner and admins. Make a key there: give it a name, choose live or test, tick the scopes it needs and, if you like, an expiry date and the IP addresses it may be used from.",
                "Copy the key when it is shown. We keep only a fingerprint of it, so we can never show it again; if it's lost, rotate it.",
              ],
            ],
            ["p", "Start with a test key: see [Test mode](/developers/test-mode), then the [Quick start](/developers/quick-start)."],
          ],
        },
        {
          id: "for-a-platform",
          heading: "For a platform (partner apps)",
          blocks: [
            ["p", "If you build a product many clubs use (an event tool, a college system, a CRM), register a partner app instead of asking each club for a key. Only the MyOtherApp team registers partner apps: there is no sign-up form."],
            [
              "ol",
              [
                "Write to us with your platform's name, logo and website, the redirect URIs your app will use (https), and the scopes you need, with a line on why for each.",
                "We register the app and decide which scopes it may ever ask for (`clubs:create`, to create clubs, only when we agree it's needed). You get a **client id** and a **client secret**. The secret is shown once.",
                "Each club connects your app: its owner or admin follows your \"Connect MyOtherApp\" link, signs in, chooses the club and the scopes, and allows it. A club can disconnect you at any time; your tokens for it stop working at once.",
              ],
            ],
            ["p", "The club needs API access turned on as well. How the connection works is in [Authentication](/developers/authentication#partner-apps)."],
          ],
        },
        {
          id: "what-we-look-at",
          heading: "What we look at",
          blocks: [
            [
              "ul",
              [
                "What the integration does, and for which clubs.",
                "The scopes: the fewest that do the job. `attendees:read` (names, contact details, answers) only where you need it; the club must also confirm its registration form tells people their details are shared with you. See [Money and personal data](/developers/money-and-personal-data#personal-data).",
                "Roughly how many calls you'll make, so we set the right rate tier.",
              ],
            ],
          ],
        },
        {
          id: "plans",
          heading: "Plans",
          blocks: [["p", "For now, API access is given by the MyOtherApp team, not by a plan: no plan includes it yet. If it comes with a plan later, a club that already has access keeps it. The team's grant always wins."]],
        },
        {
          id: "keys-and-connections",
          heading: "Keys and connections",
          blocks: [
            [
              "ul",
              [
                "A club has up to 5 keys, unless we agree more.",
                "Each key has its own name, scopes, live or test, and optionally an expiry date and the IP addresses it works from. The dashboard shows when each was last used.",
                "Revoke a key and it stops working at once. Rotate it to get a new one in its place.",
                "If API access is turned off for a club, its keys and connections get `403 NOT_ALLOCATED` until it is on again.",
              ],
            ],
          ],
        },
      ],
    },

    "quick-start": {
      intro: [
        [
          "p",
          "Five steps with curl, from nothing to a webhook arriving. Use a **test key** (`moa_test_…`): test events are hidden from the public, nobody gets an email, and nothing is paid.",
        ],
      ],
      sections: [
        {
          id: "before-you-start",
          heading: "Before you start",
          blocks: [
            [
              "ul",
              [
                "API access is on for your club ([Getting access](/developers/getting-access)), and you have made a **test** key in Club dashboard → Settings → Integrations with these scopes: `events:write`, `events:publish`, `registrations:write`, `checkins:write` and `webhooks:manage`.",
                "curl, and `uuidgen` for Idempotency-Keys (macOS and Linux have it; any unique string will do).",
              ],
            ],
            ["code", "bash", qs.env],
          ],
        },
        {
          id: "check-your-key",
          heading: "1. Check your key",
          blocks: [
            ["code", "bash", qs.me],
            ["p", "You get back who you are:"],
            ["code", "json", qs.meAnswer],
            ["p", "`livemode: false` means a test key. A `401` means the key is wrong or revoked; a `403 NOT_ALLOCATED` means API access isn't on for the club yet."],
          ],
        },
        {
          id: "create-an-event",
          heading: "2. Create an event, and publish it",
          blocks: [
            ["p", "Events start as drafts. The `Idempotency-Key` makes the call safe to send again; `external_id` is your own id for the event (see [Syncing both ways](/developers/sync#external-ids))."],
            ["code", "bash", qs.createEvent],
            ["p", "`201 Created`, with the event's `id`:"],
            ["code", "json", qs.createEventAnswer],
            ["p", "Publish it, and registration opens. (A test event stays hidden from the public.)"],
            ["code", "bash", qs.publish],
          ],
        },
        {
          id: "register-someone",
          heading: "3. Register someone",
          blocks: [
            ["code", "bash", qs.register],
            ["code", "json", qs.registerAnswer],
            [
              "p",
              "The event's own rules apply, as when the club adds someone: its questions, capacity, ticket types and dates. With a live key, Asha would get her ticket by email (`send_confirmation` is true unless you say otherwise); test mode sends nothing. For an event where the club confirms each registration, the answer is `202` with `status: \"pending_approval\"`. A paid event answers `409 PAYMENT_REQUIRED`: see [Money and personal data](/developers/money-and-personal-data#money).",
            ],
          ],
        },
        {
          id: "check-them-in",
          heading: "4. Check them in",
          blocks: [
            ["code", "bash", qs.checkin],
            ["code", "json", qs.checkinAnswer],
            ["p", "Scan the same ticket again and you get `200` with `\"duplicate\": true` and the first check-in: never two. Undo a mistake with `DELETE /checkins/90211`."],
          ],
        },
        {
          id: "receive-a-webhook",
          heading: "5. Receive a webhook",
          blocks: [
            ["p", "Tell us where to send changes: an https address on the public internet."],
            ["code", "bash", qs.endpoint],
            ["code", "json", qs.endpointAnswer],
            ["warn", "The `secret` is shown only now. Keep it with your server's secrets: it is how you know a webhook came from us."],
            ["p", "Send a test webhook to it. It is sent at once, and the answer says how your endpoint answered:"],
            ["code", "bash", qs.test],
            ["code", "json", qs.testAnswer],
            ["p", "From then on, each change your endpoint asked for arrives as a POST like this:"],
            ["code", "http", qs.received],
            ["p", "Check the `MOA-Signature` header with the secret before you trust the body (code for Node, Python and PHP is in [Webhooks](/developers/webhooks#verifying-signatures)), answer `200` within 10 seconds, and you're done."],
          ],
        },
        {
          id: "next-steps",
          heading: "Next",
          blocks: [
            [
              "ul",
              [
                "[Authentication](/developers/authentication): keys, and partner apps with OAuth.",
                "[Webhooks](/developers/webhooks): every type, retries and replays.",
                "[Syncing both ways](/developers/sync): keep your system and MyOtherApp in step without loops.",
                "[API reference](/developers/reference): every endpoint.",
              ],
            ],
          ],
        },
      ],
    },

    authentication: {
      intro: [
        ["p", "Every call sends a key or a token in the `Authorization` header:"],
        ["code", "http", "Authorization: Bearer moa_live_…"],
        ["p", "There are two kinds: **club API keys**, for a club's own systems, and **access tokens** for partner apps, which act for the clubs that connect them."],
      ],
      sections: [
        {
          id: "api-keys",
          heading: "Club API keys",
          blocks: [
            [
              "ul",
              [
                "Made by the club's owner or an admin in Club dashboard → Settings → Integrations, once [API access is on](/developers/getting-access) for the club.",
                "A key is `moa_live_` or `moa_test_` and 40 random characters. Live keys work on real events and people; test keys only on test objects ([Test mode](/developers/test-mode)).",
                "Shown once. We keep only a SHA-256 fingerprint of it, so nobody (us included) can show it again.",
                "Each key has its own scopes, and may have an expiry date and a list of IP addresses it works from; a call from anywhere else gets `403 IP_NOT_ALLOWED`.",
                "Revoke a key and it stops at once. Rotate it to replace it with a new one.",
              ],
            ],
            ["h3", "Keeping keys secret"],
            [
              "ul",
              [
                "Use keys from your server only: never in a web page, a mobile app or a public repository.",
                "One key for each system, with only the scopes it needs, so you can revoke one without stopping the others.",
                "If a key leaks, revoke it in the dashboard straight away and make a new one.",
              ],
            ],
          ],
        },
        {
          id: "partner-apps",
          heading: "Partner apps (OAuth 2.0)",
          blocks: [
            [
              "p",
              "A partner app acts for many clubs. Each club connects it with OAuth 2.0's authorisation code flow, with PKCE and refresh tokens. The MyOtherApp team registers your app ([Getting access](/developers/getting-access#for-a-platform)): you have a client id, a client secret and your registered redirect URIs.",
            ],
            [
              "table",
              ["Endpoint", "Address"],
              [
                ["Authorisation", `\`${api.authorizeUrl}\``],
                ["Token (and refresh)", `\`${api.tokenUrl}\``],
                ["Revocation", `\`${api.revokeUrl}\``],
              ],
              "The partner OAuth addresses",
            ],
            ["h3", "1. Send the club to us", "oauth-authorize"],
            [
              "p",
              "Make a PKCE pair: a random **verifier** you keep, and its **challenge** you send (the verifier's SHA-256, in base64url without padding). Make a random `state` too, and keep it with the verifier.",
            ],
            ["code", "js", PKCE_NODE, "Node.js"],
            ["code", "python", PKCE_PYTHON, "Python"],
            ["p", "Then send the club's owner or admin to the authorisation address (shown on several lines here; it is one URL):"],
            ["code", "text", oauth.authorize],
            ["p", "`scope` is a space-separated list of the scopes you need, from those your app is allowed. `code_challenge_method` must be `S256`, and `redirect_uri` exactly one you registered. Add `mode=test` for a test connection, whose tokens see only test objects ([Test mode](/developers/test-mode))."],
            ["h3", "2. They choose and allow", "oauth-consent"],
            [
              "p",
              "They sign in to the club dashboard, choose the club, see the scopes in plain words (and may untick some), and press Allow. For `attendees:read`, the club must also confirm its registration form tells people their details are shared with your app.",
            ],
            ["h3", "3. They come back with a code", "oauth-callback"],
            ["code", "text", oauth.callback],
            ["p", "Check that `state` is the one you made. If they said no, you get `error=access_denied` instead of a code. A code works once, and only for a few minutes."],
            ["h3", "4. Swap the code for tokens", "oauth-token"],
            ["code", "bash", oauth.exchange],
            ["p", "Send your client id and secret with HTTP Basic, as here, or as `client_id` and `client_secret` in the form. You get:"],
            ["code", "json", oauth.tokens],
            ["p", "Call the API with the access token, as you would with a key. `GET /me` tells you which club it is for. Keep tokens per club: each connection has its own."],
            ["h3", "5. Refresh", "oauth-refresh"],
            ["p", "Access tokens expire after `expires_in` seconds. Get a new pair with the refresh token:"],
            ["code", "bash", oauth.refresh],
            ["p", "Each refresh gives a new refresh token: save it and drop the old one. A refresh token works once; never send one twice."],
            ["h3", "Disconnecting", "oauth-revoke"],
            ["p", "When a club disconnects on your side, revoke its refresh token: that ends the connection."],
            ["code", "bash", oauth.revoke],
            ["p", "A club can also disconnect your app in its dashboard at any time. Your tokens for it stop working at once, and calls get `401 UNAUTHENTICATED`: ask them to connect again."],
            ...(api.clientCredentials
              ? [
                  ["h3", "Your app's own calls", "app-token"],
                  [
                    "p",
                    "Two calls are about your app rather than one club: `GET /clubs` (the clubs connected to your app) and `POST /clubs` (create a club; needs `clubs:create`). Make them with your app's own token, from the client credentials grant:",
                  ],
                  ["code", "bash", oauth.appToken],
                  ["p", "A club made with `POST /clubs` waits for the MyOtherApp team's approval; the answer carries your app's connection to it, whose tokens work once the club is approved (until then, `403 CLUB_NOT_ACTIVE`)."],
                ]
              : []),
          ],
        },
        {
          id: "who-am-i",
          heading: "Checking a key or token",
          blocks: [["p", "`GET /me` works with any key or token, whatever its scopes. It tells you its type, its club, the partner app, its scopes, live or test, and your rate limits. Call it when you set up, and when a call is refused."]],
        },
        {
          id: "when-it-fails",
          heading: "When it fails",
          blocks: [
            [
              "table",
              ["Status", "Code", "What it means"],
              [
                ["401", "`UNAUTHENTICATED`", "No key or token, or a wrong, revoked or expired one; or the club disconnected your app."],
                ["403", "`FORBIDDEN_SCOPE`", "The key works, but doesn't have the scope this needs."],
                ["403", "`NOT_ALLOCATED`", "API access is off for the club."],
                ["403", "`IP_NOT_ALLOWED`", "The key doesn't work from this address."],
                ["403", "`APP_SUSPENDED`", "Your partner app is suspended."],
                ["403", "`CLUB_NOT_ACTIVE`", "The club is waiting for approval, or no longer exists."],
              ],
            ],
          ],
        },
      ],
    },

    scopes: {
      intro: [["p", "Each key and each partner connection has scopes: what it may do. Ask for the fewest that do the job. Seeing who people are (names, contact details, answers) is a scope of its own, `attendees:read`."]],
      sections: [
        { id: "every-scope", heading: "Every scope", blocks: [["scopes"]] },
        {
          id: "choosing",
          heading: "Choosing scopes",
          blocks: [
            [
              "ul",
              [
                "A write scope reads too: `events:write` can also read events, `registrations:write` registrations, and so on. The reference says, for each endpoint, which scopes will do.",
                "`events:publish` (publish and cancel) is apart from `events:write`, so a system can prepare drafts that a person checks and publishes.",
                "`registrations:read` shows registrations without who they are: status, ticket, payment status, check-in. Add `attendees:read` for names, email addresses, phone numbers and answers.",
                "Webhooks follow the same rule: contact fields reach an endpoint only when it may have them (see [Webhooks](/developers/webhooks#sharing)).",
                "`clubs:create` is for partner apps only, and only when the MyOtherApp team grants it.",
              ],
            ],
          ],
        },
        {
          id: "attendees-read",
          heading: "attendees:read needs the club's say-so",
          blocks: [
            [
              "p",
              "A club can give `attendees:read` to a key or a partner app only after ticking **\"Our registration form tells people their details are shared with <name>\"**. Without the scope, names, contact details and answers are left out of every answer and webhook (the fields are missing, not empty). Every read of attendees' details through the API is counted in the club's audit log. More in [Money and personal data](/developers/money-and-personal-data#personal-data).",
            ],
          ],
        },
        {
          id: "partner-app-scopes",
          heading: "Partner apps",
          blocks: [
            [
              "p",
              "When we register your app, we decide which scopes it may ever ask for. When a club connects it, the club chooses which of those to give. A call that needs a scope you weren't given gets `403 FORBIDDEN_SCOPE`; to ask for more, send the club through the [authorisation address](/developers/authentication#oauth-authorize) again with the new `scope`.",
            ],
          ],
        },
      ],
    },

    reference: {
      intro: [
        ["p", `Every endpoint, made from the API's OpenAPI document. Every address starts with \`${api.baseUrl}\`; every call sends \`Authorization: Bearer <key or token>\`. The objects the calls take and return are described [at the end](#objects).`],
        ["downloads"],
      ],
      sections: [],
    },

    webhooks: {
      intro: [
        [
          "p",
          "Webhooks tell your system when something changes on MyOtherApp, whoever changed it: the club's team in the dashboard, someone registering on the website or in the app, another system through the API, or MyOtherApp itself (a certificate job, say). We POST a JSON body to your https endpoint, signed with the endpoint's secret.",
        ],
      ],
      sections: [
        {
          id: "endpoints",
          heading: "Adding an endpoint",
          blocks: [
            ["p", "Add one in Club dashboard → Settings → Integrations, or through the API with the `webhooks:manage` scope:"],
            ["code", "bash", qs.endpoint],
            [
              "ul",
              [
                "`url`: https, and its host on the public internet. We refuse private and local addresses.",
                "`events`: the types you want, or `[\"*\"]` for all of them, including types we add later (all, if you leave it out). `GET /webhook-event-types` lists them.",
                "`include_own_changes`: off unless you turn it on. See [no echo](/developers/sync#no-echo).",
                "An endpoint is live or test, and gets only the changes of its own mode. One added with a key takes the key's mode.",
                "The answer has the endpoint's signing `secret` (`whsec_…`), shown only this once. Lost it? Rotate it: `POST /webhook-endpoints/{id}/rotate-secret`.",
                "A club can have a limited number of endpoints (`409 LIMIT_REACHED` past it).",
              ],
            ],
            ["h3", "Names and contact details in webhooks", "sharing"],
            [
              "p",
              "Registrations and certificates carry people's names, contact details and answers only when the endpoint may have them. A club key's endpoint: add it with `share_attendee_details: true` and `dpdp_confirmed: true` (the club confirms its registration form tells people their details are shared with that system), from a key with `attendees:read`. A partner app's endpoints: when its connection to the club has `attendees:read`. Otherwise those fields are left out.",
            ],
          ],
        },
        { id: "types", heading: "Event types", blocks: [["webhook-types"]] },
        {
          id: "payload",
          heading: "The payload",
          blocks: [
            ["p", "Every webhook has the same shape:"],
            ["code", "json", WEBHOOK_BODY],
            [
              "ul",
              [
                "`id`: the webhook's own id, also sent as the `MOA-Event-Id` header.",
                "`type`, `created_at`, `club_id`, and `livemode` (false for test objects).",
                "`origin`: where the change came from: `dashboard`, `app`, `website`, `api_key`, `partner_app` or `system`, with the key's or app's `client_id` for the two API ones.",
                "`data.object`: the object as it is now, in exactly the shape its GET returns.",
                "`data.previous`: for an `*.updated` type, the fields that changed, as they were.",
                "Names, contact details and answers only when the endpoint may have them ([see above](#sharing)). `payment.*` webhooks carry amounts and status only.",
                "`data.object.external_id` is your own id for the object, when the endpoint is yours: each key or app sees its own.",
              ],
            ],
            ["h3", "Headers"],
            [
              "table",
              ["Header", "What it holds"],
              [
                ["`Content-Type`", "`application/json`"],
                ["`MOA-Signature`", "`t=<unix seconds>,v1=<signature>`: see below."],
                ["`MOA-Event-Id`", "The webhook's id (`evt_…`), the same as the body's `id`."],
                ["`MOA-Event-Type`", "The webhook's type, the same as the body's `type`."],
                ["`MOA-Delivery-Id`", "This delivery, as the delivery log names it."],
                ["`MOA-Delivery-Attempt`", "Which try this is: 1 the first time."],
              ],
            ],
          ],
        },
        {
          id: "verifying-signatures",
          heading: "Verifying signatures",
          blocks: [
            ["p", "Anyone can POST to your endpoint, so check every webhook before you trust it. The header looks like this:"],
            ["code", "http", `MOA-Signature: ${SIGNATURE_HEADER}`],
            [
              "ol",
              [
                "Read the body **exactly as it arrived**, as bytes, before parsing it. Parsing and re-encoding the JSON changes it, and the signature won't match.",
                "Split the header on commas. Take `t` (a Unix time, in seconds) and every `v1`.",
                "Refuse the webhook if `t` is more than 5 minutes away from your clock, so an old one can't be replayed at you.",
                "Compute the HMAC-SHA256 of `t`, a full stop and the raw body (`\"<t>.<raw body>\"`), keyed with your endpoint's whole secret (`whsec_` included), as lowercase hex.",
                "Compare it with each `v1` in constant time. Accept the webhook if one matches.",
              ],
            ],
            ["p", "The same recipe in three languages. Each is tested against the example at the end of this section."],
            ["h3", "Node.js", "verify-node"],
            ["code", "js", VERIFY_NODE, "verify-moa-signature.mjs"],
            ["code", "js", VERIFY_NODE_USE, "Using it with Express"],
            ["h3", "Python", "verify-python"],
            ["code", "python", VERIFY_PYTHON, "verify_moa_signature.py"],
            ["code", "python", VERIFY_PYTHON_USE, "Using it with Flask"],
            ["h3", "PHP", "verify-php"],
            ["code", "php", VERIFY_PHP, "verify_moa_signature.php"],
            ["code", "php", VERIFY_PHP_USE, "Using it in a plain PHP endpoint"],
            ["h3", "Check your code", "signature-example"],
            ["p", "With this secret and body, at this time, your code must accept the header, and refuse it once the body changes by a single character."],
            [
              "table",
              ["", "Value"],
              [
                ["Secret", `\`${SIGNATURE_VECTOR.secret}\``],
                ["Time (`t`)", `\`${SIGNATURE_VECTOR.timestamp}\` (12 Nov 2026, 10:15:02 IST)`],
                ["Header", `\`${SIGNATURE_HEADER}\``],
              ],
            ],
            ["code", "json", SIGNATURE_VECTOR.body, "Body (exactly these bytes, no newline at the end)"],
          ],
        },
        {
          id: "answering",
          heading: "Answering",
          blocks: [
            [
              "ul",
              [
                "Answer with any 2xx within 10 seconds. Anything else (another status, no answer in time) counts as failed, and we try again.",
                "Answer first, then do the work: put the webhook on a queue and handle it after.",
                "We don't follow redirects: give us the final address.",
              ],
            ],
          ],
        },
        {
          id: "retries",
          heading: "Retries",
          blocks: [
            ["p", "A failed delivery is tried again after 1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours, 12 hours and 24 hours. After the eighth try it has failed; you can still send it again by hand (below)."],
            ["p", "In the delivery log, a delivery is `pending` (not tried yet), `retrying` (failed, to be tried again at `next_attempt_at`), `succeeded` or `failed`."],
            [
              "p",
              "An endpoint that keeps failing for 3 days in a row is disabled, and we email the club's owner (or, for a partner app's endpoint, the partner). Turn it on again in the dashboard or with `PATCH /webhook-endpoints/{id}` and `{\"status\": \"enabled\"}`, then replay what it missed.",
            ],
          ],
        },
        {
          id: "replay",
          heading: "Replaying",
          blocks: [
            [
              "p",
              "Every delivery is kept for 30 days, with your endpoint's status code and the start of its answer: see them in the dashboard, or with `GET /webhook-endpoints/{id}/deliveries`. Send any one again (the same id and body, with a new signature) with the dashboard's Replay button or `POST /webhook-deliveries/{id}/retry`.",
            ],
            ["p", "Missed more than that? Catch up with `updated_since` instead: see [Syncing both ways](/developers/sync#updated-since)."],
          ],
        },
        {
          id: "ordering",
          heading: "Order",
          blocks: [
            [
              "p",
              "We send each object's webhooks in order as far as we can: a webhook waits a few seconds while an older change to the same object is still on its way to you. But a retry can still bring an old one after a newer one. Don't trust the order they arrive in: compare `data.object.updated_at` with the copy you have, and ignore one that is older. When in doubt, read the object again with its GET.",
            ],
          ],
        },
        {
          id: "duplicates",
          heading: "Duplicates",
          blocks: [
            [
              "p",
              "Delivery is at least once: a webhook can come twice (when your 200 is lost on its way back, say). Keep the ids (`MOA-Event-Id`) you have handled for a few days, and skip one you have seen. A replay has the same id.",
            ],
          ],
        },
        {
          id: "testing",
          heading: "Testing",
          blocks: [
            [
              "ul",
              [
                "`POST /webhook-endpoints/{id}/test` sends a signed `webhook.test` at once and answers with how your endpoint answered (`ok`, and the delivery). A test never counts towards turning an endpoint off.",
                "Changes made with a test key send webhooks with `livemode: false`: check `livemode` before you touch real records.",
                "Your endpoint must be on the public internet. To test on your own machine, use a tunnel.",
              ],
            ],
          ],
        },
        {
          id: "rotating",
          heading: "Rotating the secret",
          blocks: [
            [
              "p",
              "`POST /webhook-endpoints/{id}/rotate-secret` (or the dashboard) gives a new secret, shown once. For a while the old one signs too: for 24 hours unless you send `keep_previous_hours` (0 to 72), every `MOA-Signature` carries two `v1` values, one for each secret. The code above accepts any matching `v1`, so put the new secret in place whenever you are ready within that time.",
            ],
          ],
        },
      ],
    },

    sync: {
      intro: [
        [
          "p",
          "Two systems, one set of events and people. The API carries your changes to MyOtherApp; webhooks carry MyOtherApp's changes to you. Five tools keep the two in step, without duplicates, lost changes or loops.",
        ],
      ],
      sections: [
        {
          id: "the-whole-picture",
          heading: "The whole picture",
          blocks: [["diagram", "sync"]],
        },
        {
          id: "external-ids",
          heading: "External ids",
          blocks: [
            ["p", "Every object you can create takes an `external_id`: your own id for it, up to 128 characters, unique among your objects of that kind. So:"],
            [
              "ul",
              [
                "Find an object by your id: `GET /events?external_id=erp-ev-2026-114`.",
                "Create safely: a POST with an `external_id` you already used answers `409 ALREADY_EXISTS`, with the existing object's id in `error.details.id`. No duplicate is made: treat it as done, and keep the id.",
                "Webhooks carry it in `data.object.external_id`, so you can match a change to your record.",
              ],
            ],
            ["p", "Keep our `id` beside yours too: our ids never change."],
          ],
        },
        {
          id: "updated-since",
          heading: "Catching up with updated_since",
          blocks: [
            ["p", "Every object has an `updated_at`. Lists take `updated_since` and return everything changed at or after that time, page by page:"],
            ["code", "bash", updatedSinceExample(api.baseUrl)],
            [
              "ul",
              [
                "Keep the newest `updated_at` you have seen, and start the next catch-up from there.",
                "Overlap a little (a minute, say) and skip what you already have: two changes can share a second.",
                "Run a catch-up on a timer (every 15 minutes, say) as well as taking webhooks. It finds anything a webhook didn't bring, such as while your endpoint was down.",
              ],
            ],
          ],
        },
        {
          id: "etags",
          heading: "Changing safely with ETags",
          blocks: [
            [
              "p",
              "Every object has a version, sent as its `ETag` header. Send it back as `If-Match` with a PATCH, and the change is made only if nobody has changed the object since you read it. Otherwise you get `412 PRECONDITION_FAILED`, and nothing changes.",
            ],
            ["code", "bash", etagExample(api.baseUrl)],
            ["p", "On a 412: read the object again, work your change out again on the new version (or ask a person), and send it with the new ETag. Without `If-Match`, the last change wins."],
          ],
        },
        {
          id: "no-echo",
          heading: "No echo",
          blocks: [
            [
              "p",
              "A change you make through the API is not sent back to your own endpoints. Otherwise your update would come back to you as `event.updated`, you'd write it to us again, and round it would go.",
            ],
            [
              "ul",
              [
                "Every change carries where it came from: a webhook's `origin` is `api_key` or `partner_app`, with the `client_id` of the key or app that made it.",
                "Endpoints that belong to that same key or app don't get it, unless the endpoint has `include_own_changes` turned on (to log everything, say).",
                "Every other endpoint does: another system of the same club, or another partner app it connected.",
                "Changes from the dashboard, the app, the website or MyOtherApp itself (`origin.type` `dashboard`, `app`, `website` or `system`) always come to you.",
              ],
            ],
          ],
        },
        {
          id: "recipe",
          heading: "A recipe",
          blocks: [
            [
              "ol",
              [
                "Create on MyOtherApp with your `external_id` and an `Idempotency-Key`. Keep our `id`.",
                "Take webhooks for what changes on MyOtherApp: check the signature, skip ids you've handled, and skip anything older than what you have (`updated_at`).",
                "Send your changes with `If-Match`. On a 412, read again and decide.",
                "Catch up with `updated_since` every so often.",
                "Never write back what a webhook just told you: it's already true on our side.",
              ],
            ],
          ],
        },
      ],
    },

    idempotency: {
      intro: [
        [
          "p",
          "Networks fail halfway. With an `Idempotency-Key` header, a POST or DELETE you send again (after a timeout, a dropped connection or a 5xx) is done only once, and you get the same answer back.",
        ],
      ],
      sections: [
        {
          id: "how-it-works",
          heading: "How it works",
          blocks: [
            [
              "ul",
              [
                "Send `Idempotency-Key: <a unique string>` with any POST or DELETE: up to 255 characters, and a random UUID is best.",
                "We keep the key, and the first answer to it, for 24 hours, for your key or app. (Another key's identical string is a different key.)",
                "Send the same request with the same key again and you get the first answer back: the same status and body. Nothing is done twice.",
                "Use the same key with a different request (another address or body) and you get `422 IDEMPOTENCY_MISMATCH`. Make a new key for each new request.",
                "While the first request with a key is still being answered, the same key again gets `409 IDEMPOTENCY_IN_PROGRESS`: wait a moment and send it again.",
                "GET and PATCH don't need a key: sending them twice does no harm.",
              ],
            ],
          ],
        },
        { id: "example", heading: "Example", blocks: [["code", "bash", idempotencyExample(api.baseUrl)]] },
        {
          id: "when-to-retry",
          heading: "When to try again",
          blocks: [
            [
              "table",
              ["What happened", "Try again?", "How"],
              [
                ["No answer: a timeout, or the connection dropped", "Yes", "The same request, the same key."],
                ["A 5xx", "Yes, after a pause", "The same request, the same key."],
                ["`429 RATE_LIMITED`", "Yes, after `Retry-After` seconds", "The same request, the same key."],
                ["Any other 4xx", "No: that answer is final", "Fix the request, then send it with a new key."],
              ],
            ],
            ["p", "Wait longer each time: 1 second, then 2, 4, 8 and so on up to a minute, with a little randomness so many clients don't try at the same moment."],
          ],
        },
        {
          id: "with-external-ids",
          heading: "With external ids",
          blocks: [
            [
              "p",
              "The two work together. The key makes one request safe to send again for 24 hours; an `external_id` keeps the object unique for good. Send a create again after 24 hours, and its `external_id` still stops a duplicate (`409 ALREADY_EXISTS`).",
            ],
          ],
        },
      ],
    },

    errors: {
      intro: [
        ["p", "An error comes with its HTTP status and a body in one shape:"],
        ["code", "http", ERROR_EXAMPLE],
      ],
      sections: [
        {
          id: "the-shape",
          heading: "The shape",
          blocks: [
            [
              "ul",
              [
                "`code`: what went wrong, for your code to act on.",
                "`message`: what went wrong, for a developer. Don't show it to people as it is.",
                "`details`: more about it, for some codes: the fields that failed, the existing object's `id`, the checkout address.",
                "`request_id`: the same as the `X-Request-Id` header. Quote it when you write to us.",
              ],
            ],
          ],
        },
        {
          id: "codes",
          heading: "Codes",
          blocks: [["table", ["Code", "Status", "What it means", "What to do"], ERROR_CODES.map(([code, status, means, todo]) => [`\`${code}\``, String(status), means, todo]), "Every error code"]],
        },
        {
          id: "new-codes",
          heading: "Codes we add later",
          blocks: [["p", "We may add codes to v1. Handle one you don't know by its HTTP status: a 4xx means change the request; a 5xx means try again later, with the same Idempotency-Key."]],
        },
        {
          id: "server-errors",
          heading: "When it's us",
          blocks: [["p", `A 500, 502, 503 or 504 is our problem, not yours. Try again with a growing pause and the same Idempotency-Key. If it keeps happening, write to ${mail} with the \`request_id\`.`]],
        },
      ],
    },

    "rate-limits": {
      intro: [["p", "Each club's API access has a rate tier. Reads (GET) and writes (everything else) are counted apart, a minute at a time."]],
      sections: [
        {
          id: "tiers",
          heading: "Tiers",
          blocks: [
            [
              "table",
              ["Tier", "Reads a minute", "Writes a minute"],
              [
                ["Standard", "600", "120"],
                ["High", "3,000", "600"],
              ],
            ],
            ["p", `Your limits are in \`GET /me\` (\`rate_limit\`). Need more? Write to ${mail}: the MyOtherApp team sets the tier.`],
          ],
        },
        {
          id: "headers",
          heading: "Headers",
          blocks: [
            ["p", "Every answer tells you where you stand:"],
            [
              "table",
              ["Header", "What it says"],
              [
                ["`X-RateLimit-Limit`", "Your limit a minute, for this kind of request (read or write)."],
                ["`X-RateLimit-Remaining`", "How many are left this minute."],
                ["`X-RateLimit-Reset`", "When the count starts again, as a Unix time in seconds."],
              ],
            ],
            ["code", "http", RATE_LIMIT_EXAMPLE],
          ],
        },
        {
          id: "when-limited",
          heading: "When you hit it",
          blocks: [
            [
              "ul",
              [
                "You get `429` with `RATE_LIMITED` and a `Retry-After` header, in seconds. Wait that long, then send the same request again (with the same Idempotency-Key).",
                "Don't try again at once in a loop: it uses up the next minute too.",
                "Spread big jobs out: watch `X-RateLimit-Remaining`, and slow down as it nears zero.",
              ],
            ],
          ],
        },
        {
          id: "fewer-calls",
          heading: "Making fewer calls",
          blocks: [
            [
              "ul",
              [
                "Take webhooks instead of asking every few seconds.",
                "Read only what changed, with `updated_since`.",
                "Ask for 100 at a time (`limit=100`).",
                "A busy door: one call per scan is fine at the standard tier's 120 writes a minute. For several gates at a big event, ask us for the high tier before the day.",
              ],
            ],
          ],
        },
      ],
    },

    "test-mode": {
      intro: [["p", "Build and test against MyOtherApp without touching real events, real people or real money."]],
      sections: [
        {
          id: "test-keys",
          heading: "Test keys",
          blocks: [
            [
              "ul",
              [
                "A `moa_test_` key sees and changes only test objects: the ones made with test keys. They have `livemode: false`.",
                "A `moa_live_` key never sees test objects (a test object's id gives it `404`), and a test key never sees live ones.",
                "`GET /me` says which you have: `livemode`.",
                "Partner apps: add `mode=test` to the [authorisation address](/developers/authentication#oauth-authorize) for a test connection; its tokens work the same way.",
                "The club's profile is the real one in test mode too: change it (`PATCH /club`) with a live key.",
              ],
            ],
          ],
        },
        {
          id: "what-test-objects-do",
          heading: "What test objects do, and don't",
          blocks: [
            [
              "ul",
              [
                "Test events are hidden from the public: not on myotherapp.in, not in search, lists or sitemaps.",
                "Nobody gets an email, a WhatsApp message or a push notification about them.",
                "No payments: a paid test event never opens a checkout.",
                "Webhooks are sent for them as for live objects, with `livemode: false`, to test endpoints: an endpoint added with a test key is one.",
                "Otherwise they behave like live ones: capacity, questions, approvals, check-ins, errors and rate limits all apply, so your tests mean something.",
              ],
            ],
          ],
        },
        {
          id: "going-live",
          heading: "Going live",
          blocks: [
            [
              "ol",
              [
                "Make a live key with the same scopes, in Club dashboard → Settings → Integrations.",
                "Swap the key. Nothing else changes: the same addresses, the same calls.",
                "Live objects are new ones: create them with the live key. Test objects stay in test mode.",
                "Check `livemode` in webhooks, so a test webhook never touches a real record.",
              ],
            ],
          ],
        },
      ],
    },

    "money-and-personal-data": {
      intro: [["p", "Two rules shape what the API can do. They protect the people who register for events, and the clubs that answer for them."]],
      sections: [
        {
          id: "money",
          heading: "Money never moves through the API",
          blocks: [
            [
              "p",
              "Payments happen on MyOtherApp's checkout, between the person and the club, and the club decides refunds in its dashboard. Through the API you can't take a payment, refund one, pay a club out, or mark an online payment as paid.",
            ],
            [
              "ul",
              [
                "**A paid event refuses registrations through the API** with `409 PAYMENT_REQUIRED` and the event's checkout address (`error.details.checkout_url`). Send the person there to register and pay.",
                "**Unless the event accepts payments made elsewhere.** If people pay the club another way (at the college office, or through your own payment system), the club can turn on **\"Accept registrations paid outside MyOtherApp\"** for that event in its dashboard (a key with `events:write` can set the event's `external_payments_allowed` too). Then a registration may say what was paid; for an event without it, a `payment` gets `409 EXTERNAL_PAYMENTS_OFF`:",
              ],
            ],
            ["code", "bash", externalPaymentExample(api.baseUrl)],
            [
              "ul",
              [
                "It is recorded as paid outside MyOtherApp (`payment.status: \"paid_externally\"`): never part of MyOtherApp's payouts, nor of the club's income on MyOtherApp. Amounts are in paise, in INR.",
                "**Cancelling** an event or a registration that has online payments is refused (`409 CANCEL_IN_DASHBOARD`): the club cancels it in its dashboard, where refunds are handled. Free ones, and ones paid outside MyOtherApp, can be cancelled through the API.",
                "**Payment webhooks** (`payment.completed`, `payment.refunded`) carry amounts and status only: never card, UPI or bank details.",
              ],
            ],
          ],
        },
        {
          id: "personal-data",
          heading: "People's details (DPDP Act, 2023)",
          blocks: [
            [
              "p",
              "Under India's Digital Personal Data Protection Act, 2023, the club is the data fiduciary for the people who register for its events: it decides what their details are used for, and answers for it. When a club shares those details with your system, you handle them for the club.",
            ],
            [
              "ul",
              [
                "**Contact details need their own scope.** Names, email addresses, phone numbers and answers need `attendees:read`. Without it they are left out of every answer and webhook.",
                "**The club must tell people first.** A club can give `attendees:read` to a key or a partner app only after ticking **\"Our registration form tells people their details are shared with <name>\"**, so people know before they register that you will see their details.",
                "**Every read is counted.** Each read of attendees' details through the API goes into the club's audit log (how many, never the details themselves), so the club can see who read what.",
                "**Your part:** use the details only for what the club asked of you, keep them secure, don't pass them on, and delete them when the club asks.",
                "People registered through the API are the club's registrations like any other: they get the club's confirmation email (unless you send `send_confirmation: false`), and MyOtherApp's [privacy policy](/privacy) applies to them.",
              ],
            ],
          ],
        },
      ],
    },

    changelog: {
      intro: [
        [
          "p",
          "Every change to the API, newest first. v1 changes only by adding things: endpoints, fields, webhook types, scopes and error codes. Nothing in v1 is removed or renamed. A change that would break code comes as v2, and v1 keeps working for six months after v2 arrives.",
        ],
      ],
      sections: [
        {
          id: "v1-2026-11-12",
          heading: "12 November 2026: v1",
          blocks: [
            ["p", "The first version of the Integrations API."],
            [
              "ul",
              [
                "Club API keys (live and test), and partner apps with OAuth 2.0: the authorisation code flow with PKCE, and refresh tokens.",
                "The club: read and change its profile. Partner apps: list connected clubs, and create clubs.",
                "Events: list, read, create (as drafts), change, publish and cancel.",
                "Registrations: list, read, create (with payments made outside MyOtherApp, where the club allows them), change and cancel.",
                "Check-ins: check in by ticket code, registration id or external id; undo; list.",
                "Certificates: issue (in the background), follow the job, list, and read one by its number.",
                "Webhooks: 15 types, signed with HMAC-SHA256; endpoints, delivery logs, retries and replay.",
                "External ids, Idempotency-Key, ETags with If-Match, updated_since, and test mode.",
                "The OpenAPI 3.1 document, at `/partner/v1/openapi.json`.",
              ],
            ],
          ],
        },
      ],
    },
  };
}
