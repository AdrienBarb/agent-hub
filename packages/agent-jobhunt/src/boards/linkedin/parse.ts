import { convert as htmlToText } from "html-to-text";
import type { BoardAdapter, ParsedJob } from "../types";

/**
 * LinkedIn adapter — parses the PUBLIC guest job API (no login):
 *  - listing:  /jobs-guest/jobs/api/seeMoreJobPostings/search  → HTML card list
 *  - detail :  /jobs-guest/jobs/api/jobPosting/<id>            → HTML JD body
 *
 * It conforms to the same BoardAdapter.parse(md) contract as the Firecrawl
 * boards: parse() turns the guest SEARCH html into ParsedJob[]. The per-job JD
 * (detail endpoint) is fetched later in deep-scrape via extractJdText(), exactly
 * like every other board fetches its JD in the deep-scrape phase — so nothing
 * downstream (persist, dedupe, evaluator, tailor) needs to know LinkedIn is
 * different.
 */

const BOARD_ID = "linkedin";

// A guest job card. The numeric id is the stable identity (slug + the urn that
// reconstructs both the human apply link and the guest detail endpoint).
const CARD_SPLIT = /data-entity-urn="urn:li:jobPosting:(\d+)"/g;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

/** Inner-text of an HTML fragment: drop tags, decode entities, collapse space. */
function clean(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** First capture group of `re` against `block`, cleaned — or "" if no match. */
function fieldText(block: string, re: RegExp): string {
  const m = re.exec(block);
  return m?.[1] ? clean(m[1]) : "";
}

export function parseLinkedinSearch(html: string): ParsedJob[] {
  const out: ParsedJob[] = [];
  const seen = new Set<string>();

  // Split the listing into per-card slices: each card begins at its
  // data-entity-urn and runs until the next card's urn (or end of document).
  // Title/company/location all appear after the urn within the same card.
  const starts: { id: string; index: number }[] = [];
  CARD_SPLIT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CARD_SPLIT.exec(html)) !== null) {
    starts.push({ id: m[1] ?? "", index: m.index });
  }

  for (let i = 0; i < starts.length; i++) {
    const cur = starts[i];
    if (!cur) continue;
    const id = cur.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const next = starts[i + 1];
    const block = html.slice(cur.index, next ? next.index : undefined);

    const title = fieldText(block, /base-search-card__title"[^>]*>([\s\S]*?)<\/h3>/);
    const company = fieldText(
      block,
      /base-search-card__subtitle"[^>]*>([\s\S]*?)<\/h4>/,
    );
    const cityRaw = fieldText(
      block,
      /job-search-card__location"[^>]*>([\s\S]*?)<\/span>/,
    );

    if (!title) continue; // a card with no title is markup we can't use

    // Country-level "Switzerland" is noise vs jobup/jobsch city-level values —
    // null reads as "(unknown)" to the dedupe LLM, which is less misleading than
    // a country masquerading as a city.
    const city = cityRaw && !/^switzerland$/i.test(cityRaw) ? cityRaw : null;

    out.push({
      slug: id,
      board: BOARD_ID,
      title,
      company: company || null,
      city,
      // ALWAYS the human apply link — never the guest API endpoint used to
      // scrape it. This is what persist stores in Job.url and the dashboard
      // renders as the "View ↗" link.
      url: `https://www.linkedin.com/jobs/view/${id}`,
    });
  }

  return out;
}

/**
 * Return the inner HTML of the FIRST `.show-more-less-html__markup` element via a
 * balanced <div> scan. A non-greedy `</div>` would stop at the first nested
 * </div> and silently truncate JDs that wrap sections in <div>/<p>; the guest
 * detail page also renders the markup TWICE, so taking only the first match
 * avoids doubling. Returns null if the element isn't present.
 */
function extractMarkupHtml(detailHtml: string): string | null {
  const open = /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>/.exec(
    detailHtml,
  );
  if (!open) return null;
  const start = open.index + open[0].length;
  const tagRe = /<(\/?)div\b[^>]*>/g;
  tagRe.lastIndex = start;
  let depth = 1;
  let t: RegExpExecArray | null;
  while ((t = tagRe.exec(detailHtml)) !== null) {
    if (t[1] === "/") {
      depth--;
      if (depth === 0) return detailHtml.slice(start, t.index);
    } else {
      depth++;
    }
  }
  return detailHtml.slice(start); // unbalanced markup → take to end
}

/**
 * Convert a guest DETAIL response (jobPosting endpoint) into plain text for
 * Job.rawMarkdown. Isolates the JD body element (balanced scan above), falling
 * back to the whole fragment if absent. html-to-text decodes entities and
 * renders lists/line-breaks as readable text (better LLM input than raw HTML).
 */
export function extractJdText(detailHtml: string): string {
  const body = extractMarkupHtml(detailHtml) ?? detailHtml;
  const text = htmlToText(body, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  });
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export const linkedin: BoardAdapter = {
  id: BOARD_ID,
  displayName: "LinkedIn",
  parse: parseLinkedinSearch,
};
