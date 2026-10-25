"use client";

import { useState } from "react";

/**
 * "Download" under a ticket: draws the #ticket element to a PDF. The two
 * libraries that do it (about 600 KB) load only when the button is pressed,
 * not with the page. While it draws the button says so; if it fails (a
 * library that didn't load, a canvas the browser refused) it says that too,
 * and can be pressed again.
 */
const Download = () => {
  const [state, setState] = useState("idle"); // idle | busy | failed

  const generatePDF = async () => {
    const ticketElement = document.getElementById("ticket");
    if (!ticketElement) return;
    setState("busy");
    try {
      const [{ default: html2canvas }, { default: JsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const canvas = await html2canvas(ticketElement, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new JsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save("ticket.pdf");
      setState("idle");
    } catch {
      setState("failed");
    }
  };

  return (
    <div className="mobile-register-container download-btn">
      <button type="button" className="register-btn mobile-register-btn " onClick={generatePDF} disabled={state === "busy"}>
        {state === "busy" ? "Preparing…" : "Download"}
      </button>
      {state === "failed" ? (
        <p className="download-error" role="alert">
          The PDF couldn&rsquo;t be made. Try again, or take a screenshot of the ticket.
        </p>
      ) : null}
    </div>
  );
};

export default Download;
