import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QA_SECTIONS } from "@/lib/qa-checklist";
import QALogin from "@/components/QALogin";
import QAChecklistAttributed from "@/components/QAChecklistAttributed";
import { QA_COOKIE, qaEnabled, verifyQaToken } from "@/lib/qa-session";

export const metadata: Metadata = {
 title: "VSI QA Checklist",
 robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const dynamic = "force-dynamic";

export default async function PublicQAPage() {
 // Internal testing aid: off unless VSI_QA_ENABLED=true (see lib/qa-session).
 if (!qaEnabled()) notFound();
 const c = await cookies();
 // The signed cookie names the tester; a forged, tampered or expired one is ignored.
 const testerId = verifyQaToken(c.get(QA_COOKIE)?.value);

 let tester: { id: string; name: string } | null = null;
 const savedChecks: Record<string, { status: string; notes: string | null; updated_at: string }> = {};

 if (testerId) {
 const supabase = await createClient();
 const { data: session } = await supabase.rpc("qa_get_session", { p_tester_id: testerId });
 const row = Array.isArray(session) ? session[0] : session;
 if (row?.id) {
 tester = { id: row.id, name: row.name };

 const { data: checks } = await supabase.rpc("qa_list_checks", { p_tester_id: testerId });
 for (const c of (checks ?? []) as { item_key: string; status: string; notes: string | null; updated_at: string }[]) {
 savedChecks[c.item_key] = { status: c.status, notes: c.notes, updated_at: c.updated_at };
 }
 }
 }

 const totalTests = QA_SECTIONS.reduce((acc, s) => acc + s.tests.length, 0);

 return (
 <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6">
 <div className="max-w-5xl mx-auto">
 <div className="mb-6">
 <h1 className="text-display font-semibold text-ink">VSI QA Checklist</h1>
 <p className="text-caption text-gray-500 mt-1">
 {QA_SECTIONS.length} sections · {totalTests} test cases. Sign in with your tester code; your saves attribute to you and persist server-side.
 </p>
 </div>

 {!tester ? (
 <QALogin />
 ) : (
 <QAChecklistAttributed
 sections={QA_SECTIONS}
 tester={tester}
 initialChecks={savedChecks}
 />
 )}
 </div>
 </div>
 );
}
