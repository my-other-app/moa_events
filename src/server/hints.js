import "server-only";
import { preconnect } from "react-dom";
import { mediaOrigin } from "@/seo/media";

/**
 * Tells the browser, in the page's <head>, to open a connection to where
 * the page's pictures are served from (<link rel="preconnect">). Pictures
 * reach a page through /media/... redirects (src/seo/stabilize.js), so the
 * browser would otherwise learn the picture host only after the redirect,
 * and pay its DNS, TCP and TLS on the way to the largest paint (an event's
 * poster). Call it while rendering, with the API's raw picture links (not
 * the stable ones); nothing happens when there are none.
 */
export function preconnectMedia(...values) {
  const origin = mediaOrigin(...values);
  if (origin) preconnect(origin);
  return origin;
}
