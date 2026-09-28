import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { DELETE } from "./[keywordId]/route";

const mockSession = {
  userId: "u1",
  role: "pilot",
  agencyId: "agency-1",
  agencyName: "Agency One",
  email: "pilot@example.com",
};

let projectRow: Record<string, unknown> | null = null;
let insertedRows: Record<string, unknown>[] = [];
let queryLog: string[] = [];
let insertError: { code?: string; message?: string } | null = null;
let deleteResult: unknown[] = [{ id: "kw-1" }];

vi.mock("@/lib/auth", () => ({
  requireAgencyApi: async () => mockSession,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {};

      builder.select = (_cols?: string) => {
        queryLog.push(`${table}.select`);
        return builder;
      };

      builder.eq = (col: string, val: string) => {
        queryLog.push(`${table}.eq(${col},${val})`);
        return builder;
      };

      builder.order = () => builder;

      builder.maybeSingle = async () => {
        queryLog.push(`${table}.maybeSingle`);
        return { data: projectRow, error: null };
      };

      builder.upsert = (rows: Record<string, unknown>[]) => {
        queryLog.push(`${table}.upsert(${rows.length})`);
        insertedRows = rows;
        return {
          select: () =>
            Promise.resolve({
              data: insertError ? null : rows.map((r, i) => ({ id: `kw-${i}`, ...r })),
              error: insertError,
            }),
        };
      };

      builder.delete = () => {
        queryLog.push(`${table}.delete`);
        const delBuilder: Record<string, unknown> = {};
        delBuilder.eq = (col: string, val: string) => {
          queryLog.push(`${table}.delete.eq(${col},${val})`);
          return delBuilder;
        };
        delBuilder.select = () => Promise.resolve({ data: deleteResult, error: null });
        return delBuilder;
      };

      builder.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: [{ id: "kw-1", keyword: "existing" }], error: null }).then(res);

      return builder;
    },
  }),
}));

describe("/api/projects/[id]/keywords route handlers", () => {
  const validId = "6cd70584-398c-4aa3-a9c7-813f90f375d2";

  beforeEach(() => {
    projectRow = {
      id: validId,
      agency_id: "agency-1",
      name: "Valgrowlabs",
      website: "valgrowlabs.com",
      brand_name: "Valgrowlabs",
      default_location: "ae",
    };
    insertedRows = [];
    queryLog = [];
    insertError = null;
    deleteResult = [{ id: "kw-1" }];
  });

  it("POST rejects invalid UUID", async () => {
    const req = new NextRequest("http://localhost/api/projects/not-a-uuid/keywords", {
      method: "POST",
      body: JSON.stringify({ searches: [{ keyword: "test" }] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
  });

  it("POST rejects empty searches array", async () => {
    const req = new NextRequest(`http://localhost/api/projects/${validId}/keywords`, {
      method: "POST",
      body: JSON.stringify({ searches: [] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(400);
  });

  it("POST 404s when project does not exist or belongs to another agency", async () => {
    projectRow = null;
    const req = new NextRequest(`http://localhost/api/projects/${validId}/keywords`, {
      method: "POST",
      body: JSON.stringify({ searches: [{ keyword: "seo dubai" }] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(404);
  });

  it("POST normalizes searches, deduplicates, and saves with 201", async () => {
    const req = new NextRequest(`http://localhost/api/projects/${validId}/keywords`, {
      method: "POST",
      body: JSON.stringify({
        searches: [
          { keyword: "  best e-commerce & online services in dubai  ", trackType: "both" },
          { keyword: "best e-commerce & online services in dubai", trackType: "both" }, // duplicate in payload
          { keyword: "professional e-commerce & online services experts dubai", trackType: "both" },
        ],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2);
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0].keyword).toBe("best e-commerce & online services in dubai");
    expect(insertedRows[0].client_id).toBe(validId);
    expect(insertedRows[0].agency_id).toBe("agency-1");
    expect(insertedRows[0].domain).toBe("valgrowlabs.com");
    expect(insertedRows[0].location).toBe("ae");
    expect(insertedRows[1].keyword).toBe("professional e-commerce & online services experts dubai");
  });

  it("POST handles keyword limit database trigger gracefully", async () => {
    insertError = { message: "Keyword limit reached for this agency (10 of 10)" };
    const req = new NextRequest(`http://localhost/api/projects/${validId}/keywords`, {
      method: "POST",
      body: JSON.stringify({ searches: [{ keyword: "test search" }] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("keyword_limit");
    expect(body.error.message).toBe("Keyword limit reached for this agency.");
  });

  it("GET returns tracked searches for valid project", async () => {
    const req = new NextRequest(`http://localhost/api/projects/${validId}/keywords`);
    const res = await GET(req, { params: Promise.resolve({ id: validId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.searches).toHaveLength(1);
  });

  it("DELETE removes tracked search", async () => {
    const req = new NextRequest(`http://localhost/api/projects/${validId}/keywords/kw-1`, {
      method: "DELETE",
    });
    const res = await DELETE(req, {
      params: Promise.resolve({ id: validId, keywordId: "5eed0000-0000-4000-8000-000000000001" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
