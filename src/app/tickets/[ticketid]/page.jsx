import ClientPage from "../../_client/pages";
import { pageMetadata } from "@/seo/metadata";

/* A ticket, from the link in the email. CLIENT PAGE (@/components/ticket). Never indexed. */
export const metadata = pageMetadata({ title: "Your ticket", description: "Your ticket on MyOtherApp.", path: null, noindex: true });

export default function Ticket() {
  return <ClientPage name="ticket" />;
}
