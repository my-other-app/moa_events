import { notFound, redirect } from "next/navigation";
import { SitePage } from "@/components/discover/chrome";
import { ProfileCodeProblem } from "@/components/profiles/profileview";
import { resolveProfileCode } from "@/server/profiles";
import { requestVisitor } from "@/server/visitor";
import { isProfileCode, profileSavePath } from "@/utils/profiles";

/*
 * /p/{code}: a person's QR code (feature-register/profiles-networking-contract.md).
 * Once the app claims /p/* (src/seo/appLinks.js, with the app release that
 * handles it), a phone with the app opens it there: this page is for
 * everyone else.
 *
 * Looked up afresh on every scan (GET /profiles/by-code/{code}, never cached:
 * a replaced code stops at once; for the visitor's own address, which the
 * API's 30 a minute counts), then a 307 to /u/{handle}?save=1, so the
 * profile page can put "Save to your network" first. A replaced code (410
 * PROFILE_CODE_INACTIVE) and an owner who turned saving by QR off (403
 * PROFILE_SCANNING_OFF) each get a page of their own; anything else that
 * isn't a profile is the 404 page. Never indexed, kept or framed
 * (next.config.mjs: PRIVATE_LINK_HEADERS).
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Profile code", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ProfileCodeRoute({ params }) {
  const { code } = await params;
  const c = String(code || "").toLowerCase();
  if (!isProfileCode(c)) notFound();
  const answer = await resolveProfileCode(c, { visitor: await requestVisitor() });
  if (answer.state === "ok") redirect(profileSavePath(answer.handle.toLowerCase()));
  if (answer.state === "inactive" || answer.state === "scanning-off") {
    return (
      <SitePage>
        <ProfileCodeProblem state={answer.state} />
      </SitePage>
    );
  }
  notFound();
}
