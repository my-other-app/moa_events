"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { postersApi } from "@/api/posters";
import { useAuth } from "@/auth/context";
import { cookieSessionOn } from "@/auth/cookiemode";
import { describePosterError, frameAspect, frameRadius, formatOf, posterFilename, unavailableWords } from "@/utils/poster";
import { CENTRED, clampFraming, sameFraming } from "@/utils/posterframe";
import { ACCEPT, preparePhoto } from "@/utils/posterphoto";
import { copyText } from "@/utils/sharefile";
import { ErrorState } from "../discover/bits";
import { SitePage } from "../discover/chrome";
import Icon from "../discover/icons";
import { PosterIcon } from "./cta";
import PhotoFramer from "./framer";
import { CaptionBox, FORMATS, FormatPicker, PosterPreview, ShareActions, Spinner } from "./parts";

/**
 * /posters/{ticket}: the guest's "I'm attending" poster
 * (feature-register/posters/CONTRACT.md §6). The server half
 * (src/app/posters/[ticketid]/page.jsx) checks the address and hands over
 * the ticket and the link's key (`?s=`, from the email); everything here
 * happens in the browser, with the key or the token that opens the ticket:
 *
 *   read        GET /posters/{ticket}: the event, the guest, the moment and
 *               its caption, the formats offered (each with its design's
 *               photo frame, the guest's framing and the render's state),
 *               the photo, and the key for every later call
 *   the photo   chosen, made ready in the browser (upright, at most 2048 px,
 *               a JPEG without the camera's details: utils/posterphoto.js),
 *               sent (POST …/photo); moved and zoomed in the frame
 *               (components/poster/framer.jsx), kept with "Update my
 *               poster" (PUT …/framing, every format); removed (DELETE)
 *   the poster  the format chosen, drawn by the server (POST …/render, then
 *               GET …/render/{format} until it is ready), shown from the PNG
 *               (GET …/image/{format}); Share (the phone's sheet with the
 *               file and the caption), Download, Copy caption, Copy link
 *
 * A guest without a photo still gets a poster: the design's frame shows
 * their initials. The name is always the registration's. The photo is only
 * ever this guest's: read with their key, shown from an object URL that is
 * let go of when the page is left, never kept in the browser's storage.
 */

/** The photo limit (§6.2): 12 MB; through the site's gateway (cookie sessions), what the gateway passes. */
const maxPhotoBytes = () => (cookieSessionOn() ? 9.5 * 1024 * 1024 : 12 * 1024 * 1024);

/** How long to wait for a drawing before saying so: the queue gives a poster up to two tries of 90 s. */
const DRAW_PATIENCE_MS = 150 * 1000;
const SLOW_AFTER_MS = 9000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const between = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function objectUrl(blob) {
  try {
    return typeof URL?.createObjectURL === "function" ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}
function revokeUrl(url) {
  try {
    if (url && typeof URL?.revokeObjectURL === "function") URL.revokeObjectURL(url);
  } catch {
    /* nothing to let go of */
  }
}

/** The poster with one format's render state replaced. */
const withRender = (poster, key, render) => ({
  ...poster,
  formats: poster.formats.map((f) => (f.key === key ? { ...f, render: { ...f.render, ...render } } : f)),
});

/* ---------- panels: loading, not available, not this browser's ---------- */

function Skeleton() {
  return (
    <div role="status" aria-label="Loading your poster">
      <span className="dc-skel rg-skel-title" style={{ display: "block", height: 44, width: "60%" }} />
      <span className="dc-skel dc-skel-line" style={{ display: "block", width: "90%", marginBottom: 22 }} />
      <div className="pp-layout">
        <div className="pp-preview-col">
          <span className="dc-skel" style={{ display: "block", aspectRatio: "1 / 1", borderRadius: 14 }} />
        </div>
        <div className="pp-controls">
          <span className="dc-skel" style={{ display: "block", height: 220, borderRadius: 16 }} />
        </div>
      </div>
    </div>
  );
}

function Panel({ icon = "poster", title, children, actions }) {
  return (
    <div className="rg-closed pp-panel" role="status">
      <span className="rg-closed-icon" aria-hidden="true">
        {icon === "poster" ? <PosterIcon size={26} /> : <Icon name={icon} size={26} />}
      </span>
      <h1 className="rg-h1">{title}</h1>
      {children}
      {actions ? <div className="rg-closed-actions">{actions}</div> : null}
    </div>
  );
}

/** Posters off, closed, or the ticket no longer good: why, and where to go. */
function Unavailable({ reason, event, ticketid }) {
  const words = unavailableWords(reason);
  const ticketOk = reason === "off" || reason === "not_sent" || reason === "moment_off";
  return (
    <Panel
      icon={reason === "not_sent" || reason === "moment_off" ? "calendar" : "poster"}
      title={words.title}
      actions={
        <>
          {ticketOk ? (
            <Link className="dc-btn" href={`/tickets/${encodeURIComponent(ticketid)}`}>
              View your ticket
            </Link>
          ) : null}
          {event?.path ? (
            <Link className={ticketOk ? "dc-btn dc-btn--ghost" : "dc-btn"} href={event.path}>
              Go to the event
            </Link>
          ) : null}
          {!ticketOk && !event?.path ? (
            <Link className="dc-btn" href="/me/tickets">
              My tickets
            </Link>
          ) : null}
        </>
      }
    >
      <p className="rg-closed-text">{words.text}</p>
    </Panel>
  );
}

/** A browser that may not open this poster (another account's, or nobody's), or no such ticket. */
function NotYours({ kind }) {
  const auth = useAuth();
  const signedIn = auth.ready && auth.status === "signed-in";
  if (kind === "missing") {
    return (
      <Panel
        icon="alert"
        title="No such ticket"
        actions={
          <Link className="dc-btn" href="/me/tickets">
            My tickets
          </Link>
        }
      >
        <p className="rg-closed-text">There&rsquo;s no ticket at this address. Check the link, or find your tickets in My tickets.</p>
      </Panel>
    );
  }
  return (
    <Panel
      icon="alert"
      title="This poster belongs to another ticket holder"
      actions={
        <Link className="dc-btn" href="/me/tickets">
          {auth.enabled && auth.ready && !signedIn ? "Sign in" : "My tickets"}
        </Link>
      }
    >
      <p className="rg-closed-text">
        Only the person the ticket is for can make its poster. Open the poster link in your ticket email, or sign in with the account you registered with.
      </p>
      {signedIn && auth.user?.email ? (
        <p className="rg-closed-text">
          You&rsquo;re signed in as <strong>{auth.user.email}</strong>.
        </p>
      ) : null}
    </Panel>
  );
}

/* ---------- the maker ---------- */

function PhotoCard({ poster, fmt, photoView, framing, onFraming, dirty, busy, said, onFile, onRemove, onApply }) {
  const fileId = "pp-photo-file";
  const has = Boolean(poster.photo);
  const working = busy !== null;
  return (
    <section className="pp-card" aria-labelledby="pp-photo-title">
      <h2 id="pp-photo-title" className="pp-card-title">
        {has ? "Your photo" : "Add your photo"}
      </h2>
      <p className="pp-card-text">
        {has
          ? "Move and zoom it until it sits well in the frame."
          : `A clear photo of your face works best. No photo? Your poster shows your initials${poster.guest?.initials ? ` (${poster.guest.initials})` : ""}.`}
      </p>
      {has ? (
        fmt?.frame ? (
          <PhotoFramer
            src={photoView?.url || null}
            natural={{ w: poster.photo.width, h: poster.photo.height }}
            aspect={frameAspect(fmt)}
            radius={frameRadius(fmt.frame)}
            framing={framing}
            onChange={onFraming}
            disabled={working}
          />
        ) : (
          <p className="pp-note">This format&rsquo;s design has no photo. Pick another format to see your photo on it.</p>
        )
      ) : null}
      {has && photoView?.failed ? <p className="pp-note">Your photo didn&rsquo;t load here, but it&rsquo;s saved. Your poster still uses it.</p> : null}
      <div className="pp-row">
        {has && dirty ? (
          <button type="button" className="dc-btn" onClick={onApply} disabled={working}>
            {busy === "frame" ? (
              <>
                <Spinner />
                Saving…
              </>
            ) : (
              "Update my poster"
            )}
          </button>
        ) : null}
        <span className="pp-file">
          <span className={has ? "dc-btn dc-btn--ghost" : "dc-btn"} aria-hidden="true">
            {busy === "upload" ? (
              <>
                <Spinner />
                Uploading…
              </>
            ) : has ? (
              "Change photo"
            ) : (
              "Choose a photo"
            )}
          </span>
          <input id={fileId} type="file" accept={ACCEPT} onChange={onFile} disabled={working} aria-label={has ? "Change photo" : "Choose a photo"} />
        </span>
        {has ? (
          <button type="button" className="dc-btn dc-btn--ghost" onClick={onRemove} disabled={working}>
            {busy === "remove" ? "Removing…" : "Remove photo"}
          </button>
        ) : null}
      </div>
      {said ? (
        <p className="pp-problem" role="alert">
          {said}
        </p>
      ) : null}
      <p className="pp-privacy">
        Your photo is used only for your poster. Only you can see it, and it&rsquo;s deleted when you remove it or 30 days after the event.
      </p>
    </section>
  );
}

function Maker({ initial, ticketid, linkKey, onUnavailable, onRefused }) {
  const [poster, setPoster] = useState(initial);
  const cred = linkKey || initial.key || "";
  const [format, setFormat] = useState(initial.formats[0].key);
  const [draft, setDraft] = useState(null);
  const [photoView, setPhotoView] = useState(null); // {url} | {url: null, failed: true}
  const [view, setView] = useState({ status: "empty", format: initial.formats[0].key, url: null, blob: null, caption: null, message: null, network: false });
  const [slow, setSlow] = useState(false);
  const [busy, setBusy] = useState(null); // "upload" | "remove" | "frame"
  const [said, setSaid] = useState(null);
  const seq = useRef(0);
  const cache = useRef(new Map()); // "format:fingerprint" → {blob, url}
  const photoUrl = useRef(null);

  // Every object URL made here is let go of when the page is left.
  useEffect(() => {
    const kept = cache.current;
    return () => {
      seq.current += 1;
      for (const hit of kept.values()) revokeUrl(hit.url);
      kept.clear();
      revokeUrl(photoUrl.current);
      photoUrl.current = null;
    };
  }, []);

  const showPhoto = useCallback((next) => {
    if (photoUrl.current && photoUrl.current !== next?.url) revokeUrl(photoUrl.current);
    photoUrl.current = next?.url || null;
    setPhotoView(next);
  }, []);

  /** A refusal that ends the page: the poster closed meanwhile, or this browser may not open it. */
  const ended = useCallback(
    (d) => {
      if (d.kind === "unavailable" || d.kind === "off") {
        onUnavailable(d.kind === "off" ? "off" : d.reason);
        return true;
      }
      if (d.kind === "not_yours" || d.kind === "missing") {
        onRefused(d.kind);
        return true;
      }
      return false;
    },
    [onUnavailable, onRefused],
  );

  /**
   * The poster in format `key`, as `now` says it stands: shown at once when
   * it is drawn and already here; otherwise asked for (POST …/render) and
   * waited for (GET …/render/{format}), then read. A newer call wins: an
   * older one's answer is dropped.
   */
  const draw = useCallback(
    async (key, now, { fresh = false } = {}) => {
      const my = ++seq.current;
      const fmt = formatOf(now, key);
      if (!fmt) return;
      const cached = fmt.render.status === "ready" && !fresh ? cache.current.get(`${key}:${fmt.render.fingerprint}`) : null;
      if (cached) {
        setView({ status: "ready", format: key, url: cached.url, blob: cached.blob, caption: cached.caption || now.moment.caption, message: null, network: false });
        return;
      }
      setView((v) => ({ ...v, status: "loading", format: key, url: v.format === key ? v.url : null, blob: v.format === key ? v.blob : null, message: null, network: false, drawing: my }));
      try {
        let st = fmt.render;
        let asked = false;
        const ask = async () => {
          asked = true;
          return postersApi.render(ticketid, cred, key);
        };
        if (fresh || st.status === "none" || st.status === "failed") st = await ask();
        const until = Date.now() + DRAW_PATIENCE_MS;
        while (st.status !== "ready") {
          if (my !== seq.current) return;
          if (st.status === "failed") throw { kind: "busy" };
          if (st.status === "none") {
            // Its inputs changed since it was asked for (or it was never asked): ask once.
            if (asked) throw { kind: "busy" };
            st = await ask();
            continue;
          }
          if (Date.now() > until) throw { kind: "slow" };
          await sleep(between(st.retryAfterMs || 1500, 800, 4000));
          if (my !== seq.current) return;
          st = await postersApi.renderStatus(ticketid, cred, key);
        }
        const id = `${key}:${st.fingerprint}`;
        let hit = cache.current.get(id);
        if (!hit) {
          const blob = await postersApi.image(ticketid, cred, key, st.fingerprint);
          hit = { blob, url: objectUrl(blob), caption: st.caption };
          cache.current.set(id, hit);
        }
        if (my !== seq.current) return;
        setPoster((p) => withRender(p, key, { status: "ready", fingerprint: st.fingerprint }));
        setView({ status: "ready", format: key, url: hit.url, blob: hit.blob, caption: st.caption || now.moment.caption, message: null, network: false });
      } catch (e) {
        if (my !== seq.current) return;
        let d;
        if (e?.kind === "busy") d = { kind: "busy", message: "Your poster couldn’t be drawn just now. Try again in a moment." };
        else if (e?.kind === "slow") d = { kind: "busy", message: "Your poster is taking longer than usual. Try again in a moment." };
        else d = describePosterError(e);
        if (ended(d)) return;
        setView({ status: "failed", format: key, url: null, blob: null, caption: null, message: d.message, network: d.kind === "network" });
      }
    },
    [ticketid, cred, ended],
  );

  // The first poster, as soon as the page has read where things stand.
  useEffect(() => {
    draw(initial.formats[0].key, initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Drawing your poster…" says so when it takes a while. Each new drawing
  // starts its own clock, even one asked for while another was still drawn.
  useEffect(() => {
    setSlow(false);
    if (view.status !== "loading") return undefined;
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [view.status, view.format, view.drawing]);

  // Back online after a failed try: try again by itself.
  useEffect(() => {
    if (view.status !== "failed" || !view.network) return undefined;
    const again = () => draw(view.format, poster, { fresh: false });
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [view.status, view.network, view.format, poster, draw]);

  // The saved photo, read for the frame when there is one and none is shown.
  const hasPhoto = Boolean(poster.photo);
  const photoStamp = poster.photo ? `${poster.photo.uploadedAt}:${poster.photo.width}x${poster.photo.height}` : null;
  useEffect(() => {
    if (!hasPhoto) {
      showPhoto(null);
      return undefined;
    }
    if (photoUrl.current) return undefined;
    let alive = true;
    postersApi.photo(ticketid, cred).then(
      (blob) => alive && showPhoto({ url: objectUrl(blob) }),
      () => alive && showPhoto({ url: null, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [hasPhoto, photoStamp, ticketid, cred, showPhoto]);

  const fmt = formatOf(poster, format) || poster.formats[0];
  const serverFraming = fmt?.framing || CENTRED;
  const framing = draft || serverFraming;
  /*
   * Changed by the guest: compared as drawn in this format's frame, so a
   * framing the frame itself pulls in (the server crops the same way) is
   * not a change nobody made.
   */
  const photoSize = poster.photo ? { w: poster.photo.width, h: poster.photo.height } : null;
  const frameSize = fmt?.frame ? { w: fmt.frame.width, h: fmt.frame.height } : null;
  const dirty = Boolean(draft) && !sameFraming(clampFraming(draft, photoSize, frameSize), clampFraming(serverFraming, photoSize, frameSize));

  /** Keep the framing being edited (every format), then draw `key`. */
  const apply = async (key = format) => {
    if (!dirty) return draw(key, poster);
    setBusy("frame");
    setSaid(null);
    try {
      const now = await postersApi.frame(ticketid, cred, draft);
      setPoster(now);
      setDraft(null);
      draw(key, now);
    } catch (e) {
      const d = describePosterError(e);
      if (!ended(d)) setSaid(d.message);
    } finally {
      setBusy(null);
    }
  };

  const pick = (key) => {
    if (key === format) return;
    setFormat(key);
    apply(key);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSaid(null);
    setBusy("upload");
    let ready;
    try {
      ready = await preparePhoto(file, { maxBytes: maxPhotoBytes() });
    } catch (err) {
      setSaid(err?.message || "We couldn’t read that photo. Try another one.");
      setBusy(null);
      return;
    }
    try {
      const now = await postersApi.upload(ticketid, cred, ready.blob, ready.filename);
      setPoster(now);
      setDraft(null);
      // What was just chosen shows in the frame at once; a picture this browser can't read (HEIC) comes back from the server.
      showPhoto(ready.previewUrl ? { url: ready.previewUrl } : null);
      draw(format, now);
    } catch (err) {
      revokeUrl(ready.previewUrl);
      const d = describePosterError(err, { upload: true });
      if (!ended(d)) setSaid(d.message);
    } finally {
      setBusy(null);
    }
  };

  const onRemove = async () => {
    setSaid(null);
    setBusy("remove");
    try {
      const now = await postersApi.removePhoto(ticketid, cred);
      setPoster(now);
      setDraft(null);
      showPhoto(null);
      draw(format, now);
    } catch (err) {
      const d = describePosterError(err);
      if (!ended(d)) setSaid(d.message);
    } finally {
      setBusy(null);
    }
  };

  /*
   * On a phone the poster sits above the controls: after "Update my poster"
   * or a new size, it is brought back into view (when it is out of it), so
   * the guest sees the new one being drawn.
   */
  const previewRef = useRef(null);
  const showPreview = () => {
    const el = previewRef.current;
    if (!el || typeof el.getBoundingClientRect !== "function" || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    if (r.top >= 0 && r.top < window.innerHeight * 0.5) return;
    const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      el.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
    } catch {
      /* an old browser: the poster stays where it is */
    }
  };

  const note = (action) => postersApi.note(ticketid, cred, action, format);
  const caption = view.caption || poster.moment.caption || "";
  const phrase = poster.moment.phrase || "I’m attending";
  const ready = view.status === "ready" && view.format === format && !dirty;
  const offered = poster.formats.map((f) => f.key);

  return (
    <>
      <header className="pp-head">
        <h1 className="rg-h1">Your poster</h1>
        <p className="pp-lede">
          {phrase} <strong>{poster.event?.name}</strong>! Your poster carries your name{poster.guest?.roleLabel && poster.guest.role !== "attendee" ? ` as ${poster.guest.roleLabel.toLowerCase()}` : ""} and your own link to the event. Add your photo, pick a size, then share it.
        </p>
      </header>
      <div className="pp-layout">
        <div className="pp-preview-col" ref={previewRef}>
          <PosterPreview
            format={format}
            state={view.format === format ? view.status : "loading"}
            stale={view.status === "loading" && Boolean(view.url)}
            url={view.format === format ? view.url : null}
            alt={`Your “${phrase}” poster for ${poster.event?.name || "the event"}, ${FORMATS[format]?.label.toLowerCase() || ""}`}
            failure={view.message}
            onRetry={() => draw(format, poster, { fresh: true })}
            waitWords={slow ? "Still drawing… a slow connection takes a little longer." : "Drawing your poster…"}
          />
          {dirty ? <p className="pp-note">Press &ldquo;Update my poster&rdquo; to see your photo&rsquo;s new position here.</p> : null}
          <ShareActions
            blob={ready ? view.blob : null}
            filename={posterFilename(poster, format)}
            caption={caption}
            title={poster.event?.name || ""}
            onDone={note}
          />
        </div>
        <div className="pp-controls">
          <PhotoCard
            poster={poster}
            fmt={fmt}
            photoView={photoView}
            framing={framing}
            onFraming={setDraft}
            dirty={dirty}
            busy={busy}
            said={said}
            onFile={onFile}
            onRemove={onRemove}
            onApply={() => {
              apply(format);
              showPreview();
            }}
          />
          {offered.length > 1 ? (
            <section className="pp-card" aria-labelledby="pp-format-title">
              <h2 id="pp-format-title" className="pp-card-title">
                Size
              </h2>
              <FormatPicker
                offered={offered}
                value={format}
                onChange={(k) => {
                  pick(k);
                  showPreview();
                }}
                disabled={busy !== null}
              />
            </section>
          ) : null}
        </div>
        <div className="pp-extras">
          <CaptionBox caption={caption} />
          {poster.shareUrl ? <LinkLine url={poster.shareUrl} onCopied={() => note("copy_link")} /> : null}
          <p className="pp-privacy">On iPhone, use Share, then &ldquo;Save Image&rdquo;, to put your poster in Photos.</p>
        </div>
      </div>
    </>
  );
}

/** The guest's own link to the event: what the poster's QR and caption carry. */
function LinkLine({ url, onCopied }) {
  const [line, setLine] = useState("");
  const copy = async () => {
    const ok = await copyText(url);
    setLine(ok ? "Link copied." : "Copy the link by hand.");
    if (ok) onCopied?.();
  };
  return (
    <div className="pp-caption pp-link">
      <p className="pp-caption-label">Your link</p>
      <p className="pp-caption-text">{url}</p>
      <p className="pp-note">People who register through it are counted as yours by the organisers.</p>
      <button type="button" className="dc-btn dc-btn--ghost dc-btn--sm" onClick={copy}>
        Copy link
      </button>
      <span className="dc-sr" role="status" aria-live="polite">
        {line}
      </span>
    </div>
  );
}

/* ---------- the page ---------- */

export default function PosterPage({ ticketid, s = "" }) {
  const [load, setLoad] = useState({ status: "loading", poster: null, problem: null, reason: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoad((x) => (x.status === "error" ? { ...x, status: "loading" } : x));
    Promise.resolve()
      .then(() => postersApi.read(ticketid, s))
      .then(
        (poster) => {
          if (!alive) return;
          if (poster.available) setLoad({ status: "ready", poster, problem: null, reason: null });
          else setLoad({ status: "unavailable", poster, problem: null, reason: poster.reason });
        },
        (error) => {
          if (!alive) return;
          const d = describePosterError(error);
          if (d.kind === "not_yours" || d.kind === "missing") setLoad({ status: d.kind, poster: null, problem: d, reason: null });
          else if (d.kind === "off" || d.kind === "unavailable") setLoad({ status: "unavailable", poster: null, problem: null, reason: d.kind === "off" ? "off" : d.reason });
          else setLoad({ status: "error", poster: null, problem: d, reason: null });
        },
      );
    return () => {
      alive = false;
    };
  }, [ticketid, s, attempt]);

  const back = s ? (load.poster?.event?.path ? { href: load.poster.event.path, label: "The event" } : null) : { href: `/tickets/${encodeURIComponent(ticketid)}`, label: "Your ticket" };

  let body;
  if (load.status === "ready")
    body = (
      <Maker
        initial={load.poster}
        ticketid={ticketid}
        linkKey={s}
        onUnavailable={(reason) => setLoad((x) => ({ ...x, status: "unavailable", reason }))}
        onRefused={(kind) => setLoad((x) => ({ ...x, status: kind }))}
      />
    );
  else if (load.status === "unavailable") body = <Unavailable reason={load.reason} event={load.poster?.event} ticketid={ticketid} />;
  else if (load.status === "not_yours" || load.status === "missing") body = <NotYours kind={load.status} />;
  else if (load.status === "error")
    body = (
      <ErrorState
        title="Your poster didn’t load"
        message={load.problem?.kind === "limit" ? load.problem.message : "We couldn’t reach MyOtherApp. Check your connection and try again."}
        onRetry={() => setAttempt((a) => a + 1)}
      />
    );
  else body = <Skeleton />;

  return (
    <SitePage>
      <div className="dc-wrap rg pp">
        {back && load.status === "ready" ? (
          <Link className="rg-back" href={back.href}>
            <Icon name="arrowLeft" size={16} />
            {back.label}
          </Link>
        ) : null}
        {body}
      </div>
    </SitePage>
  );
}
