import { PLAY_STORE_URL } from "@/config";
import { DEFAULT_DESCRIPTION, SITE_NAME } from "@/seo/metadata";

/*
 * /manifest.webmanifest (Next links it from every page): the site's name,
 * icons and colours for "Add to home screen", and the Android app, which
 * Chrome offers in place of installing the site.
 */
export default function manifest() {
  return {
    name: `${SITE_NAME}: events and clubs near you`,
    short_name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "en-IN",
    dir: "ltr",
    categories: ["events", "social", "education"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    related_applications: [{ platform: "play", url: PLAY_STORE_URL, id: "app.myotherapp.com" }],
    prefer_related_applications: true,
  };
}
