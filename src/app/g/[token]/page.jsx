import { notFound } from "next/navigation";
import { BadgeLanding } from "@/components/games/badge";
import { pageMetadata } from "@/seo/metadata";

/*
 * /g/{token}: what a badge QR opens (or a hunt code opened from the phone's
 * camera app). The token is checked by the API in the browser; here only its
 * shape. Never indexed, never cached: it is a personal link.
 */
export const dynamic = "force-dynamic";

export const metadata = pageMetadata({ title: "Join the game", description: "Join the game at your event.", path: null, noindex: true });

export default async function BadgePage({ params }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9._-]{8,200}$/.test(String(token))) notFound();
  return <BadgeLanding token={token} />;
}
