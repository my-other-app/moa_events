/**
 * next.config's headers() as Next applies them to one path: every block
 * whose source matches, in order, and for a header two blocks both set, the
 * later one's value (Next's rule: the last one wins).
 *
 * Sources use the forms next.config has: `/:name` (one segment) and
 * `/:name*` (any number, none included).
 */
export const sourcePattern = (source) =>
  new RegExp(
    `^${source
      .replace(/\/:(\w+)\*/g, "(?:/.*)?")
      .replace(/:(\w+)/g, "([^/]+)")}$`,
  );

/** The blocks that apply to `path`, in the order next.config lists them. */
export const rulesFor = async (config, path) => (await config.headers()).filter((rule) => sourcePattern(rule.source).test(path));

/** The headers `path` is answered with: {key: value}, later blocks winning. */
export async function effectiveHeaders(config, path) {
  const out = {};
  for (const rule of await rulesFor(config, path)) for (const h of rule.headers) out[h.key] = h.value;
  return out;
}
