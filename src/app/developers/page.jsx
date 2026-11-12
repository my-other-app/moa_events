import { PublicDevelopers } from "@/components/developers/publicpage";
import { docsMetadata } from "@/developers/seo";

/*
 * /developers: the developer docs' one public page (decision 1 of
 * feature-register/private-dev-docs-contract.md): what the Integrations API
 * does and how to ask for access. Static, indexed, in the sitemap and the
 * footer. It reads nothing (no OpenAPI document, no cookie), so it is made
 * once at build; every other address under /developers is private
 * (src/developers/gate.js).
 */
export const dynamic = "force-static";

export const metadata = docsMetadata("");

export default function Developers() {
  return <PublicDevelopers />;
}
