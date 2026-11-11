"use client";

import { useEffect, useState } from "react";
import { helpHref } from "@/utils/help";
import Icon from "../discover/icons";

/**
 * "Get help", beside an error that used to say only "write to
 * support@myotherapp.in": /help, in a new tab (the person keeps their place
 * in a payment or a sign-in), with what went wrong filled in.
 *
 *   help   {topic, errorCode, trackId, eventId}: utils/help.js's helpHref.
 *          The page it was pressed on goes along too (`from`), masked, once
 *          the page is in the browser (the server's paint has none).
 */
export function GetHelpLink({ help, className = "dc-btn dc-btn--ghost dc-btn--sm hp-gethelp", children = "Get help" }) {
  const topic = help?.topic ?? null;
  const errorCode = help?.errorCode ?? null;
  const trackId = help?.trackId ?? null;
  const eventId = help?.eventId ?? null;
  const [href, setHref] = useState(() => helpHref({ topic, errorCode, trackId, eventId }));
  useEffect(() => {
    setHref(helpHref({ topic, errorCode, trackId, eventId, from: window.location.href }));
  }, [topic, errorCode, trackId, eventId]);
  return (
    <a className={className} href={href} target="_blank" rel="noopener">
      <Icon name="comment" size={15} />
      {children}
      <span className="dc-sr"> (opens in a new tab)</span>
    </a>
  );
}
