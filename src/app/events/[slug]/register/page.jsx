import Register from "@/components/register/register";
import { eventFor, eventSubMetadata, registerClub, registerEvent } from "@/server/eventscoped";

/*
 * /events/{slug}/register. The server finds the event (404, 308 from an old
 * slug or an id, query kept) and sets the head (never indexed); the form is
 * a client component, server-rendered for the first paint (the event beside
 * the form's skeleton, or why registration isn't open) and interactive in
 * the browser. Per request: the query (?step=, ?ref=) is the page's.
 */
export const dynamic = "force-dynamic";

export function generateMetadata({ params }) {
  return eventSubMetadata({ params, sub: "register" });
}

export default async function EventRegister({ params, searchParams }) {
  const page = await eventFor({ params, searchParams, sub: "register" });
  return <Register event={registerEvent(page.event)} club={registerClub(page.club)} />;
}
