/**
 * Who hosts an event: its club (the host, which never changes) and the
 * clubs that accepted the host's invitation to co-host it (the API's
 * docs/COHOSTS.md, `cohosts` on the event's page and on every card). The
 * host always comes first, then the co-hosts in the order they accepted.
 *
 * An API without co-hosts sends no `cohosts`: every helper here then gives
 * exactly what the site showed before (the club alone).
 */

/** The same club, by id or by slug. */
export const sameClub = (a, b) =>
  Boolean(a && b) && ((a.id !== null && a.id !== undefined && b.id !== null && b.id !== undefined && String(a.id) === String(b.id)) || (Boolean(a.slug) && a.slug === b.slug));

/**
 * The hosts, in order: the club, then each co-host once (a co-host that is
 * the club itself, or listed twice, is left out). `club` may be null.
 */
export function hostsOf(club, cohosts) {
  const out = club ? [club] : [];
  for (const c of Array.isArray(cohosts) ? cohosts : []) {
    if (c && c.name && !out.some((h) => sameClub(h, c))) out.push(c);
  }
  return out;
}

/** A card's or a page's hosts: `{club, cohosts}`. */
export const eventHosts = (x) => hostsOf(x?.club || null, x?.cohosts);

/** True when the event has a co-host. */
export const isCohosted = (x) => eventHosts(x).length > 1;

/** Names as a sentence: "A", "A and B", "A, B and C". */
export function joinNames(names) {
  const list = (names || []).map((n) => String(n ?? "").trim()).filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** Every host's name as a sentence ("Design Society and Robotics Club"); "" for none. */
export const hostNames = (hosts) => joinNames((hosts || []).map((h) => h?.name));

/** "Hosted by A", "Hosted by A and B", "Hosted by A, B and C"; "" for none. */
export function hostedBy(hosts) {
  const names = hostNames(hosts);
  return names ? `Hosted by ${names}` : "";
}

/**
 * The hosts in few words, for a card: "A", "A and B", then "A + 2" for
 * three or more.
 */
export function hostsShort(hosts) {
  const list = (hosts || []).filter((h) => h && h.name);
  if (list.length <= 2) return hostNames(list);
  return `${list[0].name} + ${list.length - 1}`;
}
