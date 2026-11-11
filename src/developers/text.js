/**
 * The developer docs' text: a line's inline marks, and code split into
 * coloured runs. Pure, so the server renders both and the tests check that
 * nothing is ever lost (every run joined is the code again).
 */

/**
 * One line of the docs' words: `code`, **bold** and [label](href).
 * → [{text} | {code} | {strong} | {link, href}]
 */
export function inlineParts(text) {
  const out = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const m of String(text ?? "").matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ code: m[1] });
    else if (m[2] !== undefined) out.push({ strong: m[2] });
    else out.push({ link: m[3], href: m[4] });
    last = m.index + m[0].length;
  }
  if (last < String(text ?? "").length) out.push({ text: String(text).slice(last) });
  return out;
}

/** The words of a line without its marks (for descriptions and structured data). */
export const plain = (text) => inlineParts(text).map((p) => p.text ?? p.code ?? p.strong ?? p.link).join("");

const KEYWORDS = {
  js: "const|let|var|function|return|if|else|for|of|in|new|import|from|export|async|await|true|false|null|undefined|throw|try|catch",
  python: "def|return|if|elif|else|for|in|not|and|or|import|from|as|None|True|False|try|except|raise|with|is|lambda",
  php: "function|return|if|elseif|else|foreach|as|const|null|true|false|echo|exit|new|throw|try|catch|fn|use|require",
  bash: "export|curl|echo|if|then|fi|for|do|done",
};

const STRING_DQ = String.raw`"(?:\\[\s\S]|[^"\\])*"`;
const STRING_SQ = String.raw`'(?:\\[\s\S]|[^'\\\n])*'`;

/** The pattern for a language: each alternative a named group, tried in order at each place. */
function patternFor(lang) {
  const parts = [];
  if (lang === "js" || lang === "php") parts.push(String.raw`(?<com>\/\/[^\n]*|\/\*[\s\S]*?\*\/)`);
  if (lang === "python" || lang === "php") parts.push(String.raw`(?<com2>#[^\n]*)`);
  if (lang === "bash") parts.push(String.raw`(?<com2>(?:^|(?<=\s))#[^\n]*)`);
  if (lang === "python") parts.push(String.raw`(?<str2>"""[\s\S]*?""")`);
  if (lang === "json") parts.push(`(?<key>${STRING_DQ})(?=\\s*:)`);
  if (lang === "bash") parts.push(String.raw`(?<str3>'[^']*')`);
  if (lang === "js") parts.push("(?<str4>`(?:\\\\[\\s\\S]|[^`\\\\])*`)");
  parts.push(`(?<str>${STRING_DQ}${lang === "bash" || lang === "json" ? "" : `|${STRING_SQ}`})`);
  parts.push(String.raw`(?<num>\b\d+(?:\.\d+)?\b)`);
  if (KEYWORDS[lang]) parts.push(`(?<kw>\\b(?:${KEYWORDS[lang]})\\b)`);
  if (lang === "json") parts.push(String.raw`(?<kw2>\b(?:true|false|null)\b)`);
  return new RegExp(parts.join("|"), "gm");
}

const KIND = { com: "com", com2: "com", str: "str", str2: "str", str3: "str", str4: "str", key: "key", num: "num", kw: "kw", kw2: "kw" };

/** Normalises a language name: "sh", "shell", "curl" → "bash"; "node", "javascript" → "js"; "py" → "python". */
export function langOf(lang) {
  const l = String(lang || "").toLowerCase();
  if (["sh", "shell", "bash", "curl", "console"].includes(l)) return "bash";
  if (["js", "javascript", "node", "mjs"].includes(l)) return "js";
  if (["py", "python"].includes(l)) return "python";
  if (l === "php") return "php";
  if (l === "json") return "json";
  return "text";
}

/** Code split into runs: [{text, kind}] (kind: null, "com", "str", "key", "num", "kw"). Joined, the runs are the code. */
export function highlight(code, lang) {
  const source = String(code ?? "");
  const l = langOf(lang);
  if (l === "text") return [{ text: source, kind: null }];
  const out = [];
  const re = patternFor(l);
  let last = 0;
  for (const m of source.matchAll(re)) {
    if (!m[0]) continue;
    if (m.index > last) out.push({ text: source.slice(last, m.index), kind: null });
    const group = Object.entries(m.groups || {}).find(([, v]) => v !== undefined)?.[0];
    out.push({ text: m[0], kind: KIND[group] || null });
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push({ text: source.slice(last), kind: null });
  return out;
}
