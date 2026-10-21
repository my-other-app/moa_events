"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/auth/context";
import { initials } from "@/utils/cover";
import { usePresence } from "@/utils/presence";
import Icon from "../discover/icons";

/** The signed-in person's face: their photo, or their initials on the site's yellow. */
export function UserAvatar({ user, size = 32 }) {
  const [failed, setFailed] = useState(null);
  const src = user?.picture || null;
  return (
    <span className="ac-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden="true">
      {src && failed !== src ? (
        <img src={src} alt="" referrerPolicy="no-referrer" decoding="async" onError={() => setFailed(src)} />
      ) : (
        <span>{initials(user?.name || user?.email || "?")}</span>
      )}
    </span>
  );
}

/** The menu behind the avatar: who is signed in, their tickets, the clubs they follow, and signing out. */
function AccountMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrap = useRef(null);
  const button = useRef(null);
  const panel = useRef(null);
  // The panel drops in, and folds away (styles/motion.css) before it goes.
  const { mounted, leaving } = usePresence(open, panel);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="ac-menu" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="ac-menu-btn"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Your account, ${user.name}`}
        onClick={() => setOpen((o) => !o)}
      >
        <UserAvatar user={user} size={32} />
        <span className="ac-menu-first" aria-hidden="true">
          {user.firstName}
        </span>
        <Icon name="chevronDown" size={16} className="ac-menu-chev" />
      </button>
      {mounted ? (
        <div ref={panel} id={panelId} className="ac-menu-panel" data-leaving={leaving ? "" : undefined} inert={leaving || undefined}>
          <div className="ac-menu-who">
            <UserAvatar user={user} size={40} />
            <div>
              <p className="ac-menu-name">{user.name}</p>
              {user.email ? <p className="ac-menu-email">{user.email}</p> : null}
            </div>
          </div>
          <ul className="ac-menu-list">
            <li>
              <Link href="/me/tickets" onClick={close}>
                <Icon name="ticket" size={18} />
                My tickets
              </Link>
            </li>
            <li>
              <Link href="/me/following" onClick={close}>
                <Icon name="users" size={18} />
                Following
              </Link>
            </li>
          </ul>
          <button
            type="button"
            className="ac-menu-out"
            onClick={() => {
              close();
              onSignOut();
            }}
          >
            <Icon name="logout" size={18} />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The header's corner for the account: "Sign in" signed out, the avatar and its menu signed in, nothing without sign-in. */
export function HeaderAccount() {
  const auth = useAuth();
  if (!auth.enabled) return null;
  if (auth.status === "signed-in" && auth.user) return <AccountMenu user={auth.user} onSignOut={auth.signOut} />;
  return (
    <button type="button" className="ac-signin" onClick={() => auth.openSignIn()}>
      Sign in
    </button>
  );
}

/** A Google "G", for the quiet sign-in lines on the page (the sheet uses Google's own button). */
export function GoogleMark({ size = 16 }) {
  return (
    <svg className="ac-gmark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
