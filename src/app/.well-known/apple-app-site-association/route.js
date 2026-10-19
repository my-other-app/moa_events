import { appleAppSiteAssociation, jsonFile } from "@/seo/appLinks";

/*
 * /.well-known/apple-app-site-association: which of this site's links the
 * iPhone app opens (src/seo/appLinks.js). JSON with no extension, answered
 * at this address with no redirect, as Apple's CDN requires. Made at build.
 */
export const dynamic = "force-static";

export function GET() {
  return jsonFile(appleAppSiteAssociation());
}
