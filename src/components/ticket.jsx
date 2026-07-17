import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { eventsApi } from "@/api/events";
import { QRCodeCanvas } from "qrcode.react";
import "@/styles/ticket.css";
import Download from "@/components/download";

const Ticket = () => {
  const { ticketid } = useParams();
  const [ticketData, setTicketData] = useState(null);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!ticketid) return;
    setError(false);
    const getTicketDetails = async () => {
      const data = await eventsApi.fetchTicketDetails(ticketid);
      if (data) {
        setTicketData(data);
      } else {
        setError(true);
      }
    };

    getTicketDetails();
  }, [ticketid, retryCount]);


  if (error) {
    return (
      <div className="ticket-container">
        <p>Failed to load ticket details. Please check your connection and try again.</p>
        <button className="download-button" onClick={() => setRetryCount((c) => c + 1)}>
          RETRY
        </button>
      </div>
    );
  }

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

      <Download />
    </div>
  );
};

export default Ticket;
