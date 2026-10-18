/**
 * Renders an element to HTML as the server would, then hydrates that HTML
 * in the test's document, and returns what React complained about on the
 * way (a hydration mismatch is one). The test's window exists for both
 * halves, so set up what only a browser would have (a place kept in
 * localStorage, a signed-in session) in `inBrowser`, run between the two:
 * an island that reads it while it renders shows up as a mismatch.
 */
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { vi } from "vitest";

export async function hydrate(element, { inBrowser = () => {} } = {}) {
  const html = renderToString(element);
  inBrowser();
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  const problems = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args) => problems.push(args.map(String).join(" ")));
  let root;
  await act(async () => {
    root = hydrateRoot(container, element, { onRecoverableError: (e) => problems.push(String(e?.message || e)) });
  });
  spy.mockRestore();
  return {
    html,
    container,
    problems,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}
