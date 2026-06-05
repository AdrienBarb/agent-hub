/**
 * swissdevjobs.ch adapter.
 *
 * The listing renders every job twice:
 *  1. a clean markdown table  `| [Title](url?utm…) | Company |`  — breadth + title + company
 *  2. rich cards whose link title attribute carries the city  (`"… emploi Bern"` / `"… Job in Bern"`)
 *
 * The table is the reliable source of title+company, so it's primary; cards only
 * enrich `city`. Both link forms canonicalise to the same job URL/slug
 * (`https://swissdevjobs.ch/jobs/<slug>`), so they merge cleanly.
 *
 * A real job link is exactly `/jobs/<slug>` (one segment). That distinguishes it
 * from nav links like `/jobs/JavaScript/all` or `/jobs/JavaScript/Zurich`
 * (two segments: <tech>/<city|all>), which we drop.
 */
import type { BoardAdapter, ParsedJob } from "./types";

const BOARD_ID = "swissdevjobs";

function unescapeMd(s: string): string {
  return s.replace(/\\([[\]()\\])/g, "$1");
}

/**
 * Returns the canonical job URL + slug, or null if `rawUrl` is not a
 * job-detail link (nav, company page, tech tag, off-site, …).
 * Strips the `/fr|/en|/de` locale prefix and any `?utm_…` query so the table
 * and card forms of the same posting converge.
 */
function jobLink(rawUrl: string): { slug: string; url: string } | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!/(^|\.)swissdevjobs\.ch$/.test(u.hostname)) return null;
  const path = u.pathname.replace(/^\/(fr|en|de)(?=\/)/, "");
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "jobs") return null;
  const slug = parts[1] ?? "";
  if (!slug) return null;
  return { slug, url: `${u.origin}${path}` };
}

/** Pull `City` out of a card title attribute: `"<title> emploi <City>"` (fr) or `"<title> Job in <City>"` (en). */
function cityFromAttr(attr: string): string | null {
  const m = attr.match(/\s(?:emploi|Job\s+in)\s+(.+?)\s*(?:\|.*)?$/i);
  return m ? (m[1] ?? "").trim() || null : null;
}

/** Title is everything in the attr before the ` emploi `/` Job in ` city marker. */
function titleFromAttr(attr: string): string | null {
  const m = attr.match(/^(.*?)\s(?:emploi|Job\s+in)\s+/i);
  return m ? unescapeMd((m[1] ?? "").trim()) || null : null;
}

interface CardInfo {
  title: string | null;
  city: string | null;
  url: string;
}

/** slug → {title, city} harvested from card links that carry a title attribute. */
function parseCards(md: string): Map<string, CardInfo> {
  const re =
    /\[(?:[^\]\\]|\\.)*?\]\((https?:\/\/[^)\s"]*swissdevjobs\.ch\/[^)\s"]+)\s+"([^"]*)"\)/g;
  const out = new Map<string, CardInfo>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const link = jobLink(m[1] ?? "");
    if (!link) continue;
    const attr = m[2] ?? "";
    const city = cityFromAttr(attr);
    const title = titleFromAttr(attr);
    // Only treat as a job card if the attr actually carries the city marker —
    // tech-tag links ("Git Jobs Switzerland") are already filtered by jobLink,
    // this also skips logo/misc links that slipped through.
    if (city === null && title === null) continue;
    const prev = out.get(link.slug);
    if (!prev) out.set(link.slug, { title, city, url: link.url });
    else
      out.set(link.slug, {
        title: prev.title ?? title,
        city: prev.city ?? city,
        url: link.url,
      });
  }
  return out;
}

/** Primary source: the `| Job title | Company |` table. */
function parseTable(md: string): ParsedJob[] {
  const headerIdx = md.search(/\|\s*Job title\s*\|\s*Company\s*\|/i);
  if (headerIdx < 0) return [];
  const rowRe = /^\|\s*\[((?:[^\]\\]|\\.)+?)\]\((https?:\/\/[^)\s]+)\)\s*\|\s*(.*?)\s*\|/;
  const out: ParsedJob[] = [];
  const seen = new Set<string>();
  for (const line of md.slice(headerIdx).split(/\r?\n/)) {
    const m = rowRe.exec(line);
    if (!m) continue;
    const link = jobLink(m[2] ?? "");
    if (!link || seen.has(link.slug)) continue;
    seen.add(link.slug);
    out.push({
      slug: link.slug,
      board: BOARD_ID,
      title: unescapeMd((m[1] ?? "").trim()),
      company: unescapeMd((m[3] ?? "").trim()) || null,
      city: null,
      url: link.url,
    });
  }
  return out;
}

export const swissdevjobs: BoardAdapter = {
  id: BOARD_ID,
  displayName: "SwissDevJobs",
  parse(md: string): ParsedJob[] {
    const cards = parseCards(md);
    const rows = parseTable(md);

    if (rows.length > 0) {
      // Table is authoritative for title+company; cards only fill city.
      return rows.map((j) => ({ ...j, city: cards.get(j.slug)?.city ?? null }));
    }

    // Fallback: table didn't render — build the list from cards alone
    // (title from the attr, company unknown).
    const out: ParsedJob[] = [];
    for (const [slug, card] of cards) {
      if (!card.title) continue;
      out.push({
        slug,
        board: BOARD_ID,
        title: card.title,
        company: null,
        city: card.city,
        url: card.url,
      });
    }
    return out;
  },
};
