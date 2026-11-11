"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { speakersApi } from "@/api/speakers";
import { useAuth } from "@/auth/context";
import { LINK_KINDS, describeSpeakerError, safeLink, speakerPath } from "@/utils/speakers";
import { SitePage } from "../discover/chrome";
import { ErrorState } from "../discover/bits";
import { Face } from "../discover/eventparts";
import Icon from "../discover/icons";
import { Spinner } from "../register/finishpayment";

/**
 * /speakers/me: the speaker profile the signed-in person claimed, as they
 * edit it (GET|PATCH /api/v1/speakers/me, PUT /speakers/me/photo). Name,
 * headline, bio (600 characters), city, links and photo. A club's later
 * edits change only its own event's copy; this is the profile itself, and
 * what new events start from.
 *
 * Signed out: sign in. No profile on the account (404): how to get one (a
 * club adds them as a speaker; we email an invite to claim it). The first
 * paint is the loading card.
 */
const BIO_MAX = 600;
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];

const formOf = (p) => ({
  name: p.name || "",
  headline: p.headline || "",
  bio: p.bio || "",
  city: p.city || "",
  // A link that isn't one (not http or https) isn't offered back: saving the links drops it.
  links: Object.fromEntries(LINK_KINDS.map(([k]) => [k, typeof p.rawLinks?.[k] === "string" && safeLink(p.rawLinks[k]) ? p.rawLinks[k] : ""])),
});

/** Only what changed, as PATCH /speakers/me takes it (an emptied field clears it; links are sent whole). */
export function profilePatch(before, after) {
  const out = {};
  for (const k of ["name", "headline", "bio", "city"]) if ((after[k] || "").trim() !== (before[k] || "").trim()) out[k] = after[k].trim();
  const links = Object.fromEntries(LINK_KINDS.map(([k]) => [k, (after.links[k] || "").trim()]).filter(([, v]) => v));
  const was = Object.fromEntries(LINK_KINDS.map(([k]) => [k, (before.links[k] || "").trim()]).filter(([, v]) => v));
  if (JSON.stringify(links) !== JSON.stringify(was)) out.links = links;
  return out;
}

function Field({ id, label, optional = false, error, hint, children }) {
  return (
    <div className={`rg-field${error ? " is-invalid" : ""}`}>
      <label className="rg-label" htmlFor={id}>
        {label}
        {optional ? <span className="rg-opt">Optional</span> : null}
      </label>
      {children}
      {hint ? <p className="rg-hint">{hint}</p> : null}
      <p className="rg-error" role={error ? "alert" : undefined}>
        {error ? (
          <>
            <Icon name="alert" size={15} />
            {error}
          </>
        ) : null}
      </p>
    </div>
  );
}

function Editor({ profile, onSaved }) {
  const id = useId();
  const [v, setV] = useState(() => formOf(profile));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const file = useRef(null);

  const set = (name) => (e) => setV((x) => ({ ...x, [name]: e.target.value }));
  const setLink = (kind) => (e) => setV((x) => ({ ...x, links: { ...x.links, [kind]: e.target.value } }));

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    const found = {};
    if (!v.name.trim()) found.name = "Your name can't be empty.";
    if (v.bio.length > BIO_MAX) found.bio = `Keep it under ${BIO_MAX} characters.`;
    for (const [k, label] of LINK_KINDS) if (v.links[k].trim() && !safeLink(v.links[k])) found[`links.${k}`] = `Enter your ${label} address as a link.`;
    setErrors(found);
    if (Object.keys(found).length) return;
    const patch = profilePatch(formOf(profile), v);
    if (!Object.keys(patch).length) {
      setNote({ tone: "calm", text: "Nothing has changed." });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const next = await speakersApi.updateMe(patch);
      if (next) onSaved(next);
      setNote({ tone: "good", text: "Saved. Your page shows it within a minute." });
    } catch (error) {
      const p = describeSpeakerError(error);
      if (p.kind === "fields") setErrors(Object.fromEntries(Object.entries(p.fields).map(([k, msg]) => [k, msg])));
      setNote({ tone: "error", text: p.message });
    } finally {
      setBusy(false);
    }
  };

  const pickPhoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!PHOTO_TYPES.includes(String(f.type).toLowerCase())) return setNote({ tone: "error", text: "Choose a PNG, JPG or WebP photo." });
    if (f.size > 5 * 1024 * 1024) return setNote({ tone: "error", text: "That photo is over 5 MB. Choose a smaller one." });
    setPhotoBusy(true);
    setNote(null);
    try {
      const next = await speakersApi.setMyPhoto(f);
      if (next) onSaved(next);
      setNote({ tone: "good", text: "Your new photo is in." });
    } catch (error) {
      setNote({ tone: "error", text: describeSpeakerError(error).message });
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <form className="sp-edit" noValidate onSubmit={save} aria-label="Your speaker profile">
      <div className="sp-edit-photo">
        <Face name={profile.name} src={profile.photo} size={96} />
        <div>
          <input ref={file} type="file" className="dc-sr" accept="image/png,image/jpeg,image/webp" onChange={pickPhoto} tabIndex={-1} aria-label="Choose a photo" />
          <button type="button" className="dc-btn dc-btn--ghost dc-btn--sm" onClick={() => file.current?.click()} disabled={photoBusy}>
            {photoBusy ? (
              <>
                <Spinner />
                Uploading…
              </>
            ) : (
              <>
                <Icon name="upload" size={16} /> Change photo
              </>
            )}
          </button>
          <p className="rg-hint">A square photo of you, PNG, JPG or WebP, up to 5 MB.</p>
        </div>
      </div>
      <div className="rg-fields">
        <Field id={`${id}-name`} label="Name" error={errors.name}>
          <input id={`${id}-name`} className="rg-input" maxLength={100} autoComplete="name" value={v.name} onChange={set("name")} />
        </Field>
        <Field id={`${id}-headline`} label="Headline" optional error={errors.headline} hint="Your role and where: “Engineer · Zoho”, “Professor of Physics, CUSAT”.">
          <input id={`${id}-headline`} className="rg-input" maxLength={200} value={v.headline} onChange={set("headline")} />
        </Field>
        <Field id={`${id}-bio`} label="Bio" optional error={errors.bio} hint={`${v.bio.length} of ${BIO_MAX} characters.`}>
          <textarea id={`${id}-bio`} className="rg-input rg-textarea" rows={5} maxLength={BIO_MAX} value={v.bio} onChange={set("bio")} />
        </Field>
        <Field id={`${id}-city`} label="City" optional error={errors.city}>
          <input id={`${id}-city`} className="rg-input" maxLength={100} autoComplete="address-level2" value={v.city} onChange={set("city")} />
        </Field>
        <fieldset className="rg-field sp-edit-links">
          <legend className="rg-label">Links</legend>
          {LINK_KINDS.map(([kind, label]) => (
            <Field key={kind} id={`${id}-${kind}`} label={label} optional error={errors[`links.${kind}`] || errors.links}>
              <input id={`${id}-${kind}`} className="rg-input" type="url" inputMode="url" placeholder="https://" maxLength={300} value={v.links[kind]} onChange={setLink(kind)} />
            </Field>
          ))}
        </fieldset>
      </div>
      {note ? (
        <p className={`sp-note is-${note.tone}`} role={note.tone === "error" ? "alert" : "status"}>
          {note.text}
        </p>
      ) : null}
      <div className="sp-edit-actions">
        <button type="submit" className="dc-btn" disabled={busy}>
          {busy ? (
            <>
              <Spinner />
              Saving…
            </>
          ) : (
            "Save"
          )}
        </button>
        <Link className="dc-btn dc-btn--ghost" href={speakerPath(profile.slug)}>
          See your page
        </Link>
      </div>
    </form>
  );
}

export default function MySpeakerProfile() {
  const auth = useAuth();
  const signedIn = auth.ready && auth.status === "signed-in";
  const [load, setLoad] = useState({ status: "loading", profile: null, problem: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!signedIn) return undefined;
    let alive = true;
    speakersApi.me().then(
      (profile) => alive && setLoad({ status: "ready", profile, problem: null }),
      (error) => {
        if (!alive) return;
        const p = describeSpeakerError(error);
        setLoad({ status: p.kind === "gone" || p.kind === "off" ? "none" : p.kind === "signin" ? "signin" : "error", profile: null, problem: p });
      },
    );
    return () => {
      alive = false;
    };
  }, [signedIn, attempt]);

  let body;
  if (!auth.ready || (signedIn && load.status === "loading")) {
    body = (
      <div className="rg-skel" role="status" aria-label="Loading your speaker profile">
        <span className="dc-skel rg-skel-title" />
        <span className="dc-skel rg-skel-lede" />
      </div>
    );
  } else if (!signedIn || load.status === "signin") {
    body = (
      <div className="rg-closed" role="status">
        <span className="rg-closed-icon" aria-hidden="true">
          <Icon name="award" size={26} />
        </span>
        <h1 className="rg-h1">Sign in to edit your speaker profile</h1>
        <p className="rg-closed-text">Use the account you claimed your profile with.</p>
        <div className="rg-closed-actions">
          {auth.enabled ? (
            <button type="button" className="dc-btn" onClick={() => auth.openSignIn({ reason: "speaker" })}>
              Sign in
            </button>
          ) : null}
        </div>
      </div>
    );
  } else if (load.status === "none") {
    body = (
      <div className="rg-closed" role="status">
        <span className="rg-closed-icon" aria-hidden="true">
          <Icon name="award" size={26} />
        </span>
        <h1 className="rg-h1">You don&rsquo;t have a speaker profile yet</h1>
        <p className="rg-closed-text">
          A profile is made when a club adds you as a speaker at its event. We then email you a link to claim it; open that link while signed in to this account.
        </p>
        <div className="rg-closed-actions">
          <Link className="dc-btn dc-btn--ghost" href="/events">
            Find events
          </Link>
        </div>
      </div>
    );
  } else if (load.status === "error") {
    body = <ErrorState title="Your profile didn't load" message={load.problem?.message} onRetry={() => setAttempt((a) => a + 1)} />;
  } else {
    body = (
      <>
        <header className="sp-edit-head">
          <p className="dc-eyebrow">
            <Icon name="award" size={16} /> Your speaker profile
          </p>
          <h1 className="rg-h1">{load.profile.name}</h1>
          <p className="rg-closed-text">What you write here is your profile on MyOtherApp. Clubs that add you to a new event start from it.</p>
        </header>
        <Editor key={load.profile.slug} profile={load.profile} onSaved={(profile) => setLoad((s) => ({ ...s, profile }))} />
      </>
    );
  }

  return (
    <SitePage>
      <div className="dc-wrap sp-page">{body}</div>
    </SitePage>
  );
}
