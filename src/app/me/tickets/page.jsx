import { MyTicketsPage } from "@/components/me/mepages";
import { pageMetadata } from "@/seo/metadata";

/*
 * A signed-in person's tickets. Static on the server (the same neutral
 * first paint for everyone: who is signed in lives in the browser); the
 * client component reads the session and shows the list or the way in.
 * Never indexed.
 */
export const metadata = pageMetadata({ title: "My tickets", description: "Your tickets on MyOtherApp, on the web and in the app.", path: "/me/tickets", noindex: true, canonical: false });

export default function MyTickets() {
  return <MyTicketsPage />;
}
