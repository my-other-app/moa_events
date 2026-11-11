"use client";

import { useEffect, useRef, useState } from "react";
import { speakersApi } from "@/api/speakers";
import { useAuth } from "@/auth/context";
import { formatCount } from "@/utils/format";
import { describeSpeakerError } from "@/utils/speakers";
import Icon from "../discover/icons";

/**
 * Following a speaker, on their page: the button and the count beside it.
 * The page is rendered for nobody (ISR), so whether the reader follows them
 * is asked here once the browser knows who is reading
 * (GET /speakers/{slug} with their token). The button flips the moment it is
 * pressed and flips back if the API says no. Signed out, it opens sign-in
 * and follows once signed in; on a site without sign-in it isn't shown
 * (following then waits for the app).
 */
export function SpeakerFollow({ slug, name, followers: initial = 0 }) {
  const auth = useAuth();
  const signedIn = auth.ready && auth.status === "signed-in";
  const [s, setS] = useState({ known: false, on: false, busy: false, followers: initial, error: null, flips: 0 });
  // Pressed by the reader since the page opened: their press, not a late read, says what the button shows.
  const acted = useRef(false);

  useEffect(() => {
    if (!signedIn) {
      setS((x) => ({ ...x, known: false, on: false }));
      return undefined;
    }
    let alive = true;
    speakersApi.page(slug).then(
      (p) => alive && !acted.current && setS((x) => ({ ...x, known: true, on: p.following === true, followers: p.followers })),
      () => alive && !acted.current && setS((x) => ({ ...x, known: true })),
    );
    return () => {
      alive = false;
    };
  }, [slug, signedIn]);

  const set = (want) => {
    acted.current = true;
    setS((x) => ({ ...x, known: true, on: want, busy: true, error: null, flips: x.flips + 1, followers: Math.max(0, x.followers + (want ? 1 : -1)) }));
    (want ? speakersApi.follow(slug) : speakersApi.unfollow(slug)).then(
      (st) => setS((x) => ({ ...x, busy: false, on: st.following, followers: st.followers ?? x.followers })),
      (error) => {
        const p = describeSpeakerError(error);
        setS((x) => ({
          ...x,
          busy: false,
          on: !want,
          followers: Math.max(0, x.followers + (want ? -1 : 1)),
          error: p.kind === "app" || p.kind === "signin" ? p.message : want ? "Couldn't follow just now. Try again." : "Couldn't unfollow just now. Try again.",
        }));
      },
    );
  };

  const press = () => {
    if (s.busy) return;
    if (!signedIn) {
      auth.openSignIn({ reason: "follow", onDone: () => set(true) });
      return;
    }
    set(!s.on);
  };

  const count = (
    <span className="sp-followers">
      <Icon name="users" size={14} /> <strong>{formatCount(s.followers)}</strong> {s.followers === 1 ? "follower" : "followers"}
    </span>
  );
  // No sign-in on this site: the count alone.
  if (!auth.enabled) return s.followers > 0 ? count : null;

  return (
    <div className="sp-follow">
      <button
        type="button"
        className={`dc-btn ac-follow${s.on ? " is-on" : ""}`}
        aria-pressed={s.on}
        aria-busy={s.busy || undefined}
        aria-label={s.on ? `Following ${name}` : `Follow ${name}`}
        data-pop={s.on && s.flips ? "" : undefined}
        onClick={press}
      >
        <Icon name={s.on ? "check" : "plus"} size={18} />
        <span key={s.on ? "on" : "off"} className={s.flips ? "ac-follow-label is-swapped" : "ac-follow-label"}>
          {s.on ? "Following" : "Follow"}
        </span>
      </button>
      {count}
      {s.error ? (
        <p className="sp-follow-error" role="alert">
          {s.error}
        </p>
      ) : (
        <p className="dc-sr" role="status">
          {s.flips ? (s.on ? `You follow ${name}. We'll tell you when they're on a new event.` : `You don't follow ${name} any more.`) : ""}
        </p>
      )}
    </div>
  );
}
