"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/discover/icons";

/**
 * "Copy" on a code block. It reads the code from the block it sits in (its
 * <pre>), so the code is sent once, as HTML, not again as this island's
 * props. Says "Copied" for two seconds, to screen readers too; where the
 * browser won't copy (no clipboard, an old browser), it selects the code
 * so Ctrl+C / Cmd+C does it.
 */
export function CopyButton({ label = "Copy" }) {
  const ref = useRef(null);
  const [state, setState] = useState("idle");
  useEffect(() => {
    if (state === "idle") return undefined;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);

  const copy = async () => {
    const pre = ref.current?.closest(".dv-code")?.querySelector("pre");
    if (!pre) return;
    const text = pre.textContent || "";
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      const range = document.createRange();
      range.selectNodeContents(pre);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      setState("selected");
    }
  };

  return (
    <>
      <button ref={ref} type="button" className="dv-copy" onClick={copy} aria-label={state === "copied" ? "Copied" : `${label} code`}>
        <Icon name={state === "copied" ? "check" : "copy"} size={14} />
        <span aria-hidden="true">{state === "copied" ? "Copied" : state === "selected" ? "Selected" : label}</span>
      </button>
      <span className="dc-sr" role="status" aria-live="polite">
        {state === "copied" ? "Copied to the clipboard" : state === "selected" ? "Code selected: press Ctrl+C or Cmd+C to copy it" : ""}
      </span>
    </>
  );
}
