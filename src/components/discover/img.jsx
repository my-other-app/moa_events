"use client";

import { useState } from "react";

/**
 * An image that steps aside for its fallback when it is missing or fails to
 * load. The box around it reserves the space, so nothing jumps. `extra`
 * shows only with the image (a date pinned to a poster, say), never with
 * the fallback. Anything else (width, height, fetchPriority) goes on the <img>.
 */
export function Img({ src, alt, fallback = null, className, extra = null, loading = "lazy", ...rest }) {
  const [failed, setFailed] = useState(null);
  if (!src || failed === src) return fallback;
  const img = <img className={className} src={src} alt={alt} loading={loading} decoding="async" {...rest} onError={() => setFailed(src)} />;
  return extra ? (
    <>
      {img}
      {extra}
    </>
  ) : (
    img
  );
}
