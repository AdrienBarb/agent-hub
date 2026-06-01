import Link from "next/link";
import { MODELS } from "@hub/core/llm";

type AgentSummary = {
  slug: string;
  name: string;
  cron: string;
  description: string;
  href: string | null;
};

const agents: AgentSummary[] = [
  {
    slug: "job-hunt",
    name: "Job Hunt",
    cron: "0 6 * * *",
    description:
      "Daily multi-board scrape, dedupe, fit-evaluation, and ATS-tailored resume + cover letter generation.",
    href: "/agents/job-hunt",
  },
  {
    slug: "get-news",
    name: "Get News",
    cron: "0 7 * * *",
    description:
      "Pulls Feedbin, deep-reads with subagents, summarizes in French, voices via ElevenLabs, sends to Telegram.",
    href: null,
  },
];

export default function Home() {
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "4rem 2rem" }}>
      <header style={{ marginBottom: "3rem" }}>
        <h1 style={{ fontSize: "2rem", margin: 0 }}>Agent Hub</h1>
        <p style={{ color: "#888", marginTop: "0.5rem" }}>
          Personal hub for autonomous AI agents.
        </p>
        <p style={{ color: "#555", fontSize: "0.8rem", marginTop: "1rem" }}>
          Models: evaluator <code>{MODELS.evaluator}</code> · generator{" "}
          <code>{MODELS.generator}</code>
        </p>
      </header>

      <section>
        <h2 style={{ fontSize: "1.2rem", color: "#aaa" }}>Agents</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {agents.map((agent) => {
            const card = (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <strong style={{ fontSize: "1.05rem" }}>{agent.name}</strong>
                  <code style={{ color: "#666", fontSize: "0.85rem" }}>
                    {agent.cron}
                  </code>
                </div>
                <p style={{ color: "#888", margin: "0.5rem 0 0", fontSize: "0.9rem" }}>
                  {agent.description}
                </p>
              </>
            );
            const cardStyle = {
              border: "1px solid #222",
              borderRadius: 8,
              padding: "1.25rem",
              marginBottom: "1rem",
              display: "block",
              color: "inherit",
              textDecoration: "none",
            } as const;
            return (
              <li key={agent.slug} style={{ listStyle: "none" }}>
                {agent.href ? (
                  <Link href={agent.href} style={cardStyle}>
                    {card}
                  </Link>
                ) : (
                  <div style={cardStyle}>{card}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
