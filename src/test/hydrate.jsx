import { vi } from "vitest";
import { act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";

/**
 * Renders `element` as the server would (to HTML), puts that HTML in the
 * page, then hydrates it as the browser does, collecting every hydration
 * complaint React makes (console errors and recoverable errors). A page
 * whose first paint depends on the browser (the session, storage, the
 * window) shows up here as a mismatch.
 */
export async function hydrate(element) {
  // The server has no storage: whatever reads it while rendering gets nothing there.
  const saved = { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage };
  let html;
  try {
    globalThis.localStorage = undefined;
    globalThis.sessionStorage = undefined;
    html = renderToString(element);
  } finally {
    globalThis.localStorage = saved.localStorage;
    globalThis.sessionStorage = saved.sessionStorage;
  }
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  const problems = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args) => problems.push(args.map(String).join(" ")));
  let root;
  await act(async () => {
    root = hydrateRoot(host, element, { onRecoverableError: (error) => problems.push(String(error?.message || error)) });
  });
  spy.mockRestore();
  return {
    html,
    host,
    problems,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}
