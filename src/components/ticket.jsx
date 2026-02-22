import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { eventsApi } from "@/api/events";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { QRCodeCanvas } from "qrcode.react";
import "@/styles/ticket.css";
import Download from "@/components/download";

const Ticket = () => {
  const { ticketid } = useParams();
  const [ticketData, setTicketData] = useState(null);

  useEffect(() => {
    if (!ticketid) return;
    const getTicketDetails = async () => {
      const data = await eventsApi.fetchTicketDetails(ticketid);
      setTicketData(data);
    };

    getTicketDetails();
  }, [ticketid]);


  const generatePDF = () => {
    const ticketElement = document.getElementById("ticket");
    if (!ticketElement) return;

    html2canvas(ticketElement, { scale: 2 }).then((canvas) => {
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save("ticket.pdf");
    });
  };

  if (!ticketData) {
    return <div>Loading ticket details...</div>;
  }

  return (
    <div className="ticket-container">
      <div
        className="ticket"
        id="ticket"
        style={{
          background: `url(${ticketData.event?.poster?.original || ""}) no-repeat center center`,
          backgroundSize: "cover",
        }}
      >
        <div className="ticket-header">
          <h1>{ticketData.event?.name || "N/A"}</h1>
        </div>

        <div className="ticket-info-grid">
          <div className="ticket-info">
            <span className="ticket-info-label">Date</span>
            <span className="ticket-info-value">
              {ticketData.event?.event_datetime?.split("T")[0]?.split("-").reverse().join("-") || "N/A"}
            </span>
          </div>

          <div className="ticket-info">
            <span className="ticket-info-label">Time</span>
            <span className="ticket-info-value">
              {ticketData.event?.event_datetime?.split("T")[1]?.slice(0, 5) || "N/A"}
            </span>
          </div>

          <div className="ticket-info">
            <span className="ticket-info-label">Location</span>
            <span className="ticket-info-value">{ticketData.event?.location_name}</span>
          </div>

          <div className="ticket-info">
            <span className="ticket-info-label">Ticket ID</span>
            <span className="ticket-info-value">{ticketid || "N/A"}</span>
          </div>

          <div className="ticket-info">
            <span className="ticket-info-label">Ticket Holder Name</span>
            <span className="ticket-info-value">{ticketData.user.full_name || "N/A"}</span>
          </div>

          <div className="ticket-info">
            <span className="ticket-info-label">Ticket Type</span>
            <span className="ticket-info-value">BASIC</span>
          </div>
        </div>

        <div className="guidelines">
          <a href="#" className="guidelines-link">
            Check Out Guidelines
          </a>
        </div>

        <div className="ticket-divider"></div>

        <div className="qr-section">
          <div className="qr-code">
            <QRCodeCanvas value={ticketid || "N/A"} size={150} level="H" includeMargin={true} />
          </div>
          <p className="qr-info">
            Generate this ticket at the venue to mark attendance and get other complimentaries
          </p>
        </div>
      </div>

      <button className="download-button" onClick={generatePDF}>
        DOWNLOAD TICKET
      </button>
      <Download />
    </div>
  );
};

export default Ticket;
