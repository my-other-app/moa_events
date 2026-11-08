import { redirect } from "next/navigation";
import { SitePage } from "@/components/discover/chrome";
import { VerifyResult } from "@/components/verify/verifypage";
import { pageMetadata } from "@/seo/metadata";
import { checkCertificate } from "@/server/verify";
import { requestVisitor } from "@/server/visitor";
import { NUMBER_PATTERN, certificateNumberFrom, isCertificatePublicId, verifyPath } from "@/utils/certcode";

/*
 * /verify/{number}: one certificate's check, made now, for this visitor.
 * /verify/{public id} is the same check by the id in a certificate's link
 * (what the box sends a pasted link to), taken exactly as it is.
 *
 * Never indexed, cached, framed or referred on (next.config.mjs sets
 * no-store, noindex, frame-ancestors 'none' and no-referrer for these
 * addresses; the head says noindex, nofollow and no-referrer too). Any
 * other way of writing a number (lower case, without its dashes) is sent
 * on to the number's own address. An address that holds neither a number
 * nor a public id is answered without asking anyone.
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
  const publicId = isCertificatePublicId(given) ? given : null;
  const number = publicId ? null : certificateNumberFrom(given);
  if (number && number !== given) redirect(verifyPath(number));
  const checkedAt = new Date().toISOString();
  const lookup = publicId || number;
  const result = lookup ? await checkCertificate(lookup, { visitor: await requestVisitor() }) : { state: "invalid" };
  // By a link, the number is the one the API answered with (none for a link that names nothing).
  const shown = publicId ? (NUMBER_PATTERN.test(result?.number ?? "") ? result.number : null) : number;
  return (
    <SitePage>
      <VerifyResult number={shown} byLink={Boolean(publicId)} result={result} checkedAt={checkedAt} />
    </SitePage>
  );
}
