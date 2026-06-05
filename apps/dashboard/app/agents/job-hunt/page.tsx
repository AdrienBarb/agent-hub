import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { db } from "@hub/core/db";
import { Prisma } from "@hub/core/prisma";
import { manifest } from "@hub/agent-jobhunt";
import { RunNowButton } from "./_components/RunNowButton";
import { JobsBoard } from "./_components/JobsBoard";
import type { JobView } from "./_components/types";

// Dynamic: the page reads uncached job rows that change as the agent runs and
// as the user marks jobs — never statically cache it.
export const dynamic = "force-dynamic";

// Distinctive type pairing (deliberately not Inter/system): a high-contrast
// display serif, a warm grotesque body, and a mono for numerals/labels. All
// three are variable fonts, so weight is omitted.
const display = Fraunces({ subsets: ["latin"], display: "swap", variable: "--font-display" });
const body = Hanken_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-mono" });

const jobSelect = {
  id: true,
  url: true,
  title: true,
  company: true,
  city: true,
  board: true,
  firstSeenAt: true,
  fitScore: true,
  fitReasoning: true,
  status: true,
  resumePdfStoragePath: true,
  coverPdfStoragePath: true,
  resumeStoragePath: true,
  coverStoragePath: true,
} as const;

// Derived straight from the select so adding/removing a column can't leave this
// shape stale (and j.fitScore is the real Prisma Decimal).
type Row = Prisma.JobGetPayload<{ select: typeof jobSelect }>;

function toView(j: Row): JobView {
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    city: j.city,
    url: j.url,
    board: j.board,
    firstSeen: j.firstSeenAt.toISOString().slice(0, 10),
    fitScore: j.fitScore == null ? null : j.fitScore.toNumber(),
    fitReasoning: j.fitReasoning,
    status: j.status,
    resumeKind: j.resumePdfStoragePath
      ? "resume-pdf"
      : j.resumeStoragePath
        ? "resume"
        : null,
    coverKind: j.coverPdfStoragePath
      ? "cover-pdf"
      : j.coverStoragePath
        ? "cover"
        : null,
  };
}

export default async function JobHuntPage() {
  const [activeRows, oldRows] = await Promise.all([
    db.job.findMany({
      where: { status: "tailored" },
      orderBy: [{ fitScore: "desc" }, { firstSeenAt: "desc" }],
      take: 60,
      select: jobSelect,
    }),
    db.job.findMany({
      where: { status: { in: ["applied", "rejected"] } },
      orderBy: [{ tailoredAt: "desc" }, { firstSeenAt: "desc" }],
      take: 60,
      select: jobSelect,
    }),
  ]);

  const active = activeRows.map(toView);
  const old = oldRows.map(toView);

  return (
    <main
      className={`jh-root ${display.variable} ${body.variable} ${mono.variable}`}
      style={{ maxWidth: 1180, margin: "0 auto", padding: "3.5rem 2rem 5rem" }}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="jh-header">
        <div>
          <p className="jh-kicker">Autonomous agent</p>
          <h1 className="jh-title-main">{manifest.name}</h1>
          <p className="jh-sched">
            runs <code>{manifest.cron}</code> · {manifest.timezone}
          </p>
        </div>
        <RunNowButton />
      </header>

      <JobsBoard active={active} old={old} />
    </main>
  );
}

const CSS = `
.jh-root {
  --surface: #141417;
  --line: rgba(255,255,255,0.08);
  --line-strong: rgba(255,255,255,0.14);
  --ink: #f3f2ef;
  --muted: #8b8b93;
  --muted-2: #6a6a72;
  --emerald: #34d399;
  font-family: var(--font-body), system-ui, sans-serif;
  color: var(--ink);
  position: relative;
}
.jh-root::before {
  content: "";
  position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background:
    radial-gradient(900px 520px at 12% -12%, rgba(199,242,78,0.06), transparent 60%),
    radial-gradient(760px 520px at 104% -4%, rgba(52,211,153,0.05), transparent 55%),
    #0a0a0b;
}

/* ---- header ---- */
.jh-header {
  display: flex; justify-content: space-between; align-items: flex-end; gap: 16px;
  padding-bottom: 22px; border-bottom: 1px solid var(--line);
}
.jh-kicker {
  font-family: var(--font-mono); font-size: .7rem; letter-spacing: .2em;
  text-transform: uppercase; color: var(--muted-2); margin: 0 0 8px;
}
.jh-title-main {
  font-family: var(--font-display); font-size: 2.5rem; line-height: 1;
  font-weight: 600; margin: 0; letter-spacing: -.02em;
}
.jh-sched {
  font-family: var(--font-mono); font-size: .76rem; color: var(--muted); margin: 12px 0 0;
}
.jh-sched code { color: var(--ink); }

/* ---- sections ---- */
.jh-section { margin-top: 2.75rem; }
.jh-section-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 16px; }
.jh-h2 {
  font-family: var(--font-display); font-size: 1.45rem; font-weight: 600;
  margin: 0; letter-spacing: -.01em;
}
.jh-h2--muted { color: var(--muted); }
.jh-count {
  font-family: var(--font-mono); font-size: .76rem; font-weight: 700;
  color: #06231a; background: var(--emerald); padding: 2px 9px; border-radius: 999px;
}
.jh-count--muted { color: var(--muted); background: rgba(255,255,255,0.06); }
.jh-section-sub {
  margin: 0 0 0 auto; color: var(--muted-2); font-size: .76rem; font-family: var(--font-mono);
}
.jh-empty { color: var(--muted-2); font-size: .92rem; padding: 22px 0; }

/* ---- active list (one card per row) ---- */
.jh-grid {
  display: flex; flex-direction: column; gap: 16px;
}

/* ---- card ---- */
.jh-card {
  position: relative; display: flex; flex-direction: column; gap: 14px;
  padding: 20px 20px 18px; border-radius: 16px;
  background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)), var(--surface);
  border: 1px solid var(--line);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 12px 30px -22px rgba(0,0,0,0.85);
  transition: transform .25s cubic-bezier(.2,.7,.2,1), border-color .25s, box-shadow .25s, opacity .3s;
  overflow: hidden;
}
.jh-card::before {
  content: ""; position: absolute; left: 0; top: 0; height: 3px; width: 100%;
  background: linear-gradient(90deg, var(--ring), transparent 72%); opacity: .75;
}
.jh-card:hover {
  transform: translateY(-3px); border-color: var(--line-strong);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 26px 52px -30px rgba(0,0,0,0.95);
}
.jh-card--out { opacity: 0; transform: scale(.96) translateY(-6px); pointer-events: none; }

.jh-card-head { display: flex; gap: 16px; align-items: flex-start; }
.jh-headtext { min-width: 0; }
.jh-tierlabel {
  font-family: var(--font-mono); font-size: .64rem; text-transform: uppercase;
  letter-spacing: .14em; display: block; margin-bottom: 5px;
}
.jh-title {
  font-family: var(--font-display); font-size: 1.18rem; font-weight: 600;
  color: var(--ink); text-decoration: none; line-height: 1.25;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  transition: color .2s;
}
.jh-title:hover { color: var(--ring); }
.jh-meta { color: #bdbcc4; font-size: .85rem; margin-top: 4px; }

/* ---- gauge ---- */
.jh-gauge {
  position: relative; width: 74px; height: 74px; border-radius: 50%; flex: 0 0 auto;
  background: conic-gradient(var(--ring) calc(var(--pct) * 1%), rgba(255,255,255,0.07) 0);
  display: grid; place-items: center;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,.5));
}
.jh-gauge-inner {
  width: 58px; height: 58px; border-radius: 50%;
  background: radial-gradient(circle at 32% 26%, #1d1d22, #131316);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  line-height: 1; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
}
.jh-gauge-num { font-family: var(--font-mono); font-size: 1.25rem; font-weight: 700; }
.jh-gauge-max { font-family: var(--font-mono); font-size: .58rem; color: var(--muted-2); margin-top: 2px; }

/* ---- reasoning ---- */
.jh-reason {
  margin: 0; font-size: .9rem; line-height: 1.55; color: #cfceca;
  padding-left: 12px; border-left: 2px solid var(--line-strong);
  display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden;
}

/* ---- footer / actions ---- */
.jh-foot {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  flex-wrap: wrap; margin-top: auto; padding-top: 14px; border-top: 1px solid var(--line);
}
.jh-links { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.jh-link {
  font-family: var(--font-mono); font-size: .76rem; color: var(--muted);
  text-decoration: none; transition: color .2s;
}
.jh-link:hover { color: var(--ink); }
.jh-dl {
  font-size: .8rem; color: #d6e8da; text-decoration: none;
  padding: 5px 10px; border-radius: 8px;
  border: 1px solid rgba(52,211,153,0.22); background: rgba(52,211,153,0.06);
  transition: background .2s, border-color .2s, color .2s;
}
.jh-dl:hover { background: rgba(52,211,153,0.14); border-color: rgba(52,211,153,0.5); color: #eafff2; }
.jh-actions { display: flex; gap: 8px; }
.jh-btn {
  font-family: var(--font-body); font-size: .82rem; font-weight: 600;
  padding: 8px 14px; border-radius: 9px; cursor: pointer; border: 1px solid transparent;
  transition: background .18s, border-color .18s, color .18s, box-shadow .18s, transform .1s;
}
.jh-btn:active:not(:disabled) { transform: translateY(1px); }
.jh-btn:disabled { cursor: default; opacity: .6; }
.jh-btn--apply { background: var(--emerald); color: #06231a; border-color: var(--emerald); }
.jh-btn--apply:hover:not(:disabled) { background: #43e6ab; box-shadow: 0 8px 22px -10px rgba(52,211,153,.75); }
.jh-btn--skip { background: transparent; color: var(--muted); border-color: var(--line-strong); }
.jh-btn--skip:hover:not(:disabled) { color: var(--ink); border-color: #55555f; background: rgba(255,255,255,0.03); }
.jh-btn--ghost { background: transparent; color: var(--muted); border-color: var(--line); font-size: .78rem; padding: 6px 11px; }
.jh-btn--ghost:hover:not(:disabled) { color: var(--ink); border-color: var(--line-strong); }

/* ---- old jobs ---- */
.jh-oldlist { display: flex; flex-direction: column; gap: 8px; }
.jh-old {
  display: flex; align-items: center; gap: 14px; padding: 11px 14px;
  border: 1px solid var(--line); border-radius: 12px; background: rgba(255,255,255,0.015);
  transition: opacity .3s, transform .3s, border-color .2s;
}
.jh-old:hover { border-color: var(--line-strong); }
.jh-old--out { opacity: 0; transform: translateX(10px); pointer-events: none; }
.jh-chip {
  font-family: var(--font-mono); font-weight: 700; font-size: .82rem; color: var(--ring);
  width: 38px; height: 38px; flex: 0 0 auto; display: grid; place-items: center;
  border-radius: 10px; border: 1px solid var(--line-strong); background: rgba(255,255,255,0.03);
}
.jh-old-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.jh-old-title {
  font-family: var(--font-display); font-size: .98rem; color: var(--ink);
  text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.jh-old-title:hover { text-decoration: underline; }
.jh-old-meta { color: var(--muted-2); font-size: .76rem; }
.jh-badge {
  font-family: var(--font-mono); font-size: .64rem; text-transform: uppercase;
  letter-spacing: .1em; padding: 3px 9px; border-radius: 999px; flex: 0 0 auto;
}
.jh-badge--applied { color: #06231a; background: var(--emerald); }
.jh-badge--skipped { color: var(--muted); background: rgba(255,255,255,0.06); border: 1px solid var(--line); }
.jh-old-links { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-left: auto; }
@media (max-width: 640px) {
  .jh-old { flex-wrap: wrap; }
  .jh-old-links { margin-left: 52px; }
}
`;
