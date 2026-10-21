// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, outcome } from "@/test/next";
import { html, jsonLdOf } from "@/test/html";
import { validateBreadcrumbs, validateDiscussionPosting, validateItemList } from "@/seo/validate";

/* /threads and /threads/{id} on the server: statically regenerated, read as nobody. */
const S3 = "https://b.s3.amazonaws.com/k.jpg?Signature=x&Expires=1";
const club = { id: 3, name: "Circuit Society", slug: "circuit-society", logo: S3 };
const POST = { id: "t1", club, body: "Kits are in!\nPick yours up at Lab 3B.", image: { medium: S3 }, likes: 12, comments: 2, liked: false, created_at: "2026-10-15T10:00:00Z" };
const COMMENTS = [{ id: "c1", body: "On my way", author: { name: "Rohan P.", is_club: false }, created_at: "2026-10-15T11:00:00Z" }];
let fetch;
let comments;
beforeEach(() => {
  comments = { body: COMMENTS };
  fetch = fakeFetch((url) => {
    if (url.pathname === "/api/v1/discover/threads") return { body: { items: [POST], total: 1 } };
    if (url.pathname === "/api/v1/threads/t1") return { body: POST };
    if (url.pathname === "/api/v1/threads/t1/comments") return comments;
    if (url.pathname === "/api/v1/threads/boom") return { status: 500, body: {} };
    return { status: 404, body: {} };
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => vi.unstubAllGlobals());

const params = (o) => Promise.resolve(o);

describe("/threads", () => {
  it("is the first posts in the HTML, regenerated at most once a minute", async () => {
    const route = await import("../threads/page.jsx");
    expect(route.revalidate).toBe(60);
    expect(route.metadata.alternates.canonical).toBe("https://myotherapp.in/threads");
    const out = html(await route.default());
    expect(out).toContain("Kits are in!");
    expect(out).toContain('href="/threads/t1"');
    expect(out).not.toMatch(/Signature=|Expires=/);
    expect(Object.fromEntries(new URL(fetch.calls[0].url).searchParams)).toEqual({ offset: "0", limit: "12" });
  });

  it("is a CollectionPage of the posts, with an ItemList of each post's page", async () => {
    const route = await import("../threads/page.jsx");
    const [page, list] = jsonLdOf(html(await route.default()));
    expect(page).toMatchObject({ "@type": "CollectionPage", "@id": "https://myotherapp.in/threads", name: "Threads from the clubs", inLanguage: "en-IN", mainEntity: { "@id": "https://myotherapp.in/threads#posts" } });
    expect(validateItemList(list)).toEqual({ errors: [], warnings: [] });
    expect(list.itemListElement).toEqual([{ "@type": "ListItem", position: 1, url: "https://myotherapp.in/threads/t1", name: "Kits are in!" }]);
  });

  it("lists no demo club's post, and then is the CollectionPage alone", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => ({ body: { items: [{ ...POST, club: { ...club, slug: "neural-tide" } }], total: 1 } })));
    const route = await import("../threads/page.jsx");
    const lds = jsonLdOf(html(await route.default()));
    expect(lds.map((l) => l["@type"])).toEqual(["CollectionPage"]);
    expect(lds[0]).not.toHaveProperty("mainEntity");
  });
});

describe("/threads/{id}", () => {
  it("is the post, its counts and its comments in the HTML, with its forum-post structured data", async () => {
    const route = await import("../threads/[id]/page.jsx");
    expect(route.revalidate).toBe(60);
    expect(route.generateStaticParams()).toEqual([]);
    const meta = await route.generateMetadata({ params: params({ id: "t1" }) });
    expect(meta.title).toEqual({ absolute: "Circuit Society on MyOtherApp: “Kits are in! Pick yours up at Lab 3B.”" });
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/threads/t1");
    const out = html(await route.default({ params: params({ id: "t1" }) }));
    for (const words of ["Kits are in!", "12 likes", "On my way", "Rohan P."]) expect(out).toContain(words);
    expect(out).toMatch(/Comments(<!-- -->)? \(1\)/);
    expect(out).not.toMatch(/Signature=|Expires=/);
    const [post, crumbs] = jsonLdOf(out);
    expect(validateDiscussionPosting(post)).toEqual({ errors: [], warnings: [] });
    expect(validateBreadcrumbs(crumbs).errors).toEqual([]);
    expect(post).toMatchObject({ headline: "Kits are in!", commentCount: 2, author: { "@type": "Organization", name: "Circuit Society", url: "https://myotherapp.in/clubs/circuit-society" } });
    // When, and how many liked it and commented, as Google's forum-post result reads them.
    expect(post.datePublished).toBe("2026-10-15T15:30:00+05:30");
    expect(post.interactionStatistic).toEqual([
      { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: 12 },
      { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: 2 },
    ]);
    // Read as nobody: no one's token goes, cached a minute under the post's tag.
    expect(fetch.calls[0].init.headers).toEqual({ Accept: "application/json" });
    expect(fetch.calls[0].init.next).toEqual({ revalidate: 60, tags: ["thread:t1"] });
  });

  it("still shows the post when only its comments fail", async () => {
    comments = { status: 500, body: {} };
    const route = await import("../threads/[id]/page.jsx");
    const out = html(await route.default({ params: params({ id: "t1" }) }));
    expect(out).toContain("Kits are in!");
    expect(out).toContain("Comments couldn’t load just now.");
  });

  it("is a real 404 for a post that is gone, and the error page when the API fails", async () => {
    const route = await import("../threads/[id]/page.jsx");
    expect(await outcome(() => route.default({ params: params({ id: "gone" }) }))).toEqual({ notFound: true });
    expect((await route.generateMetadata({ params: params({ id: "gone" }) })).robots).toEqual({ index: false, follow: true });
    await expect(route.default({ params: params({ id: "boom" }) })).rejects.toMatchObject({ name: "ApiError", status: 500 });
  });
});
