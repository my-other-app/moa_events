import { useEffect } from "react";
import { jsonForScript } from "./eventld";

const DEFAULT_DESCRIPTION_SELECTOR = 'meta[name="description"]';

/**
 * Sets the tab title and the meta description while a page is open, and
 * puts back what was there when it closes. A null title leaves both alone
 * (a page still loading has nothing better to say yet).
 */
export function usePageMeta(title, description) {
  useEffect(() => {
    if (!title) return undefined;
    const prevTitle = document.title;
    document.title = title;
    let tag = document.head.querySelector(DEFAULT_DESCRIPTION_SELECTOR);
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", "description");
      document.head.appendChild(tag);
    }
    const prevDescription = tag.getAttribute("content");
    if (description) tag.setAttribute("content", description.slice(0, 160));
    return () => {
      document.title = prevTitle;
      if (prevDescription === null) tag.removeAttribute("content");
      else tag.setAttribute("content", prevDescription);
    };
  }, [title, description]);
}

/**
 * Sets one <meta> or <link> in the head and returns how to put it back:
 * a tag it had to add is removed again, one that was there gets its old value.
 */
function setHeadTag(tagName, keyAttr, key, valueAttr, value) {
  const el0 = document.head.querySelector(`${tagName}[${keyAttr}="${key}"]`);
  const el = el0 || document.createElement(tagName);
  if (!el0) {
    el.setAttribute(keyAttr, key);
    document.head.appendChild(el);
  }
  const prev = el.getAttribute(valueAttr);
  el.setAttribute(valueAttr, value);
  return () => {
    if (!el0) el.remove();
    else if (prev === null) el.removeAttribute(valueAttr);
    else el.setAttribute(valueAttr, prev);
  };
}

/**
 * The tags a link preview and a search engine read: the canonical address,
 * Open Graph and the Twitter card. Crawlers that run scripts see these; the
 * ones that don't are answered by /api/share with the same tags.
 */
export function useShareMeta({ title, description, image, url, type = "website" }) {
  useEffect(() => {
    if (!title) return undefined;
    const undo = [];
    const meta = (attr, key, value) => value && undo.push(setHeadTag("meta", attr, key, "content", value));
    if (url) undo.push(setHeadTag("link", "rel", "canonical", "href", url));
    meta("property", "og:type", type);
    meta("property", "og:title", title);
    meta("property", "og:description", description);
    meta("property", "og:url", url);
    meta("property", "og:image", image);
    meta("name", "twitter:card", "summary_large_image");
    meta("name", "twitter:title", title);
    meta("name", "twitter:description", description);
    meta("name", "twitter:image", image);
    return () => undo.reverse().forEach((fn) => fn());
  }, [title, description, image, url, type]);
}

/** Structured data for the page, as a <script type="application/ld+json"> in the head. */
export function useJsonLd(data) {
  const json = data ? jsonForScript(data) : null;
  useEffect(() => {
    if (!json) return undefined;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = json;
    document.head.appendChild(script);
    return () => script.remove();
  }, [json]);
}

/** Keeps the page out of search results while it is open (a person's own pages: tickets, follows). */
export function useNoIndex() {
  useEffect(() => setHeadTag("meta", "name", "robots", "content", "noindex, nofollow"), []);
}
