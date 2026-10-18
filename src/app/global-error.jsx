"use client";

/* The last resort, when even the site's frame fails: plain words and a way back. */
export default function GlobalError({ reset }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "48px 20px", textAlign: "center", color: "#111827" }}>
        <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
        <p style={{ color: "#4b5563" }}>We couldn&apos;t load MyOtherApp just now. Try again in a moment.</p>
        <p>
          <button type="button" onClick={() => reset()} style={{ padding: "10px 18px", borderRadius: 999, border: 0, background: "#2c3440", color: "#fff" }}>
            Try again
          </button>{" "}
          {/* A full page load on purpose: the app around it is what failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ marginLeft: 12, color: "#0284c7" }}>
            Go home
          </a>
        </p>
      </body>
    </html>
  );
}
