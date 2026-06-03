"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "4rem 2rem" }}>
      <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Something went wrong</h1>
      <p style={{ color: "#888", marginTop: "0.75rem", fontSize: "0.9rem" }}>
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          marginTop: "1.5rem",
          padding: "0.6rem 1.1rem",
          background: "#fff",
          color: "#000",
          border: "none",
          borderRadius: 6,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </main>
  );
}
