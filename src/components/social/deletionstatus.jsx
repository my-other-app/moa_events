"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { socialApi } from "@/api/social";
import { CONTACT_EMAIL } from "@/config";
import { formatWhen } from "@/utils/format";
import Icon from "../discover/icons";

/**
 * The status of a data deletion request, at the top of /data-deletion when
 * Facebook sends someone there with `?code=<confirmation code>`
 * (GET /api/v1/social/data-deletion/{code}). Nothing without a code. A code
 * we don't know (DELETION_NOT_FOUND) says so; an API that can't look codes
 * up yet (404 with no code, or no answer) says what happens anyway, with the
 * code to quote to us.
 */
const CODE = /^[A-Za-z0-9_-]{4,40}$/;

export function DeletionStatus() {
  const params = useSearchParams();
  const raw = (params.get("code") || "").trim();
  const code = CODE.test(raw) ? raw : null;
  const [s, setS] = useState({ state: "idle", data: null });

  useEffect(() => {
    if (!code) {
      setS({ state: raw ? "bad" : "idle", data: null });
      return undefined;
    }
    let alive = true;
    setS({ state: "loading", data: null });
    socialApi.deletionStatus(code).then(
      (data) => alive && setS({ state: "ready", data }),
      (f) => alive && setS({ state: f?.code === "DELETION_NOT_FOUND" ? "unknown" : "unavailable", data: null }),
    );
    return () => {
      alive = false;
    };
  }, [code, raw]);

  if (s.state === "idle") return null;
  let title;
  let text;
  let tone = "calm";
  if (s.state === "loading") {
    return (
      <div className="dd-status" role="status" aria-label="Looking up your request">
        <span className="dc-skel dd-status-skel" />
      </div>
    );
  }
  if (s.state === "ready") {
    const d = s.data;
    const done = d.status === "completed";
    tone = done ? "good" : "calm";
    title = done ? "Your data has been deleted" : "Your request is being processed";
    const when = formatWhen(done ? d.completedAt : d.requestedAt);
    text = `${done ? "Done" : "Received"}${when ? ` on ${when} IST` : ""}. ${d.what || "The connected accounts' access tokens, names, handles and pictures, and your Facebook id."}`;
  } else if (s.state === "unknown") {
    title = "We can't find that request";
    text = `No deletion request has the code ${code}. Check that the whole link was copied, or write to ${CONTACT_EMAIL} with the code.`;
  } else if (s.state === "bad") {
    title = "That code doesn't look right";
    text = `Check that the whole link was copied from Facebook, or write to ${CONTACT_EMAIL}.`;
  } else {
    title = "We've got your request";
    text = `We can't show its status just now, but a deletion request from Facebook is carried out as soon as it reaches us (what we delete is below). Questions? Write to ${CONTACT_EMAIL} and quote ${code}.`;
  }
  return (
    <div className={`dd-status is-${tone}`} role="status">
      <Icon name={tone === "good" ? "check" : "shield"} size={22} />
      <div>
        <p className="dd-status-title">{title}</p>
        {code ? <p className="dd-status-code">Confirmation code: {code}</p> : null}
        <p className="dd-status-text">{text}</p>
      </div>
    </div>
  );
}
