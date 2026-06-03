import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "4rem 2rem" }}>
      <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Page not found</h1>
      <p style={{ color: "#888", marginTop: "0.75rem", fontSize: "0.9rem" }}>
        That page doesn&apos;t exist.
      </p>
      <Link
        href="/"
        style={{ display: "inline-block", marginTop: "1.5rem", color: "#4ade80" }}
      >
        ← Back home
      </Link>
    </main>
  );
}
