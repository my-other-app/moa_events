import { redirectLegacy } from "@/server/legacy";

/* /{ref}/compete: the old competition address. A 308 to /events/{slug}/compete. */
export const dynamic = "force-dynamic";

export default async function LegacyCompete({ params, searchParams }) {
  const { ref } = await params;
  await redirectLegacy({ ref, sub: "compete", searchParams: await searchParams });
}
