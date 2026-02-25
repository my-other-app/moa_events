import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { eventsApi } from "@/api/events";
import { QRCodeCanvas } from "qrcode.react";
import "@/styles/certificate.css";
import Download from "@/components/download";

const Certificate = () => {
    const { ticketid } = useParams();
    const [ticketData, setTicketData] = useState(null);
    const [style, setStyle] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!ticketid) return;
        const loadData = async () => {
            try {
                const [data, styleData] = await Promise.all([
                    eventsApi.fetchTicketDetails(ticketid),
                    eventsApi.fetchCertificateStyle(ticketid),
                ]);
                if (!data) {
                    setError("Certificate not found");
                } else if (!data.is_attended) {
                    setError("Certificate is only available after attendance is marked");
                } else {
                    setTicketData(data);
                    setStyle(styleData || {});
                }
            } catch (err) {
                setError("Failed to load certificate");
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [ticketid]);

    const handleDownload = () => {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
        window.open(
            `${API_BASE_URL}/api/v1/events/certificates/${ticketid}/pdf`,
            "_blank"
        );
    };

    // Resolve style values with defaults
    const accentColor = style?.accent_color || "#1db9a0";
    const bgColor = style?.bg_color || "#121212";
    const textColor = style?.text_color || "#ffffff";
    const fontFamily = style?.font || "Inter";

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
        <div className="cert-page-container" style={{ fontFamily: `"${fontFamily}", sans-serif` }}>
            {/* Google Font */}
            <link
                href={`https://fonts.googleapis.com/css2?family=${fontFamily}:wght@300;400;600;700&display=swap`}
                rel="stylesheet"
            />

            <div className="cert-preview" id="certificate" style={{ background: accentColor }}>
                <div className="cert-preview-inner" style={{ background: bgColor, color: textColor }}>
                    {/* Logo */}
                    {style?.logo_url && (
                        <img
                            src={style.logo_url}
                            alt="Logo"
                            style={{ maxHeight: 60, marginBottom: 12, objectFit: "contain" }}
                        />
                    )}

                    {/* Header */}
                    <div className="cert-preview-org" style={{ color: accentColor }}>
                        {ticketData.event?.club?.name || ""}
                    </div>
                    <h1 className="cert-preview-title">Certificate of Participation</h1>

                    {/* Custom text */}
                    {style?.custom_text && (
                        <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 12 }}>
                            {style.custom_text}
                        </p>
                    )}

                    {/* Body */}
                    <p className="cert-preview-subtitle">This is to certify that</p>
                    <div className="cert-preview-name" style={{ color: accentColor, borderBottomColor: accentColor }}>
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

                    {/* Signature */}
                    {style?.signature_url && (
                        <div style={{ marginBottom: 16 }}>
                            <img
                                src={style.signature_url}
                                alt="Signature"
                                style={{ maxHeight: 48, objectFit: "contain" }}
                            />
                            <div style={{ fontSize: 10, opacity: 0.4, marginTop: 4 }}>
                                Authorized Signatory
                            </div>
                        </div>
                    )}

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

            <button
                className="cert-download-button"
                onClick={handleDownload}
                style={{ background: accentColor }}
            >
                DOWNLOAD CERTIFICATE
            </button>
            <Download />
        </div>
    );
};

export default Certificate;
