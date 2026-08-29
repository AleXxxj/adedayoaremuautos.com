"use client";

/**
 * The last line of defence, for when even the root layout could not render.
 *
 * This exists because of a real fifteen minutes: the backend became
 * unreachable and every page of the site — public and admin — gave the
 * browser's own "cannot reach server" screen while the owner was demonstrating
 * the business to new staff. There was nothing to say the business still
 * existed, no phone number, and no reason for a customer to do anything but
 * leave.
 *
 * A page that says so plainly, with a way to make contact, is worth having
 * even in the case where almost nothing else works. It replaces the whole
 * document, so it carries its own styles and cannot rely on the app's CSS
 * having loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#f4f6f5",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: "34rem", textAlign: "center" }}>
          <p
            style={{
              margin: "0 0 20px",
              fontSize: "13px",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "#5aa87d",
            }}
          >
            ADEDAYO AREMU AUTOS
          </p>

          <h1 style={{ margin: "0 0 12px", fontSize: "24px", lineHeight: 1.25 }}>
            We are having a technical problem
          </h1>

          <p style={{ margin: "0 0 24px", fontSize: "15px", lineHeight: 1.6, color: "#b9c2bd" }}>
            This is on our side, not yours, and we are usually back within a few
            minutes. The showroom is open and reachable by phone in the meantime.
          </p>

          <button
            onClick={reset}
            style={{
              appearance: "none",
              border: 0,
              cursor: "pointer",
              background: "#2a5c42",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 600,
              padding: "12px 26px",
              borderRadius: "8px",
            }}
          >
            Try again
          </button>

          {/* The digest is the only handle on the incident in the logs. Shown
              rather than hidden, so a customer reporting it gives us something
              we can search for. */}
          {error.digest && (
            <p style={{ marginTop: "24px", fontSize: "12px", color: "#6b736e" }}>
              Reference {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
