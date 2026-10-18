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
    const ok = await outcome(() => route.default({ params: params({ slug: "hack-night-04" }), searchParams: params({}) }));
    expect(ok.value.props.name).toBe(sub);
    if (sub === "register") expect(ok.value.props.props.event.slug).toBe("hack-night-04");
    else expect(ok.value.props.props).toEqual({ eventId: "123", eventSlug: "hack-night-04" });
    expect(await outcome(() => route.default({ params: params({ slug: "123" }), searchParams: params({ ref: "abc12345", utm_source: ["qr", "poster"] }) }))).toEqual({
      redirect: { url: `/events/hack-night-04/${sub}?ref=abc12345&utm_source=qr&utm_source=poster`, status: 308 },
    });
    expect(await outcome(() => route.default({ params: params({ slug: "nope" }), searchParams: params({}) }))).toEqual({ notFound: true });
    const meta = await route.generateMetadata({ params: params({ slug: "hack-night-04" }) });
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/events/hack-night-04");
  });

  it("hands the client page stable pictures, never presigned links", async () => {
    const route = await import("../events/[slug]/register/page.jsx");
    const { value } = await outcome(() => route.default({ params: params({ slug: "hack-night-04" }), searchParams: params({}) }));
    expect(JSON.stringify(value.props.props)).not.toContain("cdn.example");
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
