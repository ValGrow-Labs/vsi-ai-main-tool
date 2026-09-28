import type { Finding } from "@/lib/findings";
import { TASK_SOURCE_LABEL } from "@/lib/task-payload";
import type { GeoSummary, TrackedSearch } from "@/lib/geo";
import { plural } from "@/lib/format";

function keywordAffected(searches: TrackedSearch[], clientId: string) {
  return searches.slice(0, 15).map((s) => ({
    label: s.keyword,
    href: s.keywordId ? `/dashboard/clients/${clientId}/keywords/${s.keywordId}` : undefined,
    note: s.competitorsLinked.length ? `AI links to ${s.competitorsLinked.slice(0, 3).join(", ")}` : undefined,
  }));
}

/** Minimal shape of a page comparison from the citation strategy (see site-audit/load). */
export interface PageGap {
  keywordId: string | null;
  keyword: string;
  url: string;
  weaknesses: string[];
  pageChanges: string[];
}

/**
 * The bridge between AI Visibility and Site Audit: pages VSI compared with
 * the pages AI answers quote, where it found gaps.
 */
export function pageClarityFinding(pagesWithGaps: PageGap[], clientId: string): Finding | null {
  if (pagesWithGaps.length === 0) return null;
  const n = pagesWithGaps.length;
  const title = "Some pages could answer customer questions more clearly";
  const found =
    n === 1
      ? "VSI compared one of your pages with the pages AI answers quote, and found gaps."
      : `VSI compared ${n} of your pages with the pages AI answers quote, and found gaps in each.`;
  const why = "AI systems may have difficulty using these pages to answer customer questions, so they quote other sites instead.";
  const todo = "Improve the answer sections on these pages: answer the question directly near the top, then add the details the quoted pages include.";
  const changes = [...new Set(pagesWithGaps.flatMap((p) => p.pageChanges))].slice(0, 6);
  return {
    key: "geo:page_clarity",
    source: "geo",
    sourceLabel: TASK_SOURCE_LABEL.geo,
    href: "/dashboard/check",
    title,
    tone: "attention",
    statusText: "Could be improved",
    priority: 50,
    whatWeFound: found,
    whyItMatters: why,
    whatToDo: todo,
    affected: pagesWithGaps.map((p) => ({
      label: p.url.replace(/^https?:\/\//, ""),
      href: p.url,
      external: true,
      note: `${p.weaknesses[0] ?? ""} (for "${p.keyword}")`,
    })),
    technical: [{ label: "Source", value: "Citation strategy: client page audit compared with cited pages" }],
    draft: {
      clientId,
      source: "geo",
      findingKey: "page_clarity",
      title: n === 1 ? `Improve the answer section on ${pagesWithGaps[0].url.replace(/^https?:\/\//, "")}` : "Improve answer sections on key pages",
      whatWeFound: found,
      whyItMatters: why,
      whatToDo: todo,
      group: "Content",
      owner: "Writer",
      impact: "medium",
      effort: "M",
      trackedKeywordId: n === 1 ? pagesWithGaps[0].keywordId : null,
      affected: pagesWithGaps.map((p) => p.url),
      acceptance: changes.length ? changes : ["The page answers the customer's question in its first paragraph"],
    },
  };
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Turn the AI Visibility summary into actionable findings.
 * Each one maps to a task in the shared task system. When a finding concerns
 * a single search, the task is linked to it so the next check verifies it.
 */
/**
 * `tracked` holds the competitor domains the user added to the project;
 * those are named first and raise the finding's priority.
 */
export function geoFindings(s: GeoSummary, clientId: string, tracked: string[] = []): Finding[] {
  const out: Finding[] = [];
  const base = { source: "geo" as const, sourceLabel: TASK_SOURCE_LABEL.geo, href: "/dashboard/geo" };

  // 1. AI answers that don't mention you at all
  const missing = s.searches.filter((x) => x.answered && !x.appears);
  if (missing.length > 0) {
    const title = "AI answers don't mention your business";
    const found = `${plural(missing.length, "search", "searches")} you track ${missing.length === 1 ? "gets" : "get"} an AI answer that doesn't mention you.`;
    const why = "People asking these questions are being pointed to other businesses instead of yours.";
    const todo =
      "For each search, make sure one page on your site answers that exact question in its first paragraph, with your business name next to the answer. Then add facts AI can quote: prices, locations, results, credentials.";
    out.push({
      ...base,
      key: "geo:not_mentioned",
      title,
      tone: "critical",
      statusText: "Needs attention",
      priority: Math.min(95, 60 + missing.length * 4),
      whatWeFound: found,
      whyItMatters: why,
      whatToDo: todo,
      affected: keywordAffected(missing, clientId),
      technical: [
        { label: "Status", value: "AI answer present, brand neither named nor linked" },
        { label: "Status codes", value: [...new Set(missing.map((m) => m.states.google_ai_overview))].join(", ") },
      ],
      draft: {
        clientId,
        source: "geo",
        findingKey: "not_mentioned",
        title: missing.length === 1 ? `Get mentioned in AI answers for "${missing[0].keyword}"` : title,
        whatWeFound: found,
        whyItMatters: why,
        whatToDo: todo,
        group: "Content",
        owner: "Writer",
        impact: "high",
        effort: "M",
        trackedKeywordId: missing.length === 1 ? missing[0].keywordId : null,
        affected: missing.map((m) => m.keyword),
        acceptance: ["Your business is named or linked in the AI answer on the next check"],
      },
    });
  }

  // 2. Linked as a source, but the brand isn't named
  const linkedOnly = s.searches.filter((x) => Object.values(x.states).includes("linked") && !Object.values(x.states).some((st) => st === "named" || st === "named_and_linked"));
  if (linkedOnly.length > 0) {
    const title = "AI uses your pages but doesn't say your name";
    const found = `In ${plural(linkedOnly.length, "search", "searches")}, AI answers link to your website but never name your business.`;
    const why = "Readers take the answer without knowing it came from you, so you get little recognition for being the source.";
    const todo =
      "Put your business name in the first lines of these pages, next to the key facts. Use your name in page titles, and make sure your About page clearly says who you are and what you do.";
    out.push({
      ...base,
      key: "geo:linked_not_named",
      title,
      tone: "attention",
      statusText: "Could be improved",
      priority: 45,
      whatWeFound: found,
      whyItMatters: why,
      whatToDo: todo,
      affected: keywordAffected(linkedOnly, clientId),
      technical: [{ label: "Status", value: "Cited as a source, brand not in the answer text (geo_cited_no_mention / aligned_no_mention)" }],
      draft: {
        clientId,
        source: "geo",
        findingKey: "linked_not_named",
        title: linkedOnly.length === 1 ? `Get your name into the AI answer for "${linkedOnly[0].keyword}"` : title,
        whatWeFound: found,
        whyItMatters: why,
        whatToDo: todo,
        group: "Content",
        owner: "Writer",
        impact: "medium",
        effort: "S",
        trackedKeywordId: linkedOnly.length === 1 ? linkedOnly[0].keywordId : null,
        affected: linkedOnly.map((m) => m.keyword),
        acceptance: ["Your business is named in the AI answer on the next check"],
      },
    });
  }

  // 3. Competitors linked where you are not
  const isTracked = (d: string) => tracked.some((t) => d === t || d.endsWith(`.${t}`));
  const gapAll = s.competitors.filter((c) => c.gapSearches > 0);
  const gapCompetitors = [...gapAll.filter((c) => isTracked(c.domain)), ...gapAll.filter((c) => !isTracked(c.domain))].slice(0, 3);
  const anyTracked = gapCompetitors.some((c) => isTracked(c.domain));
  if (gapCompetitors.length > 0) {
    const names = gapCompetitors.map((c) => c.domain);
    const gapSearches = s.searches.filter((x) => x.answered && x.competitorsLinked.some((d) => names.includes(d)) && !Object.values(x.states).some((st) => st === "linked" || st === "named_and_linked"));
    const title = anyTracked ? "Competitors you track are linked in AI answers instead of you" : "Competitors are linked in AI answers instead of you";
    const found = `AI answers link to ${listNames(names)} in ${plural(gapSearches.length, "search", "searches")} where your website isn't linked.`;
    const why = "Every link AI gives a competitor is a customer who may visit them first.";
    const todo =
      "Open the competitor pages AI links to for each search. Compare them with your page on the same topic, then cover what they cover and add something they don't: your own examples, data or clearer answers.";
    out.push({
      ...base,
      key: "geo:competitors_linked",
      title,
      tone: "attention",
      statusText: "Needs attention",
      priority: Math.min(anyTracked ? 88 : 80, 50 + gapSearches.length * 3 + (anyTracked ? 8 : 0)),
      whatWeFound: found,
      whyItMatters: why,
      whatToDo: todo,
      affected: keywordAffected(gapSearches, clientId),
      technical: gapCompetitors.map((c) => ({ label: c.domain, value: `Linked in ${c.answers} answers, ${c.gapSearches} where you aren't` })),
      href: "/dashboard/competitors",
      draft: {
        clientId,
        source: "geo",
        findingKey: "competitors_linked",
        title,
        whatWeFound: found,
        whyItMatters: why,
        whatToDo: todo,
        group: "Content",
        owner: "SEO",
        impact: "medium",
        effort: "M",
        affected: gapSearches.map((m) => m.keyword),
        acceptance: ["Your website is linked in the AI answer for these searches on the next check"],
      },
    });
  }

  // 4. Platforms AI relies on
  const platforms = s.platforms.slice(0, 4);
  if (platforms.length > 0 && s.appears < s.answered) {
    const names = platforms.map((p) => p.name);
    const title = "AI relies on sites where you could be mentioned";
    const found = `AI answers for your searches often quote ${listNames(names)}.`;
    const why = "AI assistants trust these sites. When people discuss or review your business there, AI is more likely to mention you.";
    const todo = `Build a presence on ${listNames(names)}: keep your profiles complete, ask happy customers for reviews, and join relevant discussions where your expertise helps.`;
    out.push({
      ...base,
      key: "geo:platforms",
      title,
      tone: "info",
      statusText: "Opportunity",
      priority: 30,
      whatWeFound: found,
      whyItMatters: why,
      whatToDo: todo,
      affected: platforms.map((p) => ({ label: p.name, note: `Quoted in ${plural(p.answers, "answer")}` })),
      technical: [{ label: "Source", value: "Cited domains classified as community, review or reference platforms" }],
      draft: {
        clientId,
        source: "geo",
        findingKey: "platforms",
        title: `Get mentioned on ${listNames(names)}`,
        whatWeFound: found,
        whyItMatters: why,
        whatToDo: todo,
        group: "Off-page",
        owner: "Outreach",
        impact: "medium",
        effort: "L",
        affected: names,
      },
    });
  }

  // 5. ChatGPT confuses the business with another one
  if (s.entity && s.entity.recognised < s.entity.checked) {
    const wrong = s.entity.checked - s.entity.recognised;
    const title = "ChatGPT may be confusing you with another business";
    const found = `In ${plural(wrong, "answer")}, ChatGPT described a different business with a similar name.`;
    const why = "If AI mixes you up with someone else, customers get the wrong information about you.";
    const todo =
      "Make your name, location and what you do unmistakable: the same business name everywhere, a clear About page, and complete profiles on Google Business, LinkedIn and industry directories.";
    out.push({
      ...base,
      key: "geo:entity",
      title,
      tone: "critical",
      statusText: "Needs attention",
      priority: 75,
      whatWeFound: found,
      whyItMatters: why,
      whatToDo: todo,
      affected: [],
      technical: [{ label: "Check", value: `chatgpt_entity_match false in ${wrong} of ${s.entity.checked} checks` }],
      draft: {
        clientId,
        source: "geo",
        findingKey: "entity",
        title,
        whatWeFound: found,
        whyItMatters: why,
        whatToDo: todo,
        group: "Content",
        owner: "SEO",
        impact: "high",
        effort: "M",
      },
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}
