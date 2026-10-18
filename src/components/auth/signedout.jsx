"use client";

import { CLUBS_URL } from "@/config";
import Icon from "../discover/icons";

/** What each reason for an ending says (auth/session.js's notice). */
export const SIGNED_OUT_WORDS = {
  reused: "You were signed out for security — please sign in again.",
  club: "You were signed out: this is a club's account, and clubs sign in on the clubs dashboard, not here. To register for events, sign in with your own account.",
};

/**
 * Why this browser was just signed out, when that needs saying: the API
 * ended the session because its sign-in was used from two places
 * (SESSION_REUSED), or the account was a club's (CLUB_NOT_VERIFIED). Shown
 * once, in every open tab, until it is dismissed or someone signs in; it
 * never signs anyone in or out by itself.
 */
export default function SignedOutNotice({ reason, onSignIn, onDismiss }) {
  const words = SIGNED_OUT_WORDS[reason];
  if (!words) return null;
  return (
    <div className="dc-scope ac-signedout" role="alert">
      <p>{words}</p>
      <div className="ac-signedout-actions">
        {reason === "club" ? (
          <a className="ac-linkbtn" href={CLUBS_URL} target="_blank" rel="noopener noreferrer">
            Open the clubs dashboard
          </a>
        ) : null}
        <button type="button" className="dc-btn dc-btn--sm" onClick={onSignIn}>
          Sign in
        </button>
        <button type="button" className="dc-iconbtn" aria-label="Dismiss" onClick={onDismiss}>
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}
