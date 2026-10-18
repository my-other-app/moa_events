"use client";

/**
 * "Download" under a ticket or certificate: draws the #ticket element to a
 * PDF. The two libraries that do it (about 600 KB) load only when the
 * button is pressed, not with the page.
 */
const Download = () => {
  const generatePDF = async () => {
    const ticketElement = document.getElementById("ticket");
    if (!ticketElement) return;

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
  };

  return (
    <div className="mobile-register-container download-btn">
      <button type="button" className="register-btn mobile-register-btn " onClick={generatePDF}>
        Download
      </button>
    </div>
  );
};

export default Download;
