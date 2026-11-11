import { notFound } from "next/navigation";
import SurveyPage from "@/components/help/survey";
import { pageMetadata } from "@/seo/metadata";
import { isClaimToken, queryValue } from "@/server/flows";

/*
 * /help/survey/{token}: "Did we solve it?" from the email sent when a
 * support request is solved (components/help/survey.jsx). The token is the
 * link's only credential: the server checks its shape (404 otherwise), and
 * the address is never indexed, kept, framed or named to another site
 * (CLAIM_HEADERS in next.config.mjs); Sentry masks it. `?solved=yes|no`
 * (the email's two buttons) picks that answer; nothing is sent until the
 * person presses Send.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  ...pageMetadata({ title: "How did we do?", description: "Tell us whether we solved your request.", path: null }),
  robots: { index: false, follow: false },
  referrer: "strict-origin",
};

const answer = (v) => (v === "yes" || v === "1" || v === "true" ? true : v === "no" || v === "0" || v === "false" ? false : null);

export default async function Survey({ params, searchParams }) {
  const { token } = await params;
  if (!isClaimToken(token)) notFound();
  const query = (await searchParams) || {};
  return <SurveyPage token={token} solved={answer(queryValue(query.solved).toLowerCase())} />;
}
