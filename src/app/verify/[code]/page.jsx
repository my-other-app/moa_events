import { redirect } from "next/navigation";
import { SitePage } from "@/components/discover/chrome";
import { VerifyResult } from "@/components/verify/verifypage";
import { pageMetadata } from "@/seo/metadata";
import { checkCertificate } from "@/server/verify";
import { requestVisitor } from "@/server/visitor";
import { certificateNumberFrom, verifyPath } from "@/utils/certcode";

/*
 * /verify/{number}: one certificate's check, made now, for this visitor.
 *
 * Never indexed, cached, framed or referred on (next.config.mjs sets
 * no-store, noindex, frame-ancestors 'none' and no-referrer for these
 * addresses; the head says noindex, nofollow and no-referrer too). Any
 * other way of writing a number (lower case, an older QR's
 * certificate:MOA-…) is sent on to the number's own address, so a ticket
 * id never stays in the address bar. An address that holds no number is
 * answered without asking anyone.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  ...pageMetadata({
    title: "Certificate check",
    description: "Whether a certificate issued on MyOtherApp is genuine, checked just now.",
    path: null,
  }),
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function decoded(code) {
  try {
    return decodeURIComponent(String(code ?? ""));
  } catch {
    return "";
  }
}

export default async function VerifyResultPage({ params }) {
  const { code } = await params;
  const given = decoded(code);
  const number = certificateNumberFrom(given);
  if (number && number !== given) redirect(verifyPath(number));
  const checkedAt = new Date().toISOString();
  const result = number ? await checkCertificate(number, { visitor: await requestVisitor() }) : { state: "invalid" };
  return (
    <SitePage>
      <VerifyResult number={number} result={result} checkedAt={checkedAt} />
    </SitePage>
  );
}
