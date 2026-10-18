import { JSDOM } from "jsdom";

const { DOMParser } = new JSDOM("").window;

/** Parses XML as a strict XML parser would; throws on anything that isn't well-formed. */
export function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const error = doc.getElementsByTagName("parsererror")[0];
  if (error) throw new Error(`Not well-formed XML: ${error.textContent}`);
  return doc;
}

/** The text of every element with this (qualified) tag name. */
export const texts = (doc, tag) => [...doc.getElementsByTagName(tag)].map((el) => el.textContent);
