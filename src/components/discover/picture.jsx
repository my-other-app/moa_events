"use client";

import { useState } from "react";
import { isPosterShape, logoFit } from "@/utils/pictures";

/*
 * The two club pictures with a shape of their own (utils/pictures.js): an
 * event's poster, shown whole in its 4:5 frame, and a logo, shown whole on
 * white when it is not square. Each steps aside for its fallback when it is
 * missing or fails, like Img (img.jsx), and a lazy one fades in as it
 * arrives (styles/motion.css). What a picture turns out to be (4:5 or not,
 * square or not) is written on the element once it has loaded, never into
 * React's state: a card does not render again for it, and the server's HTML
 * stays the browser's.
 */

/** A lazy picture still on its way waits (data-fade="wait") on `el`, and fades in when it arrives. */
const wait = (img, el) => {
  if (img && el && !img.complete) el.dataset.fade = "wait";
};
const arrive = (el) => {
  if (el?.dataset.fade) el.dataset.fade = "in";
};

/** Marks a poster's frame `data-shape="exact"` when the poster is 4:5: its blurred copy is then hidden. */
const shapeOf = (img) => {
  if (img?.naturalWidth && isPosterShape(img.naturalWidth, img.naturalHeight)) img.parentElement.dataset.shape = "exact";
};

/**
 * An event's poster, never cropped: whole (object-fit: contain) over a soft
 * blurred copy of itself that fills the frame, so a poster of any shape sits
 * in the 4:5 frame without bars. A 4:5 poster covers its copy entirely.
 * Fills the positioned frame it is put in (.dc-poster, absolute). `extra`
 * shows only with the poster (a date pinned to it), never with the fallback.
 * `small` for a frame under about 100px wide: a lighter blur.
 * Anything else (fetchPriority, width, height) goes on the poster's <img>.
 */
export function PosterImg({ src, alt, fallback = null, extra = null, loading = "lazy", small = false, ...rest }) {
  const [failed, setFailed] = useState(null);
  if (!src || failed === src) return fallback;
  const lazy = loading === "lazy";
  return (
    <>
      <span className={small ? "dc-poster dc-poster--small" : "dc-poster"}>
        {/* The poster first, so the browser asks for it at the poster's own priority. */}
        <img
          ref={(img) => {
            if (lazy) wait(img, img?.parentElement);
            if (img?.complete) shapeOf(img);
          }}
          className="dc-poster-img"
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          {...rest}
          onLoad={(e) => {
            shapeOf(e.currentTarget);
            if (lazy) arrive(e.currentTarget.parentElement);
          }}
          onError={() => setFailed(src)}
        />
        <img className="dc-poster-bg" src={src} alt="" aria-hidden="true" loading={loading} decoding="async" />
      </span>
      {extra}
    </>
  );
}

/** Marks a logo `data-fit="fill"` (square: it fills its frame) or `"whole"` (anything else: shown entire, with room). */
const fitOf = (img) => {
  const fit = img?.naturalWidth ? logoFit(img.naturalWidth, img.naturalHeight) : null;
  if (fit) img.dataset.fit = fit;
};

/**
 * A club's or a partner's logo in its square (or round) frame, on white.
 * Square, it fills the frame; any other shape -- a wordmark, a banner-like
 * logo -- is shown whole with room around it, never cut. Until it has
 * loaded it is shown whole without the room, so a square one looks the same
 * either way and a wide one is never cut, even before the page's script runs.
 */
export function LogoImg({ src, alt = "", fallback = null, loading = "lazy", ...rest }) {
  const [failed, setFailed] = useState(null);
  if (!src || failed === src) return fallback;
  const lazy = loading === "lazy";
  return (
    <img
      ref={(img) => {
        if (lazy) wait(img, img);
        if (img?.complete) fitOf(img);
      }}
      className="dc-logo-img"
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      {...rest}
      onLoad={(e) => {
        fitOf(e.currentTarget);
        if (lazy) arrive(e.currentTarget);
      }}
      onError={() => setFailed(src)}
    />
  );
}
