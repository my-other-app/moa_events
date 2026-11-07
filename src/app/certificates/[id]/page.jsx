import { notFound } from "next/navigation";
import Certificate, { OldCertificateAddress } from "@/components/certificate";
import { SitePage } from "@/components/discover/chrome";
import { pageMetadata } from "@/seo/metadata";
import { isKey } from "@/server/flows";
import { checkCertificate } from "@/server/verify";
import { requestVisitor } from "@/server/visitor";
import { isCertificatePublicId } from "@/utils/certcode";

/*
 * A certificate's page, from the link the API hands out (its email, My
 * tickets: `certificate_url`): /certificates/{public id}, the certificate's
 * own id of 24 URL-safe characters, taken exactly as it is. What it says is
 * the public check's (checkCertificate, asked now for this visitor); the
 * picture and the PDF are the API's, by the same id
 * (src/components/certificate.jsx).
 *
 * An older address, by ticket id, opens nothing here: its holder's browser
 * is sent on to the certificate's page (OldCertificateAddress). The address
 * opens the certificate, so it is never indexed, framed or passed on as a
 * referrer (next.config.mjs sets the same as headers).
 */
export const dynamic = "force-dynamic";

export const metadata = {
  ...pageMetadata({ title: "Certificate", description: "A certificate issued on MyOtherApp.", path: null }),
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function CertificatePage({ params }) {
  const { id } = await params;
  if (isCertificatePublicId(id)) {
    const result = await checkCertificate(id, { visitor: await requestVisitor() });
    return (
      <SitePage>
        <Certificate id={id} result={result} />
      </SitePage>
    );
  }
  if (!isKey(id)) notFound();
  return (
    <SitePage>
      <OldCertificateAddress ticketId={id} />
    </SitePage>
  );
}
