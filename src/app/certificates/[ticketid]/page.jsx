import { notFound } from "next/navigation";
import Certificate from "@/components/certificate";
import { SitePage } from "@/components/discover/chrome";
import { pageMetadata } from "@/seo/metadata";
import { isKey } from "@/server/flows";

/*
 * A guest's certificate, from the link in its email or My tickets: the
 * club's own design as the server draws it, and the public check
 * (src/components/certificate.jsx). The address holds the ticket's code,
 * so it is never indexed, framed or passed on as a referrer
 * (next.config.mjs sets the same as headers).
 */
export const dynamic = "force-dynamic";

export const metadata = {
  ...pageMetadata({ title: "Certificate", description: "A certificate issued on MyOtherApp.", path: null }),
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function CertificatePage({ params }) {
  const { ticketid } = await params;
  if (!isKey(ticketid)) notFound();
  return (
    <SitePage>
      <Certificate ticketid={ticketid} />
    </SitePage>
  );
}
