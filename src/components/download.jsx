import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import "../styles/registerbutton.css";
import "../styles/download.css";

const Download = () => {

  const generatePDF = () => {
    const ticketElement = document.getElementById("ticket")
    if (!ticketElement) return

    html2canvas(ticketElement, { scale: 2 }).then((canvas) => {
      const imgData = canvas.toDataURL("image/png")
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width, canvas.height]
      })
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height)
      pdf.save("ticket.pdf")
    })
  }

  return (
    <div className="mobile-register-container download-btn">
      <button
        className="register-btn mobile-register-btn "
        onClick={generatePDF}
      >
        Download
      </button>
    </div>
  );
};

export default Download;