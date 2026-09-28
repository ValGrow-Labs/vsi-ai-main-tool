import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Scheduled checks are not available (nothing runs them), so a project cannot be given a
// daily/weekly schedule, and the settings UI no longer offers one.
const PROJECT = "11111111-1111-4111-8111-111111111111";
const state: { updates: Record<string, unknown>[] } = { updates: [] };

vi.mock("@/lib/auth", () => ({
  requireAgencyApi: async () => ({ userId: "u1", agencyId: "a1", role: "pilot" }),
  apiServerError: () => Response.json({ error: "Something went wrong. Please try again." }, { status: 500 }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const b: Record<string, unknown> = {};
      b.update = (payload: Record<string, unknown>) => {
        state.updates.push(payload);
        return b;
      };
      b.eq = () => b;
      b.select = () => Promise.resolve({ data: [{ id: PROJECT }], error: null });
      return b;
    },
  }),
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new NextRequest(`http://x/api/clients/${PROJECT}/settings`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), {
    params: Promise.resolve({ id: PROJECT }),
  });

beforeEach(() => {
  state.updates = [];
});

describe("POST /api/clients/[id]/settings: no scheduled checks", () => {
  it.each(["daily", "every_3_days", "weekly", "hourly", null, 1])("check_frequency=%s is refused and nothing is saved", async (value) => {
    const res = await post({ check_frequency: value, location_override: "Dubai" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Scheduled checks aren't available yet/);
    expect(state.updates).toEqual([]);
  });

  it("manual is still accepted (it is what every project runs as)", async () => {
    const res = await post({ check_frequency: "manual" });
    expect(res.status).toBe(200);
    expect(state.updates).toEqual([{ check_frequency: "manual" }]);
  });

  it("other settings save as before, without a schedule", async () => {
    const res = await post({ location_override: "Dubai", brief_model_override: null });
    expect(res.status).toBe(200);
    expect(state.updates).toEqual([{ location_override: "Dubai", brief_model_override: null }]);
  });
});

describe("no customer-facing schedule promise", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

  it("the project settings form offers no daily/weekly schedule and does not send one", () => {
    const form = read("src/features/clients/components/ClientSettingsForm.tsx");
    expect(form).not.toMatch(/check_frequency|Daily automated scan|Weekly audit|audit keywords and citations automatically/);
    expect(form).toMatch(/Scheduled checks aren&apos;t available yet/);
  });

  it("the admin settings no longer offer a default schedule for new projects", () => {
    expect(read("src/components/admin/SettingsToggles.tsx")).not.toMatch(/default_check_frequency|schedule cron uses/);
  });
});
