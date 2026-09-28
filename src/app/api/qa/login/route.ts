import { apiServerError } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  QA_COOKIE,
  clientKey,
  isPlausibleQaCode,
  qaCookieOptions,
  qaEnabled,
  qaLoginLimiter,
  qaNotFound,
  signQaToken,
} from "@/lib/qa-session";

export const dynamic = "force-dynamic";

const TOO_MANY = { error: "Too many attempts. Wait 15 minutes and try again." };
const UNKNOWN_CODE = { error: "Unknown code" };

/** QA tester sign-in. Off (404) unless VSI_QA_ENABLED=true and QA_COOKIE_SECRET is set. */
export async function POST(req: NextRequest) {
  if (!qaEnabled()) return qaNotFound();
  const key = clientKey(req.headers);
  if (!qaLoginLimiter.allowed(key)) {
    return NextResponse.json(TOO_MANY, { status: 429, headers: { "Retry-After": "900" } });
  }
  try {
    const body = (await req.json()) as { code?: unknown };
    if (!body || typeof body.code !== "string" || !body.code.trim()) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }
    if (!isPlausibleQaCode(body.code)) {
      qaLoginLimiter.recordFailure(key);
      return NextResponse.json(UNKNOWN_CODE, { status: 401 });
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("qa_login", { p_code: body.code.trim() });
    if (error) return apiServerError("qa/login", error);
    const row = (Array.isArray(data) ? data[0] : data) as { id?: string; name?: string } | null;
    if (!row?.id) {
      qaLoginLimiter.recordFailure(key);
      return NextResponse.json(UNKNOWN_CODE, { status: 401 });
    }

    const res = NextResponse.json({ tester: { id: row.id, name: row.name } });
    // A signed, expiring token (not the bare tester id), httpOnly so page scripts can't read it.
    res.cookies.set(QA_COOKIE, signQaToken(row.id), qaCookieOptions);
    return res;
  } catch (e) {
    return apiServerError("qa/login", e);
  }
}

export async function DELETE() {
  if (!qaEnabled()) return qaNotFound();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(QA_COOKIE);
  return res;
}
