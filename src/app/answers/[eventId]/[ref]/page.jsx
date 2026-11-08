import { notFound } from "next/navigation";
import Answers from "@/components/answers";
import { pageMetadata } from "@/seo/metadata";
import { isAnswerRef, isEventId, isLinkKey, queryValue } from "@/server/flows";

/*
 * /answers/{eventId}/{ref}?k=: the details a club asked one person for after
 * they signed up (feature-register/missing-answers-contract.md §2.2), from
 * the link in the email, the app's notification or WhatsApp. `ref` names the
 * person (a registration's id, or "q" and a registration request's), `k` is
 * the link's key. The server checks the address's shape (else a 404) and
 * hands it over; the questions are read and answered in the browser. Without
 * `k`, the holder's own sign-in (an account, or the guest token a
 * registration left) opens it. Never indexed, kept, framed or passed on as a
 * referrer (next.config.mjs too); the apps open these links themselves
 * (src/seo/appLinks.js).
 */
export const dynamic = "force-dynamic";

export const metadata = {
  ...pageMetadata({ title: "Add your details", description: "The details the organisers still need for your registration.", path: null }),
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function AnswersPage({ params, searchParams }) {
  const { eventId, ref } = await params;
  if (!isEventId(eventId) || !isAnswerRef(ref)) notFound();
  const k = queryValue(((await searchParams) || {}).k);
  if (k && !isLinkKey(k)) notFound();
  return <Answers eventId={eventId} answerRef={ref} k={k} />;
}
