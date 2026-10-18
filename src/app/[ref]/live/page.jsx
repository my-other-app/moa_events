import { redirectLegacy } from "@/server/legacy";

/* /{ref}/live: the old live room address. A 308 to /events/{slug}/live. */
export const dynamic = "force-dynamic";

export default async function LegacyLive({ params, searchParams }) {
  const { ref } = await params;
  await redirectLegacy({ ref, sub: "live", searchParams: await searchParams });
}
