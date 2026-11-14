"use client";

import { useEffect, useState } from "react";
import { androidIntentUrl } from "@/utils/profiles";

/**
 * "Open in the app", where a tap can reach it: on Android, an intent link to
 * `path` (one of the site's own addresses, query kept) in the app, or the
 * Play Store when it isn't installed (androidIntentUrl). Elsewhere nothing:
 * Safari keeps a tap on the page's own domain, so the store badges beside it
 * are the way. Shown once the browser has said what it is (the server's
 * HTML and the first paint have none).
 */
/** True on Android, once the page is in the browser (false on the server and in the first paint). */
export function useAndroid() {
  const [android, setAndroid] = useState(false);
  useEffect(() => {
    setAndroid(/Android/i.test(window.navigator.userAgent || ""));
  }, []);
  return android;
}

export function OpenInApp({ path, className = "dc-btn" }) {
  const android = useAndroid();
  if (!android) return null;
  return (
    <a className={className} href={androidIntentUrl(path)}>
      Open in the app
    </a>
  );
}
