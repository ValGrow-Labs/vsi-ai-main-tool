import "server-only";
import { NextResponse } from "next/server";
import { requireSuperAdminApi, type SessionContext } from "@/lib/auth";

/**
 * Super-admin check for admin API routes (a wrapper over requireSuperAdminApi). Returns the
 * session, or a JSON 401/403 response to send back. Unlike requireSuperAdmin() it never
 * redirects, so fetch callers get a clear answer.
 */
export async function adminApiSession(): Promise<SessionContext | NextResponse> {
  const session = await requireSuperAdminApi();
  // Same 401 / 403 (account_disabled, forbidden) answers as every other API, as a NextResponse.
  if (session instanceof Response) return NextResponse.json(await session.json(), { status: session.status });
  return session;
}

/** Log a database error server-side and give the browser a plain message. */
export function adminDbError(context: string, error: { code?: string; message?: string } | null | undefined, status = 500): NextResponse {
  console.error(`[admin] ${context} failed`, { code: error?.code, message: error?.message });
  return NextResponse.json({ error: "That didn't work. Please try again." }, { status });
}

/** Log an unexpected error server-side and give the browser a plain message. */
export function adminUnexpected(context: string, e: unknown): NextResponse {
  console.error(`[admin] ${context} failed`, e instanceof Error ? e.message : e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
