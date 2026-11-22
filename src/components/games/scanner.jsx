"use client";

import { useEffect, useRef, useState } from "react";
import { tokenFromScan } from "@/utils/games";

/** Whether this browser can read QR codes itself (Chrome and recent Android; Safari does not have it yet). */
export const canScanHere = () => typeof globalThis.BarcodeDetector === "function" && Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);

/**
 * Camera QR scanning in the browser. Where the browser can't (no
 * BarcodeDetector, no camera, permission refused) it says so and tells the
 * player to use the phone's own camera app, whose scan opens this site at
 * /g/{code}; a code can also be pasted. `onCode(token)` gets the token a
 * scan held (a link or a bare token), once.
 */
export default function Scanner({ onCode, onClose, label = "Scan a QR code" }) {
  const video = useRef(null);
  const [problem, setProblem] = useState(canScanHere() ? null : "unsupported");
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!canScanHere()) return undefined;
    let stream = null;
    let timer = null;
    let done = false;
    (async () => {
      try {
        const detector = new globalThis.BarcodeDetector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play?.();
        timer = setInterval(async () => {
          if (done || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            const token = tokenFromScan(found?.[0]?.rawValue);
            if (token && !done) {
              done = true;
              onCode(token);
            }
          } catch {
            /* a frame that can't be read */
          }
        }, 350);
      } catch {
        setProblem("denied");
      }
    })();
    return () => {
      done = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  const submit = (e) => {
    e.preventDefault();
    const token = tokenFromScan(typed);
    if (token) onCode(token);
  };

  return (
    <section className="gm-panel" aria-label={label}>
      <h2 className="gm-title">{label}</h2>
      {problem ? (
        <p className="gm-note" role="status">
          {problem === "denied"
            ? "The camera isn't available here. Allow it in your browser, or "
            : "This browser can't scan inside the page. "}
          open your phone's camera app and point it at the code: it opens this game for you.
        </p>
      ) : (
        <video ref={video} className="gm-video" playsInline muted aria-label="Camera view" />
      )}
      <form onSubmit={submit} className="gm-row">
        <label className="gm-note" htmlFor="gm-paste" style={{ flexBasis: "100%" }}>
          Or paste the code's link
        </label>
        <input id="gm-paste" className="gm-input" style={{ fontSize: 16, letterSpacing: 0, flex: 1 }} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        <button type="submit" className="gm-btn" disabled={!tokenFromScan(typed)}>
          Use
        </button>
      </form>
      <button type="button" className="gm-btn gm-btn--ghost" onClick={onClose}>
        Close camera
      </button>
    </section>
  );
}
