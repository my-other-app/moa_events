/**
 * The HTML a server page's element renders to, as a crawler gets it: the
 * route's element (its islands included, as Next renders them on the
 * server) inside a router at `path`.
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

export const html = (element, path = "/") => renderToString(createElement(MemoryRouter, { initialEntries: [path] }, element));

/** The JSON-LD objects in some HTML, in order. */
export const jsonLdOf = (text) => [...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => [].concat(JSON.parse(m[1])));
