/**
 * The tracking link's code, carried from the page someone landed on to the
 * form they sign up with.
 *
 * A link opened from a poster or a story lands on the event page with
 * `?ref=<code>`; the sign-up happens on another route a moment later. The
 * code is kept for the tab's lifetime and sent with the registration, so
 * the club can see which link brought the person — nothing else is kept.
 */
const KEY = "moa.ref";
const CODE = /^[a-z0-9]{4,16}$/i;

export function rememberRef(search = typeof window === "undefined" ? "" : window.location.search) {
  try {
    const params = new URLSearchParams(search);
    const ref = params.get("ref");
    // `sref` is the club website's own code, on its event buttons. It is the
    // weaker claim: someone who reached the site through one of the club's
    // links keeps that link's credit, and the site gets the rest.
    const sref = params.get("sref");
    if (ref && CODE.test(ref)) sessionStorage.setItem(KEY, ref.toLowerCase());
    else if (sref && CODE.test(sref) && !sessionStorage.getItem(KEY)) sessionStorage.setItem(KEY, sref.toLowerCase());
  } catch {
    // Storage can be unavailable in a private tab; the sign-up still works, just uncredited.
  }
}

export function currentRef() {
  try {
    const ref = sessionStorage.getItem(KEY);
    return ref && CODE.test(ref) ? ref : null;
  } catch {
    return null;
  }
}
