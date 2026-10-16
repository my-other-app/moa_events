import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import apiClient from "@/api/client";
import "@/styles/live.css";

/**
 * A club's published website, served whole from the API as one HTML page
 * and shown here at the club's address. Tracking links to the club page
 * land here with their tags; a `follow` hint shows how to follow in the
 * app, since following needs an account there.
 */
const ClubSite = () => {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const [html, setHtml] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    apiClient
      .get(`/api/v1/sites/${slug}`, { skipAuth: true, responseType: "text", transformResponse: [(d) => d] })
      .then((r) => alive && setHtml(r.data))
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [slug]);

  if (missing) {
    return (
      <div className="live-page">
        <div className="live-top">
          <Link to="/">← MyOtherApp</Link>
          <h1>No site here yet</h1>
        </div>
        <p style={{ color: "#9aa39e" }}>This club has not published its website. Its events are in the app.</p>
      </div>
    );
  }
  if (html === null) return <p></p>;

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      {params.get("follow") ? (
        <div className="live-banner" role="status" style={{ margin: 0, borderRadius: 0 }}>
          <span className="live-kind">Follow</span>
          Following happens in the MyOtherApp app — open the club there and tap Follow.
        </div>
      ) : null}
      <iframe title="Club website" srcDoc={html} sandbox="allow-scripts allow-popups allow-top-navigation-by-user-activation" style={{ flex: 1, width: "100%", border: 0, background: "#fff" }} />
    </div>
  );
};

export default ClubSite;
