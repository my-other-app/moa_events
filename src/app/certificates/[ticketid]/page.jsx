import { notFound } from "next/navigation";
import Certificate from "@/components/certificate";
import { pageMetadata } from "@/seo/metadata";
import { isKey } from "@/server/flows";

/* A certificate, from the link in the email or My tickets: as a ticket. Never indexed. */
export const dynamic = "force-dynamic";

export const metadata = pageMetadata({ title: "Certificate", description: "Your certificate on MyOtherApp.", path: null, noindex: true });

export default async function CertificatePage({ params }) {
  const { ticketid } = await params;
  if (!isKey(ticketid)) notFound();
  return <Certificate ticketid={ticketid} />;
}
