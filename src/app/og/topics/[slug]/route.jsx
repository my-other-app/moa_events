import { ImageResponse } from "next/og";
import { plural } from "@/utils/format";
import { ogFonts } from "@/og/assets";
import { TopicCard } from "@/og/layouts";
import { ApiError } from "@/server/api";
import { getTopic } from "@/server/topics";

/**
 * GET /og/topics/{slug} — a topic's share picture (1200×630): its colour,
 * its name, its words, a few of its interests and how many upcoming events
 * and clubs it has. og:image points here with a ?v= that changes when what
 * it shows does (as the event and club pictures do).
 */
const CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(request, { params }) {
  const { slug } = await params;
  let found;
  try {
    found = await getTopic(slug);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return new Response("The picture can't be made right now", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  if (!found) return new Response("No such topic", { status: 404, headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
  const { topic } = found;
  const facts = {
    events: topic.upcoming_events ? `${plural(topic.upcoming_events, "upcoming event")}` : null,
    clubs: topic.clubs ? plural(topic.clubs, "club") : null,
  };
  return new ImageResponse(<TopicCard topic={topic} facts={facts} />, {
    width: 1200,
    height: 630,
    fonts: await ogFonts(),
    headers: { "Cache-Control": CACHE },
  });
}
