import { db } from "@hub/core/db";
import { manifest } from "@hub/agent-jobhunt";
import { triggerJobHuntRun } from "./actions";

export default async function JobHuntPage() {
  const [recentRuns, recentJobs, jobsWithJd] = await Promise.all([
    db.agentRun.findMany({
      where: { agentSlug: "job-hunt" },
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
    db.job.findMany({
      orderBy: { firstSeenAt: "desc" },
      take: 30,
      select: {
        id: true,
        board: true,
        url: true,
        title: true,
        company: true,
        city: true,
        salary: true,
        firstSeenAt: true,
        resumePdfStoragePath: true,
        coverPdfStoragePath: true,
      },
    }),
    db.job.findMany({
      where: { rawMarkdown: { not: null } },
      orderBy: { firstSeenAt: "desc" },
      take: 30,
      select: { id: true },
    }),
  ]);
  const hasJd = new Set(jobsWithJd.map((j) => j.id));

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "3rem 2rem" }}>
      <header style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", margin: 0 }}>{manifest.name}</h1>
          <p style={{ color: "#888", marginTop: "0.5rem", fontSize: "0.9rem" }}>
            cron <code>{manifest.cron}</code> · timezone {manifest.timezone}
          </p>
        </div>
        <form action={triggerJobHuntRun}>
          <button
            type="submit"
            style={{
              padding: "0.6rem 1.1rem",
              background: "#fff",
              color: "#000",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Run now
          </button>
        </form>
      </header>

      <section style={{ marginBottom: "3rem" }}>
        <h2 style={{ fontSize: "1rem", color: "#aaa", marginBottom: "0.75rem" }}>Recent runs</h2>
        {recentRuns.length === 0 ? (
          <p style={{ color: "#666" }}>No runs yet. Click &quot;Run now&quot;.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#888", borderBottom: "1px solid #222" }}>
                <th style={{ padding: "0.5rem 0.5rem 0.5rem 0" }}>Started</th>
                <th style={{ padding: "0.5rem" }}>Status</th>
                <th style={{ padding: "0.5rem" }}>Finished</th>
                <th style={{ padding: "0.5rem" }}>Trace</th>
                <th style={{ padding: "0.5rem" }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                  <td style={{ padding: "0.5rem 0.5rem 0.5rem 0", color: "#ccc" }}>{r.startedAt.toISOString()}</td>
                  <td style={{ padding: "0.5rem" }}>
                    <code style={{ color: r.status === "completed" ? "#4ade80" : r.status === "failed" ? "#f87171" : "#fbbf24" }}>
                      {r.status}
                    </code>
                  </td>
                  <td style={{ padding: "0.5rem", color: "#888" }}>{r.finishedAt?.toISOString() ?? "—"}</td>
                  <td style={{ padding: "0.5rem", color: "#666" }}>{r.langfuseTraceId ?? "—"}</td>
                  <td style={{ padding: "0.5rem", color: "#f87171", fontSize: "0.8rem" }}>{r.errorMessage ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: "1rem", color: "#aaa", marginBottom: "0.75rem" }}>
          Recent jobs ({recentJobs.length})
        </h2>
        {recentJobs.length === 0 ? (
          <p style={{ color: "#666" }}>No jobs yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {recentJobs.map((j) => (
              <li
                key={j.id}
                style={{
                  border: "1px solid #222",
                  borderRadius: 6,
                  padding: "0.85rem 1rem",
                  marginBottom: "0.5rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "1rem",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <a
                    href={j.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#ededed", fontWeight: 600, textDecoration: "none" }}
                  >
                    {j.title}
                  </a>
                  <div style={{ color: "#888", fontSize: "0.85rem", marginTop: "0.2rem" }}>
                    {j.company ?? "—"} · {j.city ?? "—"} · {j.salary ?? "salary not disclosed"}
                  </div>
                </div>
                <div style={{ textAlign: "right", color: "#666", fontSize: "0.75rem" }}>
                  <code style={{ color: "#888" }}>{j.board}</code>
                  <div>{j.firstSeenAt.toISOString().slice(0, 10)}</div>
                  <div style={{ color: hasJd.has(j.id) ? "#4ade80" : "#555", marginTop: "0.2rem" }}>
                    JD {hasJd.has(j.id) ? "✓" : "✗"}
                  </div>
                  {j.resumePdfStoragePath ? (
                    <div style={{ marginTop: "0.3rem", display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
                      <a
                        href={`/api/job-hunt/artifact?jobId=${j.id}&kind=resume-pdf`}
                        style={{ color: "#4ade80", textDecoration: "none" }}
                      >
                        Resume PDF
                      </a>
                      {j.coverPdfStoragePath ? (
                        <a
                          href={`/api/job-hunt/artifact?jobId=${j.id}&kind=cover-pdf`}
                          style={{ color: "#4ade80", textDecoration: "none" }}
                        >
                          Cover PDF
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
