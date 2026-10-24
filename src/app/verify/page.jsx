import { redirect } from "next/navigation";
import { SitePage } from "@/components/discover/chrome";
import { NOT_A_NUMBER } from "@/components/verify/checkform";
import { VERIFY_META, VerifyLanding } from "@/components/verify/verifypage";
import { pageMetadata } from "@/seo/metadata";
import { queryValue } from "@/server/flows";
import { MAX_INPUT, certificateNumberFrom, verifyPath } from "@/utils/certcode";

/*
 * /verify: the public certificate check. Indexable; its headers
 * (next.config.mjs) keep it out of other sites' frames.
 *
 * The form is a plain GET to /verify?code=…, so it works without
 * JavaScript: a code that is a number goes on to /verify/{number}; one
 * that is not stays here, said to be wrong, and is never looked up. An
 * address with a code is never indexed.
 */
export async function generateMetadata({ searchParams }) {
  const code = queryValue((await searchParams)?.code);
  return pageMetadata({ absoluteTitle: VERIFY_META.title, description: VERIFY_META.description, path: "/verify", noindex: Boolean(code) });
}

export default async function VerifyPage({ searchParams }) {
  const code = queryValue((await searchParams)?.code).slice(0, MAX_INPUT);
  const asked = code.trim() !== "";
  const number = asked ? certificateNumberFrom(code) : null;
  if (number) redirect(verifyPath(number));
  return (
    <SitePage>
      <VerifyLanding code={code} error={asked ? NOT_A_NUMBER : null} />
    </SitePage>
  );
}
