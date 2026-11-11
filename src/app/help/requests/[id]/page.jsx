import { notFound } from "next/navigation";
import RequestThread from "@/components/help/thread";
import { pageMetadata } from "@/seo/metadata";

/*
 * /help/requests/{id}: one of the signed-in person's requests to the
 * support desk, its thread and a reply box (components/help/thread.jsx).
 * The server checks the address's shape (404 otherwise); the request is read
 * in the browser with the person's own sign-in. Never indexed.
 */
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export const metadata = {
  ...pageMetadata({ title: "Your request", description: "Your request to MyOtherApp's support team, and our replies.", path: null }),
  robots: { index: false, follow: false },
};

export default async function RequestPage({ params }) {
  const { id } = await params;
  if (!ID.test(String(id || ""))) notFound();
  return <RequestThread id={id} />;
}
