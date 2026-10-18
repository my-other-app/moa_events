import ClientPage from "../../_client/pages";
import { pageMetadata } from "@/seo/metadata";

/* A certificate, from the link in the email. CLIENT PAGE (@/components/certificate). Never indexed. */
export const metadata = pageMetadata({ title: "Certificate", description: "Your certificate on MyOtherApp.", path: null, noindex: true });

export default function Certificate() {
  return <ClientPage name="certificate" />;
}
