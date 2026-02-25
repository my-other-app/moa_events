import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { eventsApi } from "@/api/events";
import { QRCodeCanvas } from "qrcode.react";
import "@/styles/certificate.css";
import Download from "@/components/download";

const Certificate = () => {
    const { ticketid } = useParams();
    const [ticketData, setTicketData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!ticketid) return;
        const getTicketDetails = async () => {
            try {
                const data = await eventsApi.fetchTicketDetails(ticketid);
                if (!data) {
                    setError("Certificate not found");
                } else if (!data.is_attended) {
                    setError("Certificate is only available after attendance is marked");
                } else {
                    setTicketData(data);
                }
            } catch (err) {
                setError("Failed to load certificate");
            } finally {
                setLoading(false);
            }
        };
        getTicketDetails();
    }, [ticketid]);

    const handleDownload = () => {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
        window.open(
            `${API_BASE_URL}/api/v1/events/certificates/${ticketid}/pdf`,
            "_blank"
        );
    };

    if (loading) {
        return (
            <div className="cert-page-container">
                <div className="cert-page-loading">Loading certificate...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="cert-page-container">
                <div className="cert-page-error">
                    <div className="cert-error-icon">🎓</div>
                    <h2>{error}</h2>
                    <p>
                        {error.includes("attendance")
                            ? "Please attend the event first to receive your certificate."
                            : "The certificate you are looking for could not be found."}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="cert-page-container">
            <div className="cert-preview" id="certificate">
                <div className="cert-preview-inner">
                    {/* Header */}
                    <div className="cert-preview-org">
                        {ticketData.event?.club?.name || ""}
                    </div>
                    <h1 className="cert-preview-title">Certificate of Participation</h1>

                    {/* Body */}
                    <p className="cert-preview-subtitle">This is to certify that</p>
                    <div className="cert-preview-name">
                        {ticketData.full_name || "N/A"}
                    </div>

                    <div className="cert-preview-details">
                        has successfully participated in
                        <br />
                        <span className="cert-event-name">
                            {ticketData.event?.name || "N/A"}
                        </span>
                        <br />
                        held on{" "}
                        {ticketData.event?.event_datetime
                            ? new Date(ticketData.event.event_datetime).toLocaleDateString(
                                "en-IN",
                                { day: "2-digit", month: "short", year: "numeric" }
                            )
                            : "N/A"}
                    </div>

                    {/* QR */}
                    <div className="cert-preview-qr">
                        <QRCodeCanvas
                            value={`certificate:${ticketid}`}
                            size={80}
                            level="H"
                            includeMargin={true}
                        />
                    </div>

                    {/* Footer */}
                    <div className="cert-preview-footer">
                        <div>
                            <div className="cert-footer-label">Certificate ID</div>
                            <div className="cert-footer-value">{ticketid}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div className="cert-footer-label">Organized By</div>
                            <div className="cert-footer-value">
                                {ticketData.event?.club?.name || "N/A"}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <button className="cert-download-button" onClick={handleDownload}>
                DOWNLOAD CERTIFICATE
            </button>
            <Download />
        </div>
    );
};

export default Certificate;
