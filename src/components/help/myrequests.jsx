"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supportApi } from "@/api/support";
import { useAuth } from "@/auth/context";
import { caseNumber, statusLabel } from "@/utils/help";
import { timeAgo } from "@/utils/format";
import Icon from "../discover/icons";
import { StatusChip } from "./helpbits";

/**
 * "My requests" on /help: the signed-in person's own requests
 * (GET /api/v1/support/requests), newest first, each a link to its thread
 * (/help/requests/{id}); a dot on those with a reply they haven't read.
 *
 * Nothing at all until the browser knows who is reading (the server's
 * paint has no one), for a guest on a site without sign-in, and while the
 * API has no desk (404): there is then nothing to list. Signed out with
 * sign-in on: one line offering it. A request sent from the form above is
 * added at once (the form says "moa:help-sent").
 */
export function MyRequests() {
  const auth = useAuth();
  const signedIn = auth.ready && auth.status === "signed-in";
  const [load, setLoad] = useState({ status: "idle", items: [] });
  const [attempt, setAttempt] = useState(0);
  const again = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (!signedIn) {
      setLoad({ status: "idle", items: [] });
      return undefined;
    }
    let alive = true;
    setLoad((s) => ({ ...s, status: s.items.length ? "ready" : "loading" }));
    supportApi.mine().then(
      (items) => alive && setLoad(items === null ? { status: "off", items: [] } : { status: "ready", items }),
      () => alive && setLoad((s) => ({ ...s, status: s.items.length ? "ready" : "error" })),
    );
    return () => {
      alive = false;
    };
  }, [signedIn, attempt]);

  useEffect(() => {
    window.addEventListener("moa:help-sent", again);
    return () => window.removeEventListener("moa:help-sent", again);
  }, [again]);

  if (!auth.ready) return null;
  if (!signedIn) {
    if (!auth.enabled) return null;
    return (
      <section id="mine" className="hp-mine" aria-labelledby="hp-mine-title">
        <h2 id="hp-mine-title" className="hp-h2">
          My requests
        </h2>
        <p className="hp-mine-empty">
          Asked us something while signed in?{" "}
          <button type="button" className="rg-textbtn" onClick={() => auth.openSignIn({ reason: "help" })}>
            Sign in to see your requests
          </button>
        </p>
      </section>
    );
  }
  if (load.status === "off" || load.status === "idle") return null;

  return (
    <section id="mine" className="hp-mine" aria-labelledby="hp-mine-title">
      <h2 id="hp-mine-title" className="hp-h2">
        My requests
      </h2>
      {load.status === "loading" ? (
        <div className="hp-rows" role="status" aria-label="Loading your requests">
          {[0, 1].map((i) => (
            <span key={i} className="dc-skel hp-row-skel" />
          ))}
        </div>
      ) : load.status === "error" ? (
        <p className="hp-mine-empty" role="alert">
          Your requests didn&rsquo;t load.{" "}
          <button type="button" className="rg-textbtn" onClick={again}>
            Try again
          </button>
        </p>
      ) : load.items.length === 0 ? (
        <p className="hp-mine-empty">You haven&rsquo;t asked us anything yet. When you do, you&rsquo;ll find it here with our replies.</p>
      ) : (
        <ul className="hp-rows">
          {load.items.map((r) => (
            <li key={r.id}>
              <Link className={`hp-row${r.unread ? " is-unread" : ""}`} href={`/help/requests/${encodeURIComponent(r.id)}`}>
                <span className="hp-row-main">
                  <span className="hp-row-title">
                    {r.unread ? <span className="hp-dot" aria-label="New reply" /> : null}
                    {r.subject || `Request ${caseNumber(r.number)}`.trim()}
                  </span>
                  <span className="hp-row-meta">
                    {caseNumber(r.number)}
                    {r.updatedAt ? ` · ${timeAgo(r.updatedAt)}` : ""}
                  </span>
                </span>
                <StatusChip status={r.status} label={statusLabel(r.status)} />
                <Icon name="chevronRight" size={18} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
