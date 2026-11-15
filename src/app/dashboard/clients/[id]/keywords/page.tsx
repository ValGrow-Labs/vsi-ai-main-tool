import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAgency } from "@/lib/auth";
import { SERVICE_TYPE_LABELS, TRACK_TYPE_CONFIG, LOCATIONS } from "@/types/search";
import type { ServiceType, TrackType, Location } from "@/types/search";
import { matchLocationOption } from "@/components/project-creation/location";
import { Plus, ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer, PageHeader } from "@/components/ui/Page";
import { StatusLabel } from "@/components/ui/Status";

export default async function KeywordsPage({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 const supabase = await createClient();
 const session = await requireAgency();

 const isSuperAdmin = session.role === "super_admin";
 const clientQ = supabase.from("clients").select("id, name, service_type, default_location").eq("id", id);
 const { data: client } = await (isSuperAdmin ? clientQ : clientQ.eq("agency_id", session.agencyId)).single();

 if (!client) notFound();

 const { data: keywords } = await supabase
 .from("tracked_keywords")
 .select("*")
 .eq("client_id", id)
 .order("created_at", { ascending: false });

 const kws = keywords ?? [];
 const svc = SERVICE_TYPE_LABELS[client.service_type as ServiceType];

 const active = kws.filter((k) => k.is_active).length;

 return (
    <PageContainer>
      <PageHeader
        title="Searches"
        description="The searches VSI checks for this project, on Google and in AI answers. Open one to see where you stand."
        meta={
          <>
            <Link href={`/dashboard/clients/${id}`} className="hover:text-ink">
              {client.name}
            </Link>
            <span>{svc.short}</span>
            <span>
              {active} active of {kws.length}
            </span>
          </>
        }
        actions={
          <ButtonLink href={`/dashboard/clients/${id}/keywords/new`} variant="primary">
            <Plus size={15} strokeWidth={2} aria-hidden />
            Add searches
          </ButtonLink>
        }
      />

      {kws.length === 0 ? (
        <EmptyState
          title="No searches yet"
          action={
            <ButtonLink href={`/dashboard/clients/${id}/keywords/new`} variant="primary">
              <Plus size={15} strokeWidth={2} aria-hidden />
              Add searches
            </ButtonLink>
          }
        >
          Add the searches your customers make. VSI then checks where you appear on Google and whether AI answers mention you.
        </EmptyState>
      ) : (
        <div className="rounded-panel border border-line bg-surface">
          <div className="hidden grid-cols-[minmax(0,1.8fr)_8rem_minmax(0,1fr)_7rem_1rem] gap-4 rounded-t-panel border-b border-line bg-surface-2 px-4 py-2.5 text-caption font-medium text-ink-3 md:grid">
            <span>Search</span>
            <span>Checked in</span>
            <span>Location</span>
            <span>Status</span>
            <span className="sr-only">Open</span>
          </div>
          <ul className="divide-y divide-line">
            {kws.map((kw) => {
              const tt = TRACK_TYPE_CONFIG[kw.track_type as TrackType];
              return (
                <li key={kw.id}>
                  <Link
                    href={`/dashboard/clients/${id}/keywords/${kw.id}`}
                    className="group grid gap-x-4 gap-y-1 px-4 py-3.5 transition-colors hover:bg-surface-2 md:grid-cols-[minmax(0,1.8fr)_8rem_minmax(0,1fr)_7rem_1rem] md:items-center"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body font-medium text-ink">{kw.keyword}</span>
                      <span className="block truncate text-caption text-ink-3">{kw.domain}</span>
                    </span>
                    <span className="text-support text-ink-2">
                      <span className="text-ink-3 md:hidden">Checked in: </span>
                      {tt?.label ?? "AI answers"}
                    </span>
                    <span className="text-support text-ink-2">
                      {(kw.location && LOCATIONS[kw.location as Location]?.label) ||
                        matchLocationOption(kw.location)?.label ||
                        LOCATIONS.in.label}
                    </span>
                    <StatusLabel tone={kw.is_active ? "positive" : "neutral"}>{kw.is_active ? "Active" : "Paused"}</StatusLabel>
                    <ArrowRight size={15} strokeWidth={1.75} className="hidden text-line-strong transition-colors group-hover:text-ink-2 md:block" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </PageContainer>
 );
}
