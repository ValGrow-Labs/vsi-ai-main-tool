import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runKeywordsForClient, type TrackedKeyword } from "@/lib/run-pipeline";
import { LOCATIONS, type Location } from "@/types/search";
import { matchLocationOption } from "@/components/project-creation/location";

export const maxDuration = 300; // 5 min — accommodates a full batch
export const dynamic = "force-dynamic";

const FREQUENCY_HOURS: Record<string, number> = {
 manual: Infinity,
 daily: 22,
 every_3_days: 70,
 weekly: 167,
};

// Hard cap on keywords processed per tick (across all due clients).
// Tune via system_settings later if needed. Today's pilot scale is
// nowhere near this number.
const MAX_KEYWORDS_PER_TICK = 100;

interface DueClient {
 id: string;
 agency_id: string;
 name: string;
 check_frequency: string | null;
 last_auto_run_at: string | null;
 default_location?: string | null;
 country?: string | null;
 ai_mode_enabled: boolean | null;
 ai_overview_enabled: boolean | null;
 rank_tracking_enabled: boolean | null;
 chatgpt_enabled: boolean | null;
}

function isDue(client: DueClient): boolean {
 const freq = client.check_frequency ?? "manual";
 if (freq === "manual") return false;
 const hours = FREQUENCY_HOURS[freq];
 if (!Number.isFinite(hours)) return false;
 if (!client.last_auto_run_at) return true;
 const sinceMs = Date.now() - new Date(client.last_auto_run_at).getTime();
 return sinceMs >= hours * 3600 * 1000;
}

export async function POST(req: NextRequest) {
 // Auth: require Bearer CRON_SECRET
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret) {
 return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
 }
 const auth = req.headers.get("authorization") ?? "";
 if (auth !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const startedAt = new Date().toISOString();
 const supabase = await createClient();

 // Open a cron_runs log entry
 const { data: logRow } = await supabase
 .from("cron_runs")
 .insert({ started_at: startedAt })
 .select("id")
 .single();
 const cronRunId = logRow?.id as string | undefined;

 const errors: string[] = [];
 let clientsProcessed = 0;
 let keywordsProcessed = 0;

 try {
 // Pull every client with a non-manual frequency
 const { data: clients } = await supabase
 .from("clients")
 .select("id, agency_id, name, check_frequency, last_auto_run_at, default_location, country, ai_mode_enabled, ai_overview_enabled, rank_tracking_enabled, chatgpt_enabled")
 .neq("check_frequency", "manual")
 .order("last_auto_run_at", { ascending: true, nullsFirst: true });

 const dueClients = (clients ?? []).filter(isDue) as DueClient[];

 for (const client of dueClients) {
 if (keywordsProcessed >= MAX_KEYWORDS_PER_TICK) {
 errors.push(`Cap reached: stopped before client ${client.name}`);
 break;
 }

 const { data: kws } = await supabase
 .from("tracked_keywords")
 .select("id, keyword, domain, brand, location, track_type, client_id")
 .eq("client_id", client.id)
 .eq("is_active", true);

 const clientLocationMatch =
   (client.country ? matchLocationOption(client.country as string) : null) ||
   (client.default_location ? matchLocationOption(client.default_location as string) : null);
 const fallbackLocation: Location =
   (clientLocationMatch?.code && clientLocationMatch.code in LOCATIONS
     ? (clientLocationMatch.code as Location)
     : null) ||
   (client.default_location && (client.default_location as string) in LOCATIONS
     ? (client.default_location as Location)
     : "in");

 const keywords = ((kws ?? []) as TrackedKeyword[]).map((k) => ({
   ...k,
   location: (k.location && (k.location as string) in LOCATIONS ? k.location : fallbackLocation) as Location,
 }));
 if (keywords.length === 0) {
 // Nothing to do — still bump last_auto_run_at so we don't re-check immediately
 await supabase.from("clients").update({ last_auto_run_at: new Date().toISOString() }).eq("id", client.id);
 continue;
 }

 // Respect the global keyword cap
 const remaining = MAX_KEYWORDS_PER_TICK - keywordsProcessed;
 const toRun = keywords.slice(0, remaining);

 try {
 const result = await runKeywordsForClient({
 agencyId: client.agency_id,
 clientId: client.id,
 client: {
 ai_mode_enabled: client.ai_mode_enabled,
 ai_overview_enabled: client.ai_overview_enabled,
 rank_tracking_enabled: client.rank_tracking_enabled,
 chatgpt_enabled: client.chatgpt_enabled,
 },
 keywords: toRun,
 });
 keywordsProcessed += result.total;
 clientsProcessed += 1;

 if (result.failed > 0) {
 errors.push(`${client.name}: ${result.failed}/${result.total} keywords failed`);
 }

 await supabase
 .from("clients")
 .update({ last_auto_run_at: new Date().toISOString() })
 .eq("id", client.id);
 } catch (e) {
 errors.push(`${client.name}: ${e instanceof Error ? e.message : String(e)}`);
 }
 }

 if (cronRunId) {
 await supabase
 .from("cron_runs")
 .update({
 finished_at: new Date().toISOString(),
 clients_processed: clientsProcessed,
 keywords_processed: keywordsProcessed,
 errors: errors.length > 0 ? errors : null,
 })
 .eq("id", cronRunId);
 }

 return NextResponse.json({
 ok: true,
 clients_processed: clientsProcessed,
 keywords_processed: keywordsProcessed,
 errors,
 });
 } catch (err) {
 const errMsg = err instanceof Error ? err.message : String(err);
 if (cronRunId) {
 await supabase
 .from("cron_runs")
 .update({
 finished_at: new Date().toISOString(),
 clients_processed: clientsProcessed,
 keywords_processed: keywordsProcessed,
 errors: [...errors, `Fatal: ${errMsg}`],
 })
 .eq("id", cronRunId);
 }
 return NextResponse.json({ error: errMsg }, { status: 500 });
 }
}

// Some cron services prefer GET. Mirror to POST.
export const GET = POST;
