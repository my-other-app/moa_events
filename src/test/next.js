/**
 * What a server page or function did, read off the error Next throws for a
 * redirect or a 404: {redirect: {url, status}}, {notFound: true}, or
 * {value} when it returned normally.
 */
export async function outcome(fn) {
  try {
    return { value: await fn() };
  } catch (e) {
    const digest = typeof e?.digest === "string" ? e.digest : "";
    if (digest.startsWith("NEXT_REDIRECT;")) {
      const parts = digest.split(";");
      return { redirect: { url: parts.slice(2, -2).join(";"), status: Number(parts.at(-2)) } };
    }
    if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return { notFound: true };
    throw e;
  }
}

/** A stand-in for fetch: answers from a table of path → {status, body}, and records what was asked. */
export function fakeFetch(table) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const u = new URL(String(url));
    const key = `${u.pathname}${u.search}`;
    const hit = typeof table === "function" ? table(u, init) : table[key] ?? table[u.pathname];
    if (hit instanceof Error) throw hit;
    const { status = 200, body = null } = hit || { status: 404, body: { detail: "Not found" } };
    return new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  fn.calls = calls;
  return fn;
}
