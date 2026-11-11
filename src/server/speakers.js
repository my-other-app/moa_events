import "server-only";
import { cache } from "react";
import { isSpeakerSlug, parseSpeakerPage, parseSpeakerSitemap } from "@/utils/speakers";
import { apiGet } from "./api";

/**
 * Speakers' pages, read on the server (feature-register/speakers-contract.md).
 * Through Next's data cache like every page read (a minute, tagged
 * `speaker:{slug}`; /api/revalidate takes `"speakers": ["<slug>"]`), read as
 * nobody: whether the reader follows them is the browser's to ask.
 *
 *   getSpeakerPage(slug)   the page, {redirect} for a merged profile, or null
 *                          (404: hidden, unknown, or an API without speakers)
 *   getSpeakerSitemap()    [{slug, updated_at}] for /sitemaps/speakers.xml, or
 *                          null while the API has no such list (404)
 *
 * Anything else the API says (5xx, no answer) throws ApiError, so an ISR page
 * keeps its last good copy.
 */
export const SPEAKER_TAG = (slug) => `speaker:${slug}`;
export const SPEAKER_SITEMAP_TAG = "speakers-sitemap";

async function speakerPage(slug, fresh) {
  if (!isSpeakerSlug(slug)) return null;
  const { data } = await apiGet(`/api/v1/speakers/${encodeURIComponent(slug)}`, { fresh, revalidate: 60, tags: [SPEAKER_TAG(slug)] });
  return data ? parseSpeakerPage(data) : null;
}

export const getSpeakerPage = cache((slug) => speakerPage(slug, false));

/** The same past every cache (a photo link about to expire). */
export const getSpeakerPageFresh = (slug) => speakerPage(slug, true);

export const getSpeakerSitemap = cache(async () => {
  const { data } = await apiGet("/api/v1/speakers/sitemap", { revalidate: 3600, tags: [SPEAKER_SITEMAP_TAG, "sitemap"] });
  return data ? parseSpeakerSitemap(data) : null;
});
