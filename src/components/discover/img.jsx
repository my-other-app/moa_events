"use client";

import { useState } from "react";

/*
 * A lazy image still on its way, once the page is in the browser, waits
 * (data-fade="wait") and fades in when it arrives (data-fade="in"):
 * styles/motion.css. Never an eager image: those are the page's largest
 * paint (a poster, the hero), and they show the moment they arrive. Before
 * the browser runs this, and without script, every image simply shows.
 */
const markWaiting = (img) => {
  if (img && !img.complete) img.dataset.fade = "wait";
};
const fadeIn = (e) => {
  if (e.currentTarget.dataset.fade) e.currentTarget.dataset.fade = "in";
};

/**
 * An image that steps aside for its fallback when it is missing or fails to
 * load. The box around it reserves the space, so nothing jumps. `extra`
 * shows only with the image (a date pinned to a poster, say), never with
 * the fallback. Anything else (width, height, fetchPriority) goes on the <img>.
 * A lazy one fades in as it arrives; an eager one never waits.
 */
export function Img({ src, alt, fallback = null, className, extra = null, loading = "lazy", ...rest }) {
  const [failed, setFailed] = useState(null);
  if (!src || failed === src) return fallback;
  const lazy = loading === "lazy";
  const img = (
    <img
      ref={lazy ? markWaiting : undefined}
      className={className}
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      {...rest}
      onLoad={lazy ? fadeIn : undefined}
      onError={() => setFailed(src)}
    />
  );
  return extra ? (
    <>
      {img}
      {extra}
    </>
  ) : (
    img
  );
}
