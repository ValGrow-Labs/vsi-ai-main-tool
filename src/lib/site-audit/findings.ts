import type { Finding } from "@/lib/findings";
import { TASK_SOURCE_LABEL } from "@/lib/task-payload";
import { CHECK_COPY, checkEvidence, checkHeadline } from "./copy";
import type { CheckResult } from "./types";

const IMPACT_WEIGHT = { high: 3, medium: 2, low: 1 } as const;

/** Urgency 0–100 for ranking against findings from other modules. */
export function auditPriority(c: CheckResult): number {
  if (c.status === "pass" || c.status === "not_checked") return 0;
  const base = c.status === "fail" ? 45 : 15;
  return Math.min(100, base + IMPACT_WEIGHT[c.impact] * (c.status === "fail" ? 15 : 8));
}

function technicalRows(c: CheckResult): { label: string; value: string }[] {
  const rows = [{ label: "Check", value: CHECK_COPY[c.id].technical }];
  if (c.total) rows.push({ label: "Checked", value: String(c.total) });
  for (const [k, v] of Object.entries(c.detail)) {
    if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    rows.push({ label: k.replace(/([A-Z])/g, " $1").toLowerCase(), value: Array.isArray(v) ? v.join("\n") : String(v) });
  }
  return rows;
}

export function auditFinding(c: CheckResult, clientId: string): Finding {
  const copy = CHECK_COPY[c.id];
  const title = checkHeadline(c);
  const isUrl = (s: string) => /^https?:\/\//.test(s);
  return {
    key: `site_audit:${c.id}`,
    source: "site_audit",
    sourceLabel: TASK_SOURCE_LABEL.site_audit,
    title,
    tone: c.status === "pass" ? "positive" : c.status === "not_checked" ? "neutral" : c.status === "fail" ? "critical" : "attention",
    statusText:
      c.status === "pass" ? "Looks good" : c.status === "not_checked" ? "Not checked" : c.status === "fail" ? "Needs fixing" : "Could be improved",
    priority: auditPriority(c),
    whatWeFound: checkEvidence(c) || `${title}.`,
    whyItMatters: copy.why,
    whatToDo: c.status === "not_checked" ? "Nothing to fix from this check yet. Once the reason above is resolved, run the audit again." : copy.todo(c),
    affected: c.affected.map((a) => (isUrl(a) ? { label: a.replace(/^https?:\/\//, ""), href: a, external: true } : { label: a })),
    technical: technicalRows(c),
    href: "/dashboard/check",
    // Only real problems become tasks: a check that couldn't run is not a Next Action.
    draft:
      c.status === "pass" || c.status === "not_checked"
        ? null
        : {
            clientId,
            source: "site_audit",
            findingKey: c.id,
            title,
            whatWeFound: `${title}. ${checkEvidence(c)}`.trim(),
            whyItMatters: copy.why,
            whatToDo: copy.todo(c),
            group: copy.taskGroup,
            owner: copy.owner,
            impact: c.impact,
            effort: copy.taskGroup === "Technical" ? "S" : "M",
            affected: c.affected,
            acceptance: ["The next Site Audit no longer reports this problem"],
          },
  };
}
