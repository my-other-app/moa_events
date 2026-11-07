import { notFound } from "next/navigation";
import Certificate from "@/components/certificate";
import { SitePage } from "@/components/discover/chrome";
import { pageMetadata } from "@/seo/metadata";
import { isLinkId } from "@/server/flows";

/*
 * A guest's certificate, from the link the API hands out (its email, My
 * tickets: `certificate_url`): the club's own design as the server draws it,
 * and the public check (src/components/certificate.jsx). The id in the
 * address is the API's, handed to the API as it is -- the site never reads
 * it nor makes one. The address opens the certificate, so it is never
 * indexed, framed or passed on as a referrer (next.config.mjs sets the same
 * as headers).
 */
export const dynamic = "force-dynamic";

export const metadata = {
  ...pageMetadata({ title: "Certificate", description: "A certificate issued on MyOtherApp.", path: null }),
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function CertificatePage({ params }) {
  const { id } = await params;
  if (!isLinkId(id)) notFound();
  return (
    <SitePage>
      <Certificate id={id} />
    </SitePage>
  );
}
