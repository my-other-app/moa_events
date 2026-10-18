import { redirectLegacy } from "@/server/legacy";

/* /register/{ref}: the old registration form. A 308 to /events/{slug}/register. */
export const dynamic = "force-dynamic";

export default async function LegacyRegister({ params, searchParams }) {
  const { ref } = await params;
  await redirectLegacy({ ref, sub: "register", searchParams: await searchParams });
}
