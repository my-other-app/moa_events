import { useEffect, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { discoverApi } from "@/api/discover";
import NotFound from "@/components/notfound";
import { eventPath } from "@/utils/eventpage";
import { ErrorState } from "./bits";
import { SitePage } from "./chrome";
import { EventSkeleton } from "./eventparts";
import "@/styles/event-page.css";

/** What an event can be called in an address: a slug or a numeric id. Anything else is not an event. */
const REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/** Looks the event up by whatever the address calls it. */
function useEvent(ref) {
  const [state, setState] = useState({ status: "loading", event: null, ref });
  const [attempt, setAttempt] = useState(0);
  const valid = REF.test(ref || "");
  useEffect(() => {
    if (!valid) return undefined;
    let alive = true;
    setState((s) => (s.ref === ref && s.status === "ready" ? s : { status: "loading", event: null, ref }));
    discoverApi.event(ref, { fresh: attempt > 0 }).then(
      (page) => alive && setState({ status: "ready", event: page.event, ref }),
      (e) => alive && setState({ status: e?.notFound ? "missing" : "error", event: null, ref })
    );
    return () => {
      alive = false;
    };
  }, [ref, valid, attempt]);
  if (!valid) return { status: "missing", event: null, retry: () => {} };
  const current = state.ref === ref ? state : { status: "loading", event: null };
  return { ...current, retry: () => setAttempt((a) => a + 1) };
}

function Failed({ onRetry }) {
  return (
    <SitePage>
      <div className="dc-wrap">
        <div className="dc-section">
          <ErrorState message="We couldn't load this event right now. Check your connection and try again." onRetry={onRetry} />
        </div>
      </div>
    </SitePage>
  );
}

/** A quiet holding screen for the event's own pages (the form, the live room) while the event is found. */
function Holding() {
  return (
    <div className="ep-holding dc-scope" role="status" aria-label="Loading">
      <span className="ep-holding-dot" />
      <span className="ep-holding-dot" />
      <span className="ep-holding-dot" />
    </div>
  );
}

/**
 * The addresses printed on posters, in emails and in the app's share
 * links: /{id or slug}, /{ref}/live, /{ref}/compete and /register/{ref}.
 * Each finds the event and moves to its page under /events/{slug},
 * keeping the query (ref, sref, utm_*) and the #fragment. Forever.
 */
export function LegacyEventRedirect({ sub = "" }) {
  const { ref } = useParams();
  const { search, hash } = useLocation();
  const { status, event, retry } = useEvent(ref);
  if (status === "missing") return <NotFound />;
  if (status === "error") return <Failed onRetry={retry} />;
  if (status === "loading") {
    return sub ? (
      <Holding />
    ) : (
      <SitePage>
        <EventSkeleton />
      </SitePage>
    );
  }
  return <Navigate replace to={{ pathname: eventPath(event, sub), search, hash }} />;
}

/**
 * The event's own pages under /events/{slug}/…: the registration form, the
 * live room, the competition. They work with the event's numeric id, so the
 * slug is turned into one first; `children` is called with the event.
 */
export function EventScoped({ sub, children }) {
  const { slug } = useParams();
  const { search, hash } = useLocation();
  const { status, event, retry } = useEvent(slug);
  if (status === "missing") return <NotFound />;
  if (status === "error") return <Failed onRetry={retry} />;
  if (status === "loading") return <Holding />;
  if (event.slug && event.slug !== slug) return <Navigate replace to={{ pathname: eventPath(event, sub), search, hash }} />;
  return children(event);
}
