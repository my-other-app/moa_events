/**
 * Renders an element to HTML as the server would, then hydrates that HTML
 * in the test's document, and returns what React complained about on the
 * way (console errors and recoverable errors; a hydration mismatch is one).
 *
 * The server has no storage, so localStorage and sessionStorage are hidden
 * while the HTML is rendered. Set up what only a browser would have (a place
 * kept in localStorage, a signed-in session) in `inBrowser`, which runs
 * between the two halves: an island that reads it while it renders shows up
 * as a mismatch, and so does a page whose first paint depends on the browser.
 */
import { vi } from "vitest";
import { act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";

export async function hydrate(element, { inBrowser = () => {} } = {}) {
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
  inBrowser();
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  const problems = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args) => problems.push(args.map(String).join(" ")));
  let root;
  await act(async () => {
    root = hydrateRoot(container, element, { onRecoverableError: (error) => problems.push(String(error?.message || error)) });
  });
  spy.mockRestore();
  return {
    html,
    container,
    // The same element, under the name the flow pages' tests use.
    host: container,
    problems,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}
