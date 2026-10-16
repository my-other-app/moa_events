import { useEffect } from "react";

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
