"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { speakersApi } from "@/api/speakers";
import { useAuth } from "@/auth/context";
import { CLAIM_REASONS, describeSpeakerError, speakerPath } from "@/utils/speakers";
import { SitePage } from "../discover/chrome";
import { Face } from "../discover/eventparts";
import Icon from "../discover/icons";
import { Spinner } from "../register/finishpayment";

/**
 * /speakers/claim/{token}: a speaker claims the profile clubs made for them,
 * from the link in our invite email (feature-register/speakers-contract.md).
 *
 *   GET  /speakers/claim/{token}   what the link is for (no token: the link
 *                                  is what it is about): the profile, the
 *                                  address it was sent to (masked), and
 *                                  whether it can still be used
 *   POST /speakers/claim/{token}   claims it for the signed-in account
 *
 * Signed out, "Sign in to claim" opens sign-in and claims once signed in.
 * Nothing is claimed without the person pressing a button. A link that
 * can't be used says why (used, replaced, expired, claimed already); an
 * account that has a profile already is told to write to us.
 *
 * The first paint (the server's, and the browser's first) is the loading
 * card: the link is read in the browser.
 */

function Card({ profile, emailMasked }) {
  return (
    <div className="sp-claim-card">
      <Face name={profile.name} src={profile.photo} size={72} />
      <div>
        <p className="sp-claim-name">{profile.name}</p>
        {profile.headline ? <p className="sp-claim-headline">{profile.headline}</p> : null}
        {profile.talksCount ? (
          <p className="sp-claim-meta">
            {profile.talksCount} {profile.talksCount === 1 ? "talk" : "talks"} at events on MyOtherApp
          </p>
        ) : null}
        {emailMasked ? <p className="sp-claim-meta">Invite sent to {emailMasked}</p> : null}
      </div>
    </div>
  );
}

function Closed({ title, text, children = null }) {
  return (
    <div className="rg-closed" role="status">
      <span className="rg-closed-icon" aria-hidden="true">
        <Icon name="award" size={26} />
      </span>
      <h1 className="rg-h1">{title}</h1>
      <p className="rg-closed-text">{text}</p>
      <div className="rg-closed-actions">
        {children}
        <Link className="dc-btn dc-btn--ghost" href="/events">
          Find events
        </Link>
      </div>
    </div>
  );
}

export default function SpeakerClaim({ token }) {
  const auth = useAuth();
  const signedIn = auth.ready && auth.status === "signed-in";
  const [load, setLoad] = useState({ status: "loading", preview: null, problem: null });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [done, setDone] = useState(null);
  const heading = useRef(null);

  useEffect(() => {
    let alive = true;
    speakersApi.claimPreview(token).then(
      (preview) => alive && setLoad({ status: "ready", preview, problem: null }),
      (error) => {
        if (!alive) return;
        const p = describeSpeakerError(error);
        setLoad({ status: p.kind === "gone" || p.kind === "off" ? "gone" : "error", preview: null, problem: p });
      },
    );
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (done) heading.current?.focus({ preventScroll: true });
  }, [done]);

  const claim = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await speakersApi.claim(token);
      setDone({ slug: typeof r?.slug === "string" && r.slug ? r.slug : load.preview?.profile?.slug || null });
    } catch (error) {
      setProblem(describeSpeakerError(error));
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (load.status === "loading") {
    body = (
      <div className="rg-skel" role="status" aria-label="Loading your invite">
        <span className="dc-skel rg-skel-title" />
        <span className="dc-skel rg-skel-lede" />
      </div>
    );
  } else if (load.status === "gone") {
    body = <Closed title="This link isn’t valid" text={CLAIM_REASONS.invalid} />;
  } else if (load.status === "error") {
    body = <Closed title="Your invite didn’t load" text={load.problem?.message || "Try again in a moment."} />;
  } else if (done) {
    body = (
      <div className="rg-closed is-good" role="status">
        <span className="rg-closed-icon" aria-hidden="true">
          <Icon name="check" size={26} />
        </span>
        <h1 className="rg-h1" ref={heading} tabIndex={-1}>
          Your speaker profile is yours
        </h1>
        <p className="rg-closed-text">You can now change your name, headline, photo, bio and links. Clubs that add you to their events will find you by name.</p>
        <div className="rg-closed-actions">
          <Link className="dc-btn" href="/speakers/me">
            Edit your profile
          </Link>
          {done.slug ? (
            <Link className="dc-btn dc-btn--ghost" href={speakerPath(done.slug)}>
              See your page
            </Link>
          ) : null}
        </div>
      </div>
    );
  } else {
    const { preview } = load;
    if (!preview.valid || !preview.profile) {
      body = (
        <Closed title="This invite can’t be used" text={CLAIM_REASONS[preview.reason] || preview.message || CLAIM_REASONS.invalid}>
          {preview.reason === "used" || preview.reason === "claimed" ? (
            <Link className="dc-btn" href="/speakers/me">
              Edit my profile
            </Link>
          ) : null}
        </Closed>
      );
    } else {
      body = (
        <div className="rg-closed sp-claim">
          <span className="rg-closed-icon" aria-hidden="true">
            <Icon name="award" size={26} />
          </span>
          <h1 className="rg-h1">Claim your speaker profile</h1>
          <p className="rg-closed-text">
            Clubs on MyOtherApp have added you to their events. Claim this profile to keep it up to date yourself, on every event that names you.
          </p>
          <Card profile={preview.profile} emailMasked={preview.emailMasked} />
          {problem ? (
            <p className="sp-note is-error" role="alert">
              {problem.message}
              {problem.kind === "has" ? (
                <>
                  {" "}
                  <Link href="/speakers/me">See your profile</Link>.
                </>
              ) : null}
            </p>
          ) : null}
          <div className="rg-closed-actions">
            {!auth.ready ? null : signedIn ? (
              <button type="button" className="dc-btn" onClick={claim} disabled={busy}>
                {busy ? (
                  <>
                    <Spinner />
                    Claiming…
                  </>
                ) : (
                  "Claim this profile"
                )}
              </button>
            ) : auth.enabled ? (
              <button type="button" className="dc-btn" onClick={() => auth.openSignIn({ reason: "speaker", onDone: () => claim() })}>
                Sign in to claim
              </button>
            ) : (
              <p className="rg-closed-text">Signing in isn&rsquo;t available on this site right now. Try again later.</p>
            )}
            {preview.profile.slug ? (
              <Link className="dc-btn dc-btn--ghost" href={speakerPath(preview.profile.slug)}>
                See the page first
              </Link>
            ) : null}
          </div>
          {signedIn ? (
            <p className="sp-claim-as">
              Signed in as <strong>{auth.user?.email || auth.user?.name}</strong>. The profile will belong to this account.
            </p>
          ) : null}
        </div>
      );
    }
  }

  return (
    <SitePage>
      <div className="dc-wrap sp-page">{body}</div>
    </SitePage>
  );
}
