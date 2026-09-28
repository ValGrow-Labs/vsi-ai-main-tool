import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import {
  createResearchController,
  markResearchIntent,
  RESEARCH_INTENT_MAX_AGE_MS,
  takeResearchIntent,
  type ResearchResponse,
  type ResearchState,
} from "./research-request";

/** A per-tab sessionStorage stand-in. */
function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

const OK: ResearchResponse = {
  success: true,
  keyword: "plumber dubai",
  location: "United Arab Emirates",
  liveResultsAvailable: true,
  liveResultsNote: null,
  intent: { primary: "Local service", description: "Looking for a plumber nearby." },
  prompts: ["best plumber in dubai"],
  topOrganicResults: [{ position: 1, title: "Acme Plumbing", link: "https://acme.example/" }],
};

function fetchReturning(body: unknown, status = 200) {
  return vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

/** Mounts the results view's logic the way the component does, recording its states. */
function mountView(opts: { fetch: ReturnType<typeof fetchReturning>; storage: ReturnType<typeof memoryStorage> | null; query?: string; location?: string; now?: () => number }) {
  const states: ResearchState[] = [{ kind: "idle" }];
  const c = createResearchController({
    fetch: opts.fetch,
    storage: opts.storage,
    query: opts.query ?? "plumber dubai",
    location: opts.location ?? "United Arab Emirates",
    onState: (s) => states.push(s),
    now: opts.now,
  });
  return { c, states, last: () => states[states.length - 1] };
}

const researchCalls = (f: ReturnType<typeof fetchReturning>) => f.mock.calls.filter(([url]) => url === "/api/research");

describe("keyword research: opening the page never spends a lookup", () => {
  it("1. mounting /dashboard?q=… (bookmark, shared link, new tab) does not call /api/research", async () => {
    const f = fetchReturning(OK);
    const v = mountView({ fetch: f, storage: memoryStorage() });
    await v.c.mount();
    expect(f).not.toHaveBeenCalled();
    expect(v.last()).toEqual({ kind: "idle" });
  });

  it("2. a refresh (or back/forward) after a lookup does not call /api/research again", async () => {
    const storage = memoryStorage();
    const f = fetchReturning(OK);
    markResearchIntent(storage, "plumber dubai", "United Arab Emirates");
    await mountView({ fetch: f, storage }).c.mount(); // the submit's own navigation
    expect(researchCalls(f)).toHaveLength(1);

    const reload = mountView({ fetch: f, storage });
    await reload.c.mount();
    await mountView({ fetch: f, storage }).c.mount(); // and once more
    expect(researchCalls(f)).toHaveLength(1);
    expect(reload.last()).toEqual({ kind: "idle" });
  });

  it("React strict-mode double mount still makes one lookup", async () => {
    const storage = memoryStorage();
    const f = fetchReturning(OK);
    markResearchIntent(storage, "plumber dubai", "United Arab Emirates");
    const v = mountView({ fetch: f, storage });
    await Promise.all([v.c.mount(), v.c.mount()]);
    expect(researchCalls(f)).toHaveLength(1);
  });

  it("an intent for another search, a stale intent, or no storage at all → no lookup", async () => {
    const f = fetchReturning(OK);
    const s1 = memoryStorage();
    markResearchIntent(s1, "something else", "United Arab Emirates");
    await mountView({ fetch: f, storage: s1 }).c.mount();

    const s2 = memoryStorage();
    markResearchIntent(s2, "plumber dubai", "United Arab Emirates", 1_000);
    await mountView({ fetch: f, storage: s2, now: () => 1_000 + RESEARCH_INTENT_MAX_AGE_MS + 1 }).c.mount();

    await mountView({ fetch: f, storage: null }).c.mount();
    expect(f).not.toHaveBeenCalled();
  });

  it("the intent is one-time and cannot come from a URL", () => {
    const s = memoryStorage();
    markResearchIntent(s, "q", "L");
    expect(takeResearchIntent(s, "q", "L")).toBe(true);
    expect(takeResearchIntent(s, "q", "L")).toBe(false);
    s.setItem("vsi:research-intent", "not json");
    expect(takeResearchIntent(s, "q", "L")).toBe(false);
  });
});

describe("keyword research: explicit actions do look up", () => {
  it("4. submitting the lookup form (intent) → exactly one POST /api/research with the search", async () => {
    const storage = memoryStorage();
    const f = fetchReturning(OK);
    markResearchIntent(storage, "plumber dubai", "United Arab Emirates");
    const v = mountView({ fetch: f, storage });
    await v.c.mount();
    expect(researchCalls(f)).toHaveLength(1);
    const [, init] = f.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ keyword: "plumber dubai", location: "United Arab Emirates", language: "English" });
  });

  it("4. the \"Look up live results\" button → one POST, even when clicked twice quickly", async () => {
    const f = fetchReturning(OK);
    const v = mountView({ fetch: f, storage: memoryStorage() });
    await v.c.mount();
    expect(f).not.toHaveBeenCalled();
    await Promise.all([v.c.run(), v.c.run()]);
    expect(researchCalls(f)).toHaveLength(1);
  });

  it("5. results still render: idle → loading → ok with the response data", async () => {
    const v = mountView({ fetch: fetchReturning(OK), storage: memoryStorage() });
    await v.c.run();
    expect(v.states.map((s) => s.kind)).toEqual(["idle", "loading", "ok"]);
    expect(v.last()).toEqual({ kind: "ok", data: OK });
  });

  it("6. provider unavailable: the route's 503 message is shown, and live-results-unavailable still renders as data", async () => {
    const v = mountView({ fetch: fetchReturning({ success: false, status: "SEARCH_UNAVAILABLE", error: "The search provider isn't configured for this workspace yet." }, 503), storage: memoryStorage() });
    await v.c.run();
    expect(v.last()).toEqual({ kind: "error", message: "The search provider isn't configured for this workspace yet." });

    const noLive = { ...OK, liveResultsAvailable: false, liveResultsNote: "Live results aren't available right now.", topOrganicResults: [] };
    const w = mountView({ fetch: fetchReturning(noLive), storage: memoryStorage() });
    await w.c.run();
    expect(w.last()).toEqual({ kind: "ok", data: noLive });
  });

  it("a network failure is an error state, not a crash", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const v = mountView({ fetch: f as unknown as ReturnType<typeof fetchReturning>, storage: memoryStorage() });
    await v.c.run();
    expect(v.last()).toMatchObject({ kind: "error" });
  });
});

describe("keyword research: wiring (source guards)", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

  it("only research-request.ts calls /api/research from the browser", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && fs.readFileSync(p, "utf8").includes('"/api/research"'))
          hits.push(path.relative(process.cwd(), p).replace(/\\/g, "/"));
      }
    };
    walk(path.join(process.cwd(), "src"));
    expect(hits).toEqual(["src/lib/research-request.ts"]);
  });

  it("the results view starts idle and runs only through the controller", () => {
    const view = read("src/features/visibility/components/KeywordResearchView.tsx");
    expect(view).toContain('useState<ResearchState>({ kind: "idle" })');
    expect(view).not.toMatch(/fetch\(\s*["'`]\/api\/research/);
  });
});
