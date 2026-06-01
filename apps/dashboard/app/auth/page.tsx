import { signIn } from "./actions";

type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function AuthPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = params.next ?? "/";
  const error = params.error === "invalid";

  return (
    <main
      style={{
        maxWidth: 380,
        margin: "8rem auto",
        padding: "2rem",
        background: "#111",
        border: "1px solid #222",
        borderRadius: 8,
      }}
    >
      <h1 style={{ fontSize: "1.3rem", margin: "0 0 0.25rem" }}>Sign in</h1>
      <p style={{ color: "#888", margin: "0 0 1.5rem", fontSize: "0.85rem" }}>
        Enter the hub access token.
      </p>
      <form action={signIn}>
        <input type="hidden" name="next" value={next} />
        <input
          type="password"
          name="token"
          autoComplete="current-password"
          required
          autoFocus
          style={{
            width: "100%",
            padding: "0.6rem 0.75rem",
            background: "#000",
            color: "#ededed",
            border: "1px solid #333",
            borderRadius: 6,
            fontSize: "0.9rem",
            marginBottom: "0.75rem",
            boxSizing: "border-box",
          }}
        />
        {error ? (
          <p style={{ color: "#f87171", fontSize: "0.8rem", margin: "0 0 0.75rem" }}>
            Invalid token.
          </p>
        ) : null}
        <button
          type="submit"
          style={{
            width: "100%",
            padding: "0.6rem",
            background: "#fff",
            color: "#000",
            border: "none",
            borderRadius: 6,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
