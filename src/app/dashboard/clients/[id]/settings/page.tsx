import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAgency } from "@/lib/auth";
import ClientSettingsForm from "@/components/ClientSettingsForm";
import ClientIdentityForm from "@/components/ClientIdentityForm";
import { ArrowLeft, Settings } from "lucide-react";

export default async function ClientSettingsPage({
 params,
}: {
 params: Promise<{ id: string }>;
}) {
 const { id } = await params;
 const supabase = await createClient();
 const session = await requireAgency();

 const isSuperAdmin = session.role === "super_admin";
 const clientQ = supabase.from("clients").select("id, name, brand_name, website, ai_mode_enabled, ai_overview_enabled, rank_tracking_enabled, chatgpt_enabled, llm_mentions_enabled, brief_model_override, location_override").eq("id", id);
 const { data: rawClient } = await (isSuperAdmin ? clientQ : clientQ.eq("agency_id", session.agencyId)).single();

  const client = rawClient;

  if (!client) notFound();

 return (
 <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
 <div className="border-b border-line pb-6">
 <div className="flex items-center gap-2 mb-1.5 text-caption text-ink-3">
 <Link href={`/dashboard/clients/${id}`} className="hover:text-ink transition-colors flex items-center gap-1">
 <ArrowLeft size={13} />
 <span>{client.name}</span>
 </Link>
 <span className="text-ink-3">/</span>
 <span className="text-ink font-semibold">Client Settings</span>
 </div>
 <div className="flex items-center gap-3">
 <h1 className="text-display font-semibold text-ink">Project settings</h1>
 <span className="rounded-control bg-brand-soft border border-line text-brand-strong px-3 py-0.5 text-caption font-mono font-semibold">
 {id.slice(0, 8)}
 </span>
 </div>
 <p className="text-caption text-ink-3 mt-1 max-w-2xl">
 Configure AI citation override modes, answer box tracking toggles, and brand anchor identity signals. Each check toggle supports Off / On / Inherit from agency defaults.
 </p>
 </div>

 <div className="space-y-8">
 <ClientIdentityForm
 clientId={id}
 scope="agency"
 initial={{
 website: (client as { website: string | null }).website,
 brand_name: (client as { brand_name: string | null }).brand_name,
 }}
 />

 <ClientSettingsForm
 clientId={id}
 initial={{
 ai_mode_enabled: client.ai_mode_enabled,
 ai_overview_enabled: client.ai_overview_enabled,
 rank_tracking_enabled: client.rank_tracking_enabled,
 chatgpt_enabled: client.chatgpt_enabled,
 llm_mentions_enabled: client.llm_mentions_enabled,
 brief_model_override: client.brief_model_override ?? "",
 location_override: client.location_override ?? "",
 }}
 />
 </div>
 </div>
 );
}
