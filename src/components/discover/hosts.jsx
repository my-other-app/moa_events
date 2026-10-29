import { Fragment } from "react";
import { Link } from "@/lib/router";
import { clubPagePath } from "@/seo/urls";
import { hostNames, hostsShort } from "@/utils/hosts";
import { Avatar } from "./bits";

/*
 * An event's hosts (src/utils/hosts.js): its club, then the clubs that
 * co-host it. Shared by the event's page and its cards; nothing here reads
 * the browser.
 */

/**
 * The hosts' logos, overlapping, the host's first; past `max`, a "+N"
 * bubble (`more`; a card leaves it out: its words already say "+ N").
 * Only decoration: the names beside it say who.
 */
export function HostFaces({ hosts, size = 24, max = 3, more = true, className = "" }) {
  const shown = hosts.slice(0, max);
  const rest = more ? hosts.length - shown.length : 0;
  return (
    <span className={`dc-faces${className ? ` ${className}` : ""}`} aria-hidden="true">
      {shown.map((h, i) => (
        <Avatar key={h.slug || h.id || i} name={h.name} src={h.logo} size={size} />
      ))}
      {rest > 0 ? (
        <span className="dc-avatar dc-faces-more" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

/** "A and B", "A, B and C": each name a link to its club's page (a club without an address is plain text). */
export function HostLinks({ hosts }) {
  return hosts.map((h, i) => (
    <Fragment key={h.slug || h.id || i}>
      {i === 0 ? null : i === hosts.length - 1 ? " and " : ", "}
      {h.slug ? <Link to={clubPagePath(h)}>{h.name}</Link> : h.name}
    </Fragment>
  ));
}

/**
 * The hosts in few words, for a card: "A and B", or "A + 2" for three or
 * more, which a screen reader hears as every name.
 */
export function HostsShort({ hosts }) {
  if (hosts.length <= 2) return hostNames(hosts);
  return (
    <>
      <span aria-hidden="true">{hostsShort(hosts)}</span>
      <span className="dc-sr">{hostNames(hosts)}</span>
    </>
  );
}
