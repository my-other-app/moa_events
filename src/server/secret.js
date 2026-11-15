import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether an Authorization header is `Bearer <secret>`, compared in constant
 * time: both sides are hashed first, so neither the secret's length nor how
 * much of it a guess got right shows in how long the answer takes.
 */
export function namesSecret(header, secret) {
  if (typeof header !== "string" || !secret) return false;
  const digest = (v) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
