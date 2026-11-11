"use client";

import { useRef } from "react";
import { supportApi } from "@/api/support";
import { describeSupportError, FILE_ACCEPT, fileProblem, fileSize, MAX_FILES } from "@/utils/help";
import Icon from "../discover/icons";

let seq = 0;

/**
 * Up to three screenshots (or PDFs), each uploaded the moment it is picked
 * (POST /support/uploads, kept privately until the request goes), so Send
 * only names their keys. `files` is the parent's list of
 *   {id, name, size, status: "uploading" | "done" | "failed", key?, error?}
 * and `onChange(next)` its setter (a function of the list as it stands, as
 * uploads finish in any order).
 */
export function Attachments({ files, onChange, disabled = false, id = "hp-files" }) {
  const input = useRef(null);
  const left = MAX_FILES - files.length;

  const upload = (item, file) => {
    supportApi.upload(file).then(
      (up) => onChange((list) => list.map((f) => (f.id === item.id ? { ...f, status: "done", key: up.key, name: up.name || f.name } : f))),
      (error) => {
        const p = describeSupportError(error, "upload");
        const said =
          p.kind === "off"
            ? "Screenshots can't be added just now. Send your message without it, or email it to us."
            : p.kind === "fields"
              ? Object.values(p.fields)[0]
              : p.message || "That didn't upload.";
        onChange((list) => list.map((f) => (f.id === item.id ? { ...f, status: "failed", error: said, file } : f)));
      }
    );
  };

  const pick = (e) => {
    const chosen = Array.from(e.target.files || []);
    e.target.value = "";
    if (!chosen.length) return;
    const added = [];
    for (const file of chosen.slice(0, Math.max(0, left))) {
      seq += 1;
      const problem = fileProblem(file);
      const item = { id: `f${seq}`, name: file.name || "Screenshot", size: file.size || 0, status: problem ? "failed" : "uploading", error: problem || null };
      added.push([item, problem ? null : file]);
    }
    onChange((list) => [...list, ...added.map(([item]) => item)]);
    for (const [item, file] of added) if (file) upload(item, file);
  };

  const retry = (f) => {
    if (!f.file) return;
    onChange((list) => list.map((x) => (x.id === f.id ? { ...x, status: "uploading", error: null } : x)));
    upload(f, f.file);
  };
  const remove = (f) => onChange((list) => list.filter((x) => x.id !== f.id));

  return (
    <div className="hp-files">
      {files.length ? (
        <ul className="hp-file-list" aria-label="Attached">
          {files.map((f) => (
            <li key={f.id} className={`hp-file is-${f.status}`}>
              <Icon name={f.status === "failed" ? "alert" : f.status === "done" ? "check" : "upload"} size={16} />
              <span className="hp-file-name">{f.name}</span>
              <span className="hp-file-size">{f.status === "uploading" ? "Uploading…" : fileSize(f.size)}</span>
              {f.status === "failed" && f.file ? (
                <button type="button" className="rg-textbtn" onClick={() => retry(f)} disabled={disabled}>
                  Try again
                </button>
              ) : null}
              <button type="button" className="hp-file-x" onClick={() => remove(f)} disabled={disabled} aria-label={`Remove ${f.name}`}>
                <Icon name="close" size={16} />
              </button>
              {f.error ? <p className="hp-file-error">{f.error}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {left > 0 ? (
        <>
          <input ref={input} id={id} className="dc-sr" type="file" accept={FILE_ACCEPT} multiple onChange={pick} disabled={disabled} />
          <button type="button" className="dc-btn dc-btn--ghost dc-btn--sm" onClick={() => input.current?.click()} disabled={disabled} aria-controls={id}>
            <Icon name="upload" size={16} />
            {files.length ? "Add another" : "Add screenshots"}
          </button>
          <p className="rg-hint">
            Up to {MAX_FILES}: PNG, JPG, WebP or PDF, 5 MB each.
          </p>
        </>
      ) : (
        <p className="rg-hint">That&rsquo;s the most we can take with one message.</p>
      )}
    </div>
  );
}

/** The keys of the files that made it; whether any is still on its way. */
export const uploadedKeys = (files) => files.filter((f) => f.status === "done" && f.key).map((f) => f.key);
export const stillUploading = (files) => files.some((f) => f.status === "uploading");
