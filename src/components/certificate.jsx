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
    const accent = style?.accent_color || "#1db9a0";
    const bg = style?.bg_color || "#121212";
    const text = style?.text_color || "#ffffff";
    const secondaryText = style?.secondary_text_color || "#aaaaaa";
    const font = style?.font || "Inter";
    const titleFont = style?.title_font || font;
    const certTitle = style?.certificate_title || "Certificate of Participation";
    const borderStyle = style?.border_style || "none";
    const borderColor = style?.border_color || accent;
    const showQr = style?.show_qr_code !== false;
    const showId = style?.show_certificate_id !== false;

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
        <div className="cert-page-container" style={{ fontFamily: `"${font}", sans-serif` }}>
            {/* Google Fonts */}
            <link href={`https://fonts.googleapis.com/css2?family=${font}:wght@300;400;600;700&display=swap`} rel="stylesheet" />
            {titleFont !== font && (
                <link href={`https://fonts.googleapis.com/css2?family=${titleFont}:wght@400;600;700&display=swap`} rel="stylesheet" />
            )}

            <div
                className="cert-preview"
                id="certificate"
                style={{
                    background: accent,
                    ...(borderStyle !== "none" ? { border: `3px ${borderStyle} ${borderColor}` } : {}),
                }}
            >
                <div
                    className="cert-preview-inner"
                    style={{
                        background: bg,
                        color: text,
                        position: "relative",
                        overflow: "hidden",
                        ...(style?.background_image_url ? {
                            backgroundImage: `url(${style.background_image_url})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                        } : {}),
                    }}
                >
                    {/* Background overlay */}
                    {style?.background_image_url && (
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 0 }} />
                    )}

                    <div style={{ position: "relative", zIndex: 1 }}>
                        {/* Logos */}
                        {(style?.logo_url || style?.secondary_logo_url) && (
                            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 14 }}>
                                {style?.logo_url && <img src={style.logo_url} alt="Logo" style={{ maxHeight: 55, objectFit: "contain" }} />}
                                {style?.secondary_logo_url && <img src={style.secondary_logo_url} alt="Partner Logo" style={{ maxHeight: 45, objectFit: "contain" }} />}
                            </div>
                        )}

                        {/* Organization */}
                        <div className="cert-preview-org" style={{ color: accent }}>
                            {ticketData.event?.club?.name || ""}
                        </div>

                        {/* Title */}
                        <h1 className="cert-preview-title" style={{ fontFamily: `"${titleFont}", serif` }}>
                            {certTitle}
                        </h1>

                        {/* Custom body text */}
                        {style?.custom_body_text && (
                            <p style={{ fontSize: 13, fontStyle: "italic", color: secondaryText, marginBottom: 12 }}>
                                {style.custom_body_text}
                            </p>
                        )}

                        {/* Recipient */}
                        <p className="cert-preview-subtitle" style={{ color: secondaryText }}>This is to certify that</p>
                        <div className="cert-preview-name" style={{ color: accent, borderBottomColor: accent }}>
                            {ticketData.full_name || "N/A"}
                        </div>

                        <div className="cert-preview-details" style={{ color: secondaryText }}>
                            has successfully participated in
                            <br />
                            <span className="cert-event-name" style={{ color: text }}>
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

                        {/* Signatures */}
                        {(style?.signature_1_url || style?.signature_2_url) && (
                            <div style={{ display: "flex", justifyContent: "center", gap: 48, marginBottom: 18 }}>
                                {style?.signature_1_url && (
                                    <div style={{ textAlign: "center" }}>
                                        <img src={style.signature_1_url} alt="Signature" style={{ maxHeight: 44, objectFit: "contain", marginBottom: 4 }} />
                                        <div style={{ width: 110, height: 1, background: secondaryText, margin: "0 auto 4px" }} />
                                        {style?.signature_1_name && <div style={{ fontSize: 11, fontWeight: 600 }}>{style.signature_1_name}</div>}
                                        {style?.signature_1_title && <div style={{ fontSize: 9, color: secondaryText }}>{style.signature_1_title}</div>}
                                    </div>
                                )}
                                {style?.signature_2_url && (
                                    <div style={{ textAlign: "center" }}>
                                        <img src={style.signature_2_url} alt="Signature" style={{ maxHeight: 44, objectFit: "contain", marginBottom: 4 }} />
                                        <div style={{ width: 110, height: 1, background: secondaryText, margin: "0 auto 4px" }} />
                                        {style?.signature_2_name && <div style={{ fontSize: 11, fontWeight: 600 }}>{style.signature_2_name}</div>}
                                        {style?.signature_2_title && <div style={{ fontSize: 9, color: secondaryText }}>{style.signature_2_title}</div>}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* QR Code */}
                        {showQr && (
                            <div className="cert-preview-qr">
                                <QRCodeCanvas value={`certificate:${ticketid}`} size={80} level="H" includeMargin={true} />
                            </div>
                        )}

                        {/* Footer */}
                        <div className="cert-preview-footer">
                            {showId && (
                                <div>
                                    <div className="cert-footer-label" style={{ color: secondaryText }}>Certificate ID</div>
                                    <div className="cert-footer-value">{ticketid}</div>
                                </div>
                            )}
                            <div style={{ textAlign: "right" }}>
                                <div className="cert-footer-label" style={{ color: secondaryText }}>Organized By</div>
                                <div className="cert-footer-value">
                                    {ticketData.event?.club?.name || "N/A"}
                                </div>
                            </div>
                        </div>

                        {/* Custom footer */}
                        {style?.custom_footer_text && (
                            <div style={{ textAlign: "center", fontSize: 11, color: secondaryText, marginTop: 14 }}>
                                {style.custom_footer_text}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <button
                className="cert-download-button"
                onClick={handleDownload}
                style={{ background: accent }}
            >
                DOWNLOAD CERTIFICATE
            </button>
            <Download />
        </div>
    );
};

export default Certificate;
