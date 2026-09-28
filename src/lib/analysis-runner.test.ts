import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => null }));

import { publicJobError } from "@/lib/analysis-runner";
import { ProviderUnavailableError } from "@/lib/provider-status";
import { PROVIDER_FAILURE_MESSAGES } from "@/lib/provider-response";

// Errors like these reach the runner's catch blocks; their text must never be stored in
// analysis_jobs / site_audits, because those rows are returned to the project's organization.
const RAW = [
  new Error("GET https://serpapi.com/search.json?q=x&api_key=sk_live_abc123 failed: 500 Internal Server Error"),
  new Error('duplicate key value violates unique constraint "analysis_jobs_one_running_per_client"'),
  new Error('relation "public.site_audits" does not exist'),
  Object.assign(new Error("connect ECONNREFUSED 10.0.0.12:5432"), { stack: "Error: connect ECONNREFUSED\n    at TCPConnectWrap.afterConnect" }),
  "a thrown string with a token=abc",
  null,
];

describe("publicJobError", () => {
  it("never returns the raw error text: only the caller's fixed fallback", () => {
    for (const err of RAW) {
      const text = publicJobError(err, "Website analysis failed.");
      expect(text).toBe("Website analysis failed.");
      expect(text).not.toMatch(/api_key|serpapi\.com|constraint|relation|ECONNREFUSED|5432|token|stack/i);
    }
  });

  it("a provider failure gets the standard provider message (no upstream detail)", () => {
    const err = new ProviderUnavailableError("serpapi", "PROVIDER_RATE_LIMITED", "429 from https://serpapi.com/search.json?api_key=secret");
    const text = publicJobError(err, "The checks couldn't be run.");
    expect(text).toBe(PROVIDER_FAILURE_MESSAGES.PROVIDER_RATE_LIMITED);
    expect(text).not.toMatch(/api_key|secret|serpapi\.com/);
  });

  it("the runner stores no raw err.message anywhere (source guard)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/analysis-runner.ts"), "utf8");
    expect(src).not.toMatch(/err instanceof Error \? err\.message/);
  });
});
