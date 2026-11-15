import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { DELETE, GET } from "./route";

let mockSession: unknown = {
  userId: "u1",
  role: "pilot",
  agencyId: "agency-1",
  agencyName: "Agency One",
  email: "pilot@example.com",
};

let projectRow: Record<string, unknown> | null = null;
let queryLog: string[] = [];
const deletedTables: string[] = [];
let cookieDeleted = false;
let currentCookieVal: string | undefined = "6cd70584-398c-4aa3-a9c7-813f90f375d2";

vi.mock("@/lib/auth", () => ({
  requireAgencyApi: async () => mockSession,
  apiServerError: (_ctx: string, err: unknown) =>
    NextResponse.json({ error: { code: "server_error", message: String(err) } }, { status: 500 }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "vsi_project" && currentCookieVal ? { value: currentCookieVal } : undefined),
    delete: (name: string) => {
      if (name === "vsi_project") cookieDeleted = true;
    },
  }),
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

      builder.maybeSingle = async () => {
        queryLog.push(`${table}.maybeSingle`);
        return { data: projectRow, error: null };
      };

      builder.delete = () => {
        queryLog.push(`${table}.delete`);
        deletedTables.push(table);
        const delBuilder: Record<string, unknown> = {};
        delBuilder.eq = (col: string, val: string) => {
          queryLog.push(`${table}.delete.eq(${col},${val})`);
          return delBuilder;
        };
        // Allow await delQuery
        delBuilder.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
        return delBuilder;
      };

      return builder;
    },
  }),
}));

describe("/api/projects/[id] route handlers", () => {
  const validId = "6cd70584-398c-4aa3-a9c7-813f90f375d2";

  beforeEach(() => {
    mockSession = {
      userId: "u1",
      role: "pilot",
      agencyId: "agency-1",
      agencyName: "Agency One",
      email: "pilot@example.com",
    };
    projectRow = {
      id: validId,
      agency_id: "agency-1",
      name: "Valgrowlabs",
      website: "valgrowlabs.com",
    };
    queryLog = [];
    deletedTables.length = 0;
    cookieDeleted = false;
    currentCookieVal = validId;
  });

  describe("DELETE", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession = NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
      const req = new NextRequest(`http://localhost/api/projects/${validId}`, { method: "DELETE" });
      const res = await DELETE(req, { params: Promise.resolve({ id: validId }) });
      expect(res.status).toBe(401);
    });

    it("rejects non-UUID project id with 400", async () => {
      const req = new NextRequest("http://localhost/api/projects/not-a-uuid", { method: "DELETE" });
      const res = await DELETE(req, { params: Promise.resolve({ id: "not-a-uuid" }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("bad_request");
    });

    it("returns 404 if project does not exist or belongs to another agency", async () => {
      projectRow = null;
      const req = new NextRequest(`http://localhost/api/projects/${validId}`, { method: "DELETE" });
      const res = await DELETE(req, { params: Promise.resolve({ id: validId }) });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe("not_found");
    });

    it("successfully deletes project, related records, and clears active cookie", async () => {
      const req = new NextRequest(`http://localhost/api/projects/${validId}`, { method: "DELETE" });
      const res = await DELETE(req, { params: Promise.resolve({ id: validId }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.deletedId).toBe(validId);
      expect(json.name).toBe("Valgrowlabs");

      // Verify related tables were cleared
      expect(deletedTables).toContain("search_results");
      expect(deletedTables).toContain("tracked_keywords");
      expect(deletedTables).toContain("tasks");
      expect(deletedTables).toContain("reports");
      expect(deletedTables).toContain("site_audits");
      expect(deletedTables).toContain("project_competitors");
      expect(deletedTables).toContain("clients");

      // Verify active cookie was deleted
      expect(cookieDeleted).toBe(true);
    });

    it("does not delete cookie if deleted project was not the active project", async () => {
      currentCookieVal = "different-active-project-id";
      const req = new NextRequest(`http://localhost/api/projects/${validId}`, { method: "DELETE" });
      const res = await DELETE(req, { params: Promise.resolve({ id: validId }) });
      expect(res.status).toBe(200);
      expect(cookieDeleted).toBe(false);
    });
  });

  describe("GET", () => {
    it("returns 400 on invalid UUID", async () => {
      const req = new NextRequest("http://localhost/api/projects/invalid-id");
      const res = await GET(req, { params: Promise.resolve({ id: "invalid-id" }) });
      expect(res.status).toBe(400);
    });

    it("returns 404 when project not found", async () => {
      projectRow = null;
      const req = new NextRequest(`http://localhost/api/projects/${validId}`);
      const res = await GET(req, { params: Promise.resolve({ id: validId }) });
      expect(res.status).toBe(404);
    });

    it("returns project data when found", async () => {
      const req = new NextRequest(`http://localhost/api/projects/${validId}`);
      const res = await GET(req, { params: Promise.resolve({ id: validId }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.project.name).toBe("Valgrowlabs");
    });
  });
});
