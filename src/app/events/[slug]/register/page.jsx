import ClientPage from "../../../_client/pages";
import { eventFor, eventSubMetadata } from "../../../_client/event-scoped";

/* /events/{slug}/register. CLIENT PAGE: the server finds the event; @/components/register/register runs in the browser. */
export const dynamic = "force-dynamic";

export function generateMetadata({ params }) {
  return eventSubMetadata({ params, sub: "register" });
}

export default async function EventRegister({ params, searchParams }) {
  const page = await eventFor({ params, searchParams, sub: "register" });
  return <ClientPage name="register" props={{ event: page.event, club: page.club }} />;
}
