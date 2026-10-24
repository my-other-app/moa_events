// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, outcome } from "@/test/next";
import { fullEvent } from "@/test/eventFixture";

/*
 * The event's addresses on the server: the page at /events/{slug} (ISR),
 * the event's client pages under it, and every old address, each a 308 to
 * the one canonical page or a real 404. The API is a fake fetch.
 */
const page = fullEvent();
const API = "https://api.myotherapp.in/api/v1/discover/events";
let fetch;

beforeEach(() => {
  fetch = fakeFetch((url) => {
    const ref = decodeURIComponent(url.pathname.replace("/api/v1/discover/events/", ""));
    if (ref === "boom") return { status: 503, body: { detail: "down" } };
    if (ref === "hack-night-04" || ref === "123" || ref === "hack-night-old") return { body: page };
    return { status: 404, body: { detail: "Not found" } };
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => vi.unstubAllGlobals());

const params = (o) => Promise.resolve(o);

describe("/events/{slug}", () => {
  it("renders the event, asking the API once (cached for a minute) for the page and its head together", async () => {
    const route = await import("../events/[slug]/page.jsx");
    expect(route.revalidate).toBe(60);
    expect(route.dynamicParams).toBe(true);
    expect(route.generateStaticParams()).toEqual([]);
    const meta = await route.generateMetadata({ params: params({ slug: "hack-night-04" }) });
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/events/hack-night-04");
    // Its club's feed, for readers and crawlers alike.
    expect(meta.alternates.types?.["application/rss+xml"]?.[0]?.url).toBe("https://myotherapp.in/clubs/circuit-society/rss.xml");
    const result = await outcome(() => route.default({ params: params({ slug: "hack-night-04" }) }));
    expect(result.value).toBeTruthy();
    expect(fetch.calls[0].url).toBe(`${API}/hack-night-04`);
    expect(fetch.calls[0].init.next).toEqual({ revalidate: 60, tags: ["event:hack-night-04"] });
  });

  it("moves an old slug to the current one for good (308)", async () => {
    const route = await import("../events/[slug]/page.jsx");
    expect(await outcome(() => route.default({ params: params({ slug: "hack-night-old" }) }))).toEqual({ redirect: { url: "/events/hack-night-04", status: 308 } });
  });

  it("answers a real 404 for an event that isn't public, and never asks about something that isn't a slug", async () => {
    const route = await import("../events/[slug]/page.jsx");
    expect(await outcome(() => route.default({ params: params({ slug: "nope" }) }))).toEqual({ notFound: true });
    expect(await outcome(() => route.default({ params: params({ slug: "../../etc" }) }))).toEqual({ notFound: true });
    expect(fetch.calls.map((c) => c.url)).toEqual([`${API}/nope`]);
    const meta = await route.generateMetadata({ params: params({ slug: "nope" }) });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("lets an API failure reach the error page (and ISR keep its last good copy) instead of a 404", async () => {
    const route = await import("../events/[slug]/page.jsx");
    await expect(route.default({ params: params({ slug: "boom" }) })).rejects.toMatchObject({ name: "ApiError", status: 503 });
  });
});

describe("the event's own client pages", () => {
  it.each(["register", "live", "compete"])("/events/{slug}/%s finds the event on the server, moves an old address with its query, 404s a missing one", async (sub) => {
    const route = await import(`../events/[slug]/${sub}/page.jsx`);
    expect(route.dynamic).toBe("force-dynamic");
    const ok = await outcome(() => route.default({ params: params({ slug: "hack-night-04" }), searchParams: params({}) }));
    // The page's own client component, handed what the server found.
    const component = { register: "Register", live: "Live", compete: "Compete" }[sub];
    expect(ok.value.type.name).toBe(component);
    if (sub === "register") {
      expect(ok.value.props.event).toMatchObject({ id: 123, slug: "hack-night-04", name: "Hack Night 04", has_fee: true, fee: 250 });
      expect(ok.value.props.club).toEqual({ name: "Circuit Society", slug: "circuit-society" });
    } else if (sub === "live") expect(ok.value.props).toEqual({ eventId: "123", eventSlug: "hack-night-04", eventName: "Hack Night 04" });
    else expect(ok.value.props).toEqual({ eventId: "123", eventSlug: "hack-night-04" });
    expect(await outcome(() => route.default({ params: params({ slug: "123" }), searchParams: params({ ref: "abc12345", utm_source: ["qr", "poster"] }) }))).toEqual({
      redirect: { url: `/events/hack-night-04/${sub}?ref=abc12345&utm_source=qr&utm_source=poster`, status: 308 },
    });
    expect(await outcome(() => route.default({ params: params({ slug: "nope" }), searchParams: params({}) }))).toEqual({ notFound: true });
    const meta = await route.generateMetadata({ params: params({ slug: "hack-night-04" }) });
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/events/hack-night-04");
  });

  it("hands the form stable pictures, never presigned links, and only what it draws", async () => {
    const route = await import("../events/[slug]/register/page.jsx");
    const { value } = await outcome(() => route.default({ params: params({ slug: "hack-night-04" }), searchParams: params({}) }));
    const sent = JSON.stringify(value.props);
    expect(sent).not.toContain("cdn.example");
    // Not the event's guidelines, contacts or coordinates: the form never shows them.
    expect(Object.keys(value.props.event)).not.toEqual(expect.arrayContaining(["guidelines"]));
    expect(value.props.event).not.toHaveProperty("contact");
    expect(value.props.event).not.toHaveProperty("lat");
    expect(value.props.event.about.length).toBeLessThanOrEqual(600);
  });
});

describe("the transactional pages", () => {
  it.each([
    ["/play/{eventId}", "../play/[eventId]/page.jsx", { eventId: "68" }, {}, "Play", { eventId: "68" }],
    ["/feedback/{eventId}/{registrationId}", "../feedback/[eventId]/[registrationId]/page.jsx", { eventId: "68", registrationId: "0b6e1f9a-4c1d-4d7e-9a51-1f2b3c4d5e6f" }, { k: "tok" }, "Feedback", { eventId: "68", registrationId: "0b6e1f9a-4c1d-4d7e-9a51-1f2b3c4d5e6f", k: "tok" }],
    ["/tickets/{ticketid}", "../tickets/[ticketid]/page.jsx", { ticketid: "MOA-1A2B3-XY7QZ" }, {}, "Ticket", { ticketid: "MOA-1A2B3-XY7QZ" }],
    ["/certificates/{ticketid}", "../certificates/[ticketid]/page.jsx", { ticketid: "MOA-1A2B3-XY7QZ" }, {}, "Certificate", { ticketid: "MOA-1A2B3-XY7QZ" }],
  ])("%s hands its client component the address, asks the API nothing, and is never indexed", async (_, file, p, q, component, props) => {
    const route = await import(/* @vite-ignore */ file);
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.metadata.robots).toMatchObject({ index: false });
    const { value } = await outcome(() => route.default({ params: params(p), searchParams: params(q) }));
    // The certificate sits in the site's frame (header and footer).
    const page = value.type.name === "SitePage" ? value.props.children : value;
    expect(page.type.name).toBe(component);
    expect(page.props).toEqual(props);
    expect(fetch.calls).toEqual([]);
  });

  it.each([
    ["../play/[eventId]/page.jsx", { eventId: "abc" }],
    ["../play/[eventId]/page.jsx", { eventId: "../x" }],
    ["../feedback/[eventId]/[registrationId]/page.jsx", { eventId: "68", registrationId: "a b" }],
    ["../feedback/[eventId]/[registrationId]/page.jsx", { eventId: "x", registrationId: "reg-1" }],
    ["../tickets/[ticketid]/page.jsx", { ticketid: "<script>" }],
    ["../certificates/[ticketid]/page.jsx", { ticketid: "-x" }],
  ])("%s is a real 404 for %o", async (file, p) => {
    const route = await import(/* @vite-ignore */ file);
    expect(await outcome(() => route.default({ params: params(p), searchParams: params({}) }))).toEqual({ notFound: true });
  });

  it("feedback takes the first ?k= when the link repeats it", async () => {
    const route = await import("../feedback/[eventId]/[registrationId]/page.jsx");
    const { value } = await outcome(() => route.default({ params: params({ eventId: "68", registrationId: "reg-1" }), searchParams: params({ k: ["one", "two"] }) }));
    expect(value.props.k).toBe("one");
    const none = await outcome(() => route.default({ params: params({ eventId: "68", registrationId: "reg-1" }), searchParams: params({}) }));
    expect(none.value.props.k).toBe("");
  });

  it.each([
    ["../me/tickets/page.jsx", "My tickets", "MyTicketsPage"],
    ["../me/following/page.jsx", "Following", "FollowingPage"],
  ])("%s is the same for everyone on the server (who is signed in lives in the browser) and never indexed", async (file, title, component) => {
    const route = await import(/* @vite-ignore */ file);
    expect(route.dynamic).toBeUndefined();
    expect(route.metadata.title).toBe(title);
    expect(route.metadata.robots).toMatchObject({ index: false });
    expect(route.metadata.alternates?.canonical).toBeUndefined();
    expect(route.default().type.name).toBe(component);
  });
});

describe("the old addresses (posters, QR codes on tickets, emails, the app's links)", () => {
  const cases = [
    ["/{id}", "../[ref]/page.jsx", { ref: "123" }, "", "/events/hack-night-04"],
    ["/{slug}", "../[ref]/page.jsx", { ref: "hack-night-04" }, "", "/events/hack-night-04"],
    ["/{old slug}", "../[ref]/page.jsx", { ref: "hack-night-old" }, "", "/events/hack-night-04"],
    ["/{ref}/live", "../[ref]/live/page.jsx", { ref: "123" }, "live", "/events/hack-night-04/live"],
    ["/{ref}/compete", "../[ref]/compete/page.jsx", { ref: "123" }, "compete", "/events/hack-night-04/compete"],
    ["/register/{ref}", "../register/[ref]/page.jsx", { ref: "123" }, "register", "/events/hack-night-04/register"],
  ];
  it.each(cases)("%s answers 308 to the event, keeping the query", async (_, file, p, __, to) => {
    const route = await import(/* @vite-ignore */ file);
    expect(await outcome(() => route.default({ params: params(p), searchParams: params({ ref: "x7k2m9pq", sref: "site1234" }) }))).toEqual({
      redirect: { url: `${to}?ref=x7k2m9pq&sref=site1234`, status: 308 },
    });
    expect(await outcome(() => route.default({ params: params(p), searchParams: params({}) }))).toEqual({ redirect: { url: to, status: 308 } });
  });

  it("is a 404 when no public event answers to it, and never looks up the site's own words or junk", async () => {
    const route = await import("../[ref]/page.jsx");
    expect(await outcome(() => route.default({ params: params({ ref: "nope" }), searchParams: params({}) }))).toEqual({ notFound: true });
    for (const ref of ["api", "media", "Register", "sitemaps", "favicon.ico", "a b", "_next"]) {
      expect(await outcome(() => route.default({ params: params({ ref }), searchParams: params({}) }))).toEqual({ notFound: true });
    }
    expect(fetch.calls.map((c) => c.url)).toEqual([`${API}/nope`]);
  });
});
