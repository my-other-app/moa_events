/**
 * Handing a picture on: the phone's share sheet with the file itself (Web
 * Share level 2), a download, and copying words.
 *
 * Sharing a file needs `navigator.canShare({files})` to say yes: Safari on
 * iPhone and Mac, Chrome on Android, Edge and Chrome on Windows and
 * ChromeOS. Elsewhere (Firefox, Chrome on a Mac or Linux) there is no
 * sheet for files, and the page offers the download and the caption to copy
 * instead. The share must start while the tap is still fresh (Safari
 * refuses it otherwise), so the picture is already in memory when the
 * button is pressed; nothing is fetched first.
 */

/** A File for `blob`, or null in a browser without the File constructor. */
export function fileFor(blob, filename, type = "image/png") {
  try {
    return new File([blob], filename, { type: blob?.type || type });
  } catch {
    return null;
  }
}

/** Whether this browser can share `file` through its own sheet. */
export function canShareFile(file) {
  try {
    return Boolean(file) && typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * The file (and the words) through the share sheet: "shared", "cancelled"
 * (the person closed the sheet), "unsupported" (no sheet for files here) or
 * "failed" (the sheet refused: the page falls back to the download).
 */
export async function shareFile({ file, text = "", title = "" }) {
  if (!canShareFile(file)) return "unsupported";
  const data = { files: [file] };
  if (text) data.text = text;
  if (title) data.title = title;
  try {
    // Some sheets won't take words with a file; the file alone, then (the caption has its own Copy button).
    if (text && !navigator.canShare(data)) delete data.text;
    await navigator.share(data);
    return "shared";
  } catch (e) {
    if (e?.name === "AbortError") return "cancelled";
    return "failed";
  }
}

/** The blob saved as `filename`, the way a link with `download` saves it. True when the browser was asked. */
export function downloadBlob(blob, filename) {
  let url = null;
  try {
    url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  } finally {
    // Let the browser start the download before the address goes.
    if (url) setTimeout(() => URL.revokeObjectURL(url), 30 * 1000);
  }
}

/** The words on the clipboard; the old way where the clipboard API isn't allowed. True when copied. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* no clipboard API, or not allowed here */
  }
  try {
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand("copy");
    box.remove();
    return ok;
  } catch {
    return false;
  }
}
