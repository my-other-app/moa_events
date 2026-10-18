import ClientPage from "../_client/pages";
import { EVENTS_FEED, pageMetadata } from "@/seo/metadata";

/* Find events. CLIENT PAGE (@/components/discover/eventspage): its filters live in the address. */
export const metadata = pageMetadata({
  title: "Find events",
  description: "Hackathons, workshops, meetups and more near you, from the clubs on MyOtherApp.",
  path: "/events",
  rss: EVENTS_FEED,
});

export default function Events() {
  return <ClientPage name="events" />;
}
