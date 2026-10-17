/**
 * The claims inside a JWT, without checking its signature: only ever for
 * showing a name or reading an expiry, never for deciding who someone is.
 * Null when it isn't a readable token.
 */
export function jwtClaims(token) {
  try {
    const part = String(token).split(".")[1];
    if (!part) return null;
    const b64 = part
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(part.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const o = JSON.parse(new TextDecoder().decode(bytes));
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}
