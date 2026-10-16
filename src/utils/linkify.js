/**
 * Plain text a club typed, split into text and links, so the page can
 * render links as <a> elements without ever treating the text as HTML.
 * Only http(s) addresses and email addresses become links.
 */
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"]+|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const TRAILING = ".,;:!?'\"’”)]}>";

/** Punctuation that ends a sentence isn't part of the link; a ")" is, when the link opened a "(". */
function trimEnd(raw) {
  let link = raw;
  let rest = "";
  while (link) {
    const last = link[link.length - 1];
    if (!TRAILING.includes(last)) break;
    if (last === ")" && (link.match(/\(/g) || []).length >= (link.match(/\)/g) || []).length) break;
    rest = last + rest;
    link = link.slice(0, -1);
  }
  return [link, rest];
}

/** An address that is safe to follow, or null. */
export function safeHref(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^[^\s@/:]+@[^\s@/]+\.[a-z]{2,}$/i.test(s)) return `mailto:${s}`;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** [{type: "text", value}, {type: "link", value, href}, …] */
export function linkify(text) {
  const s = String(text ?? "");
  const out = [];
  let last = 0;
  const push = (value) => {
    if (!value) return;
    const prev = out[out.length - 1];
    if (prev && prev.type === "text") prev.value += value;
    else out.push({ type: "text", value });
  };
  for (const m of s.matchAll(LINK)) {
    const [link, rest] = trimEnd(m[0]);
    const href = safeHref(link);
    push(s.slice(last, m.index));
    if (href && link) out.push({ type: "link", value: link, href });
    else push(link);
    push(rest);
    last = m.index + m[0].length;
  }
  push(s.slice(last));
  return out;
}
