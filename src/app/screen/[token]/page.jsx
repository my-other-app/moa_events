import { notFound } from "next/navigation";
import ScreenPage from "@/components/games/screen";
import { pageMetadata } from "@/seo/metadata";

/* /screen/{token}: the venue screen for a projector. Signed, read-only, no login; never indexed. */
export const dynamic = "force-dynamic";

export const metadata = pageMetadata({ title: "Venue screen", description: "Live boards for the venue.", path: null, noindex: true });

export default async function Screen({ params }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9._-]{8,200}$/.test(String(token))) notFound();
  return <ScreenPage screenToken={token} />;
}
