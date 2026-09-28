import { apiServerError } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { QA_COOKIE, qaEnabled, qaNotFound, verifyQaToken } from "@/lib/qa-session";
import { QA_SECTIONS } from "@/lib/qa-checklist";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["todo", "pass", "fail", "skipped"]);
const ITEM_KEYS = new Set(QA_SECTIONS.flatMap((s) => s.tests.map((t) => t.id)));
const MAX_NOTES = 4000;

/**
 * Save one checklist result for the signed-in tester. The tester is whoever the signed cookie says;
 * nothing in the body can name another tester. Only the qa_checks row for (tester, item) is written.
 */
export async function POST(req: NextRequest) {
  if (!qaEnabled()) return qaNotFound();
  try {
    const c = await cookies();
    const testerId = verifyQaToken(c.get(QA_COOKIE)?.value);
    if (!testerId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const { item_key, status, notes } = (await req.json()) as {
      item_key?: unknown; status?: unknown; notes?: unknown;
    };
    if (typeof item_key !== "string" || typeof status !== "string" || !item_key || !status) {
      return NextResponse.json({ error: "item_key and status required" }, { status: 400 });
    }
    if (!ITEM_KEYS.has(item_key) || !STATUSES.has(status)) {
      return NextResponse.json({ error: "Unknown checklist item or status" }, { status: 400 });
    }
    if (notes != null && (typeof notes !== "string" || notes.length > MAX_NOTES)) {
      return NextResponse.json({ error: "Notes are too long" }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("qa_save_check", {
      p_tester_id: testerId,
      p_item_key: item_key,
      p_status: status,
      p_notes: (notes as string | null | undefined) ?? null,
    });
    if (error) return apiServerError("qa/check", error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiServerError("qa/check", e);
  }
}
