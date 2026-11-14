"use client";

import { useEffect, useRef, useState } from "react";
import { profilesApi, vcardUrl } from "@/api/profiles";
import { useAuth } from "@/auth/context";
import { describeSaveError, firstName, profileSavePath } from "@/utils/profiles";
import { AppPrompt } from "../discover/dialog";
import Icon from "../discover/icons";
import { OpenInApp, useAndroid } from "./openinapp";
import { ProfileMissing, ProfileView } from "./profileview";

/**
 * The profile page's parts that depend on who is reading. The page's HTML is
 * the profile as nobody sees it (src/app/u/[handle]/page.jsx); once the
 * browser knows someone is signed in, the profile is asked for again with
 * their token, and whatever more it says (their relation, the sections they
 * may see, contact details shared with them) replaces it here.
 *
 *   Save to your network   only on the reader's own tap (never on opening the
 *                          page, ?save=1 or not): signed in, POST /network
 *                          {handle, method: "link"}, then "saved" or "you've
 *                          saved each other"; signed out, the app (open it on
 *                          Android, or get it), or sign in here and save
 *   Save contact           the API's vCard: as a plain link for anyone, and
 *                          fetched with the reader's token when signed in (so
 *                          it carries what they may see)
 *
 * ?save=1 (a QR's link, sent on from /p/{code}) only puts the offer first:
 * a link someone was sent is not a scan, and saving makes the two "met".
 */

/** True when the address asks to save (a scanned QR sent on from /p/{code}). */
export const wantsSave = (search) => {
  try {
    return new URLSearchParams(search || "").get("save") === "1";
  } catch {
    return false;
  }
};

export function ProfileLive({ profile: initial }) {
  const auth = useAuth();
  const signedIn = auth.ready && auth.status === "signed-in";
  const [viewer, setViewer] = useState(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    setGone(false);
    if (!signedIn) {
      setViewer(null);
      return undefined;
    }
    let alive = true;
    profilesApi.page(initial.handle).then(
      (p) => alive && setViewer(p),
      // 404 for this reader: blocked either way, or hidden since the page was made. Anything
      // else (no connection, the API's trouble): the page as everyone sees it stays.
      (f) => alive && f?.status === 404 && setGone(true),
    );
    return () => {
      alive = false;
    };
  }, [initial.handle, signedIn]);

  if (gone) return <ProfileMissing />;
  const profile = viewer || initial;
  return (
    <ProfileView
      profile={profile}
      actions={
        <>
          {profile.isMe ? null : <SaveToNetwork profile={profile} signedIn={signedIn} onSaved={(p) => p && setViewer(p)} />}
          {profile.locked ? null : <SaveContact handle={profile.handle} name={profile.name} signedIn={signedIn} />}
        </>
      }
    />
  );
}

/** What a finished save says. */
const savedLine = (r, first) => (r.mutual ? `Saved. You and ${first} have saved each other.` : r.created ? `${first} is in your network now.` : `${first} was in your network already.`);

export function SaveToNetwork({ profile, signedIn, onSaved = () => {} }) {
  const auth = useAuth();
  const android = useAndroid();
  const first = firstName(profile.name);
  const rel = profile.relation;
  const [s, setS] = useState({ busy: false, done: null, error: null });
  const [prompt, setPrompt] = useState(false);
  const [intent, setIntent] = useState(false);
  const saving = useRef(false);

  // ?save=1 is read once the page is in the browser (the HTML is the same for every address).
  useEffect(() => {
    setIntent(wantsSave(window.location.search));
  }, []);

  const saved = Boolean(s.done) || Boolean(rel?.savedByMe);
  const mutual = s.done ? s.done.mutual : Boolean(rel?.mutual);

  const save = () => {
    if (saving.current) return;
    saving.current = true;
    setS({ busy: true, done: null, error: null });
    profilesApi.save(profile.handle).then(
      (r) => {
        saving.current = false;
        setS({ busy: false, done: r, error: null });
        onSaved(r.profile);
      },
      (error) => {
        saving.current = false;
        setS({ busy: false, done: null, error: describeSaveError(error, profile.name).message });
      },
    );
  };

  const press = () => {
    if (s.busy || saved) return;
    if (signedIn) save();
    else setPrompt(true);
  };

  const signInToSave = () => {
    setPrompt(false);
    auth.openSignIn({ reason: "save", onDone: () => save() });
  };

  const status = s.error ? null : s.done ? savedLine(s.done, first) : mutual ? `You and ${first} have saved each other.` : rel?.savedMe ? `${first} saved you.` : null;

  return (
    <div className="pf-save">
      {intent && !saved ? <p className="pf-save-lead">Save {first} to your network, so you can find them again after the event.</p> : null}
      <button
        type="button"
        className={`dc-btn ac-follow${saved ? " is-on" : ""}`}
        aria-pressed={saved}
        aria-busy={s.busy || undefined}
        aria-label={saved ? `${first} is in your network` : `Save ${profile.name} to your network`}
        data-pop={s.done ? "" : undefined}
        onClick={press}
      >
        <Icon name={saved ? "check" : "plus"} size={18} />
        <span className="ac-follow-label">{saved ? (mutual ? "Saved each other" : "Saved") : "Save to your network"}</span>
      </button>
      {s.error ? (
        <p className="sp-follow-error" role="alert">
          {s.error}
        </p>
      ) : (
        <p className={status ? "pf-save-status" : "dc-sr"} role="status">
          {status || ""}
        </p>
      )}
      <AppPrompt
        open={prompt}
        onClose={() => setPrompt(false)}
        title={`Save ${first} to your network`}
        message={`Saving people happens in the MyOtherApp app: open ${first}'s profile there and tap Save, or scan their QR code. Free on your phone.`}
        alt={
          android || auth.enabled ? (
            <div className="pf-prompt-alt">
              <OpenInApp path={profileSavePath(profile.handle)} className="dc-btn dc-btn--ghost" />
              {auth.enabled ? (
                <button type="button" className="dc-btn dc-btn--ghost" onClick={signInToSave}>
                  Sign in to save here
                </button>
              ) : null}
            </div>
          ) : null
        }
      />
    </div>
  );
}

/**
 * "Save contact": the person's vCard. A plain link to the API's file for
 * anyone (it carries what everyone may see); signed in, it is fetched with
 * the reader's token, so it carries what they may see (email or phone
 * shared with them), and handed to the browser to save.
 */
export function SaveContact({ handle, name, signedIn }) {
  const href = vcardUrl(handle);
  const [busy, setBusy] = useState(false);

  const onClick = (e) => {
    if (!signedIn) return;
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    profilesApi.vcard(handle).then(
      (blob) => {
        setBusy(false);
        const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([String(blob ?? "")], { type: "text/vcard" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${handle}.vcf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      },
      () => {
        setBusy(false);
        // The file as everyone may have it, then.
        window.location.assign(href);
      },
    );
  };

  return (
    <a className="dc-btn dc-btn--ghost pf-vcard" href={href} rel="nofollow" aria-busy={busy || undefined} aria-label={`Save ${name}'s contact card`} onClick={onClick}>
      <Icon name="download" size={18} /> Save contact
    </a>
  );
}
