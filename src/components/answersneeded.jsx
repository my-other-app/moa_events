"use client";

import Link from "next/link";
import { addThem, byWhen, detailsNeeded } from "@/utils/answers";

/**
 * "2 details needed · Add them": the club asked this person for answers it
 * is missing since they signed up (feature-register/missing-answers-contract.md
 * §2.4), where a ticket or a registration is shown: My tickets' rows, the
 * ticket's own page and a registration's page. The link is the person's own
 * answers page (/answers/...). In the shape of the cancelled and revoked
 * notes (./cancelled, ./revoked), in amber: nothing is wrong with the ticket
 * (a missing answer never blocks it), there is just something to add.
 *
 * `needed` is utils/answers.js parseAnswersNeeded's {count, href, deadline};
 * nothing at all without it. `what`: what stays as it is ("ticket", or
 * "registration" for one under review), said on the full note only.
 */
export function AnswersNeededNote({ needed, compact = false, what = "ticket", className = "" }) {
  if (!needed?.href) return null;
  const by = byWhen(needed.deadline);
  const add = addThem(needed.count);
  return (
    <div className={`cx-note cx-note--needed${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`} role="status">
      <p className="cx-title">
        {detailsNeeded(needed.count)} ·{" "}
        <Link className="cx-link" href={needed.href}>
          {add}
        </Link>
      </p>
      {by ? (
        <p className="cx-when">
          {add} by {by}.
        </p>
      ) : null}
      {compact ? null : <p className="cx-when">The organisers asked for a few more details. Your {what === "registration" ? "registration" : "ticket"} stays as it is.</p>}
    </div>
  );
}

export default AnswersNeededNote;
