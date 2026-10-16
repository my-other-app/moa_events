/**
 * Sign in with Google, through Google Identity Services (google.accounts.id).
 *
 * The client id is the public OAuth web client id, set as
 * VITE_GOOGLE_CLIENT_ID at build time; it must be the same one the API checks
 * tokens against (its GOOGLE_WEB_CLIENT_ID). Without it the site has no
 * sign-in at all and works exactly as it did before.
 *
 * Google's script is loaded only when sign-in is offered (the sheet opens, or
 * One Tap is tried), never on page load. Every credential Google hands back
 * goes to the one handler the auth provider sets.
 */

import { jwtClaims } from "./jwt";

export const GSI_SRC = "https://accounts.google.com/gsi/client";

export function googleClientId() {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export const googleEnabled = () => Boolean(googleClientId());

let loading = null;
let initializedFor = null;
let handler = null;

/** Where Google's credentials go: `fn({ credential, select_by })`. */
export function setCredentialHandler(fn) {
  handler = fn;
}

const gis = () => (typeof window !== "undefined" ? window.google?.accounts?.id : undefined);

/** Loads Google's script once; resolves google.accounts.id, rejects when it can't load (offline, blocked). */
export function loadGoogle() {
  if (gis()) return Promise.resolve(gis());
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const fail = () => {
      loading = null;
      reject(Object.assign(new Error("Google sign-in didn't load"), { kind: "load" }));
    };
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => (gis() ? resolve(gis()) : fail());
    script.onerror = () => {
      script.remove();
      fail();
    };
    document.head.appendChild(script);
  });
  return loading;
}

async function ready() {
  const id = await loadGoogle();
  const clientId = googleClientId();
  if (initializedFor !== clientId) {
    id.initialize({
      client_id: clientId,
      callback: (response) => handler?.(response),
      ux_mode: "popup",
      auto_select: false,
      cancel_on_tap_outside: true,
      context: "signin",
      itp_support: true,
      use_fedcm_for_prompt: true,
    });
    initializedFor = clientId;
  }
  return id;
}

/** Draws Google's own "Sign in with Google" button into `el`. */
export async function renderGoogleButton(el, { width = 320, text = "signin_with" } = {}) {
  const id = await ready();
  if (!el) return;
  el.replaceChildren();
  id.renderButton(el, {
    type: "standard",
    theme: "outline",
    size: "large",
    text,
    shape: "rectangular",
    logo_alignment: "left",
    width: Math.max(200, Math.min(400, Math.round(width))),
  });
}

/** One Tap. `onSkipped` runs when the person closes it or it can't show. */
export async function promptOneTap({ onSkipped } = {}) {
  const id = await ready();
  id.prompt((moment) => {
    try {
      if (moment?.isSkippedMoment?.() || moment?.isNotDisplayed?.()) onSkipped?.();
    } catch {
      /* the moment API changes under FedCM; nothing depends on it */
    }
  });
}

export function cancelOneTap() {
  try {
    gis()?.cancel?.();
  } catch {
    /* not loaded */
  }
}

/** After signing out, so One Tap doesn't sign the same person straight back in. */
export function forgetGoogleChoice() {
  try {
    gis()?.disableAutoSelect?.();
  } catch {
    /* not loaded */
  }
}

/** What Google says about the person, from the credential itself: for showing, never for trusting. */
export function credentialClaims(credential) {
  const o = jwtClaims(credential);
  if (!o) return null;
  const s = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { name: s(o.name), given_name: s(o.given_name), email: s(o.email), picture: s(o.picture) };
}

/** For tests: forget the loaded script and the handler. */
export function resetGoogleForTests() {
  loading = null;
  initializedFor = null;
  handler = null;
}
