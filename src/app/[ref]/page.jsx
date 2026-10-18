import { redirectLegacy } from "@/server/legacy";

/*
 * /{id or slug}: an old event address (posters, QR codes on tickets,
 * emails, the app's share links). A 308 to /events/{slug}, query kept; the
 * 404 page for anything that isn't a public event. Never rendered.
 */
export const dynamic = "force-dynamic";

export default async function LegacyEvent({ params, searchParams }) {
  const { ref } = await params;
  await redirectLegacy({ ref, searchParams: await searchParams });
}
