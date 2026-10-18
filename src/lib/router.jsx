"use client";

/**
 * The few react-router APIs the site's components were written against, on
 * top of Next's router. Components import their links and hooks from here,
 * never from next/navigation or react-router, so they read the same as they
 * always have and run under Next unchanged:
 *
 *   <Link to>            next/link; `to` may be "/x?y" or {pathname, search, hash}
 *   <NavLink to end>     a Link that knows it is current ("active", aria-current)
 *   <Navigate to>        moves on once mounted (client pages only)
 *   useParams()          the route's [segments]
 *   useSearchParams()    [params, setParams(next, {replace, state})]
 *   useLocation()        {pathname, search, hash, state}
 *   useNavigate()        navigate(to | -1, {replace, state})
 *   usePathname()
 *
 * Server components may render <Link> (it is a client component like
 * next/link itself). The hooks are for client components; a client
 * component on a server-rendered page that calls useSearchParams or
 * useLocation must sit inside <Suspense> (Next needs the boundary to
 * prerender the rest of the page).
 *
 * History `state` (react-router's navigate(..., {state})) rides on the
 * browser's own history entry: Next keeps what it needs beside it. Only the
 * registration form uses it, always on its own address.
 *
 * In tests this module is swapped for src/test/router.jsx (vitest.config.js),
 * which runs the same API on react-router's MemoryRouter.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import NextLink from "next/link";
import { useParams as useNextParams, usePathname, useRouter, useSearchParams as useNextSearchParams } from "next/navigation";
import { hrefOf, isActivePath, searchOf } from "./href";

export { usePathname };

const HISTORY_EVENT = "moa:history";

function subscribeHistory(notify) {
  window.addEventListener("popstate", notify);
  window.addEventListener("hashchange", notify);
  window.addEventListener(HISTORY_EVENT, notify);
  return () => {
    window.removeEventListener("popstate", notify);
    window.removeEventListener("hashchange", notify);
    window.removeEventListener(HISTORY_EVENT, notify);
  };
}

const historyState = () => window.history.state ?? null;
const currentHash = () => window.location.hash || "";

/** Writes an entry (or replaces this one) without asking the server: Next follows it, and so does useLocation. */
function writeHistory(href, { replace = false, state = null } = {}) {
  const data = state && typeof state === "object" ? { ...state } : {};
  if (replace) window.history.replaceState(data, "", href);
  else window.history.pushState(data, "", href);
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

export function Link({ to, href, replace, state, reloadDocument, prefetch, ...rest }) {
  void state;
  const target = hrefOf(to ?? href);
  if (reloadDocument) return <a href={target} {...rest} />;
  return <NextLink href={target} replace={replace} prefetch={prefetch} {...rest} />;
}

export function NavLink({ to, end = false, className, children, ...rest }) {
  const pathname = usePathname();
  const isActive = isActivePath(pathname, to, end);
  const cls = typeof className === "function" ? className({ isActive, isPending: false }) : [className, isActive ? "active" : null].filter(Boolean).join(" ");
  return (
    <Link to={to} className={cls || undefined} aria-current={isActive ? "page" : undefined} {...rest}>
      {typeof children === "function" ? children({ isActive, isPending: false }) : children}
    </Link>
  );
}

export function useParams() {
  return useNextParams() || {};
}

export function useNavigate() {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (to, { replace = false, state } = {}) => {
      if (typeof to === "number") {
        window.history.go(to);
        return;
      }
      const href = hrefOf(to, pathname);
      if (state !== undefined && state !== null) {
        writeHistory(href, { replace, state });
        return;
      }
      const samePage = href.split(/[?#]/)[0] === pathname || href.startsWith("?") || href.startsWith("#");
      const options = { scroll: !samePage };
      if (replace) router.replace(href, options);
      else router.push(href, options);
    },
    [router, pathname]
  );
}

export function useSearchParams() {
  const params = useNextSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const setParams = useCallback(
    (next, { replace = false, state } = {}) => {
      const current = new URLSearchParams(window.location.search);
      const value = typeof next === "function" ? next(current) : next;
      const href = `${pathname}${searchOf(value)}`;
      if (state !== undefined && state !== null) writeHistory(href, { replace, state });
      else if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [pathname, router]
  );
  return [params, setParams];
}

export function useLocation() {
  const pathname = usePathname();
  const params = useNextSearchParams();
  const state = useSyncExternalStore(subscribeHistory, historyState, () => null);
  const hash = useSyncExternalStore(subscribeHistory, currentHash, () => "");
  const search = params ? searchOf(params) : "";
  return useMemo(() => ({ pathname, search, hash, state, key: "default" }), [pathname, search, hash, state]);
}

/** Moves to `to` once mounted, like react-router's <Navigate>. */
export function Navigate({ to, replace = false, state }) {
  const navigate = useNavigate();
  const href = hrefOf(to);
  useEffect(() => {
    navigate(href, { replace, state });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [href]);
  return null;
}
