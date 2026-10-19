import { assetLinks, jsonFile } from "@/seo/appLinks";

/*
 * /.well-known/assetlinks.json: the Android app may open this site's links,
 * when signed by a key in ANDROID_APP_SHA256 (src/seo/appLinks.js). An empty
 * list until that is set. Made at build, so a new value needs a deploy (as
 * every Vercel variable does).
 */
export const dynamic = "force-static";

export function GET() {
  return jsonFile(assetLinks());
}
