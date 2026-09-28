import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi } from "@/lib/auth";
import { PROJECT_COOKIE, UUID_PATTERN } from "@/lib/project-types";

export const dynamic = "force-dynamic";

/** Switch the active project. The server checks access before storing it. */
export async function POST(req: NextRequest) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;

  let projectId: unknown;
  try {
    ({ projectId } = (await req.json()) as { projectId?: unknown });
  } catch {
    return NextResponse.json({ error: { code: "bad_request", message: "Invalid request." } }, { status: 400 });
  }
  if (typeof projectId !== "string" || !UUID_PATTERN.test(projectId)) {
    return NextResponse.json({ error: { code: "bad_request", message: "Choose a valid project." } }, { status: 400 });
  }

  const supabase = await createClient();
  let query = supabase.from("clients").select("id").eq("id", projectId);
  if (session.role !== "super_admin") query = query.eq("agency_id", session.agencyId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: { code: "not_found", message: "That project isn't available." } }, { status: 404 });
  }

  (await cookies()).set(PROJECT_COOKIE, projectId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.json({ ok: true });
}
