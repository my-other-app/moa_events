import { SitePage } from "@/components/discover/chrome";
import { NetworkInApp } from "@/components/profiles/profileview";

/*
 * /network?event={id}: the link in the morning-after recap (push and email)
 * into the app's Network tab (feature-register/profiles-networking-contract.md).
 * The Network is the app's alone: with the app installed the phone opens it
 * there; this page is for everyone else and says where it lives, with
 * "Open in the app" (the same address, ?event= kept) and the store badges.
 * No sign-in and no API call. Never indexed or kept (next.config.mjs).
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Your Network", robots: { index: false, follow: false } };

const EVENT_ID = /^\d{1,12}$/;

export default async function NetworkRoute({ searchParams }) {
  const sp = (await searchParams) || {};
  const raw = Array.isArray(sp.event) ? sp.event[0] : sp.event;
  const eventId = EVENT_ID.test(String(raw ?? "")) ? String(raw) : null;
  return (
    <SitePage>
      <NetworkInApp eventId={eventId} />
    </SitePage>
  );
}
