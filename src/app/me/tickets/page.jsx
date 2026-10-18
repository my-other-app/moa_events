import ClientPage from "../../_client/pages";
import { pageMetadata } from "@/seo/metadata";

/* A signed-in person's tickets. CLIENT PAGE (@/components/me/mepages). Never indexed. */
export const metadata = pageMetadata({ title: "My tickets", description: "Your tickets on MyOtherApp, on the web and in the app.", path: "/me/tickets", noindex: true, canonical: false });

export default function MyTickets() {
  return <ClientPage name="me-tickets" />;
}
