/**
 * An event's facts in words, for its share picture and its feed item: when
 * (India time), where, the price, and whether it is over.
 */
import { formatPrice } from "@/utils/format";
import { whenLine } from "@/utils/eventpage";

export function eventFacts(event, now = new Date()) {
  const when = whenLine(event.starts_at, now);
  return {
    when: when ? `${when} IST` : "",
    where: event.is_online ? "Online" : event.location_name || "Venue to be announced",
    online: Boolean(event.is_online),
    price: formatPrice(event.has_fee, event.fee),
    ended: event.status === "ended",
  };
}
