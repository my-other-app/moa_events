import ClientPage from "../../../_client/pages";
import { pageMetadata } from "@/seo/metadata";

/* Feedback after an event, from the link in the email. CLIENT PAGE (@/components/feedback). Never indexed. */
export const metadata = pageMetadata({ title: "Feedback", description: "Tell the organisers how it went.", path: null, noindex: true });

export default function Feedback() {
  return <ClientPage name="feedback" />;
}
