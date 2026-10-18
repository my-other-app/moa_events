/**
 * What next/navigation is in tests (see vitest.config.js).
 *
 * The server half is Next's own (notFound, redirect, permanentRedirect...):
 * the route tests read what they throw. The client hooks run on
 * react-router's <MemoryRouter>, as src/test/router.jsx does for
 * @/lib/router, so a component written against Next's router renders in the
 * same <MemoryRouter> as everything else, and a test reads where it went with
 * react-router's useLocation().
 *
 * Next also follows window.history.pushState / replaceState / back (a page
 * that changes its own query without asking the server, as the registration
 * form's steps do): here those are handed to the MemoryRouter the same way.
 */
import { useLayoutEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams as useRouterParams } from "react-router-dom";
import { ReadonlyURLSearchParams } from "next/dist/client/components/navigation.js";

export {
  ReadonlyURLSearchParams,
  RedirectType,
  forbidden,
  notFound,
  permanentRedirect,
  redirect,
  unauthorized,
  unstable_rethrow,
} from "next/dist/client/components/navigation.js";

/** The MemoryRouter's navigate, from the last component that read the router: where history calls go. */
let navigateTo = null;

function useNav() {
  const navigate = useNavigate();
  // Before the components' own effects, which may already move the address.
  useLayoutEffect(() => {
    navigateTo = navigate;
  });
  return navigate;
}

if (typeof window !== "undefined" && !window.history.__nextTestDouble) {
  const history = window.history;
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  history.pushState = (state, title, url) => {
    push(state, title, url);
    if (url !== undefined && url !== null && navigateTo) navigateTo(String(url), { state });
  };
  history.replaceState = (state, title, url) => {
    replace(state, title, url);
    if (url !== undefined && url !== null && navigateTo) navigateTo(String(url), { replace: true, state });
  };
  history.back = () => navigateTo?.(-1);
  history.forward = () => navigateTo?.(1);
  history.go = (n = 0) => navigateTo?.(n);
  history.__nextTestDouble = true;
}

export function useRouter() {
  const navigate = useNav();
  return useMemo(
    () => ({
      push: (href) => navigate(href),
      replace: (href) => navigate(href, { replace: true }),
      back: () => navigate(-1),
      forward: () => navigate(1),
      refresh: () => {},
      prefetch: () => Promise.resolve(),
    }),
    [navigate],
  );
}

export function usePathname() {
  useNav();
  return useLocation().pathname;
}

export function useSearchParams() {
  useNav();
  const { search } = useLocation();
  return useMemo(() => new ReadonlyURLSearchParams(search), [search]);
}

export function useParams() {
  return useRouterParams();
}

export const useSelectedLayoutSegment = () => null;
export const useSelectedLayoutSegments = () => [];
