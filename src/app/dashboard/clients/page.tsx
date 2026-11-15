import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { isDummySupabase } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { requireProjectContext } from "@/lib/project-context";
import { displayDomain } from "@/lib/project-types";
import { formatDate } from "@/lib/format";
import { PageContainer, PageHeader } from "@/components/ui/Page";
import { Notice } from "@/components/ui/Status";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { OverviewScene } from "@/components/illustrations";
import { AddWebsiteButton } from "@/components/intro/FeatureIntro";
import { GuideTarget } from "@/components/onboarding/GuideTarget";
import { DeleteProjectButton } from "@/features/clients";

export const metadata: Metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

interface Counts {
  searches: number;
  openTasks: number;
  lastCheck: string | null;
}

async function loadCounts(projectIds: string[]): Promise<Map<string, Counts>> {
  const out = new Map<string, Counts>(projectIds.map((id) => [id, { searches: 0, openTasks: 0, lastCheck: null }]));
  if (isDummySupabase() || projectIds.length === 0) return out;
  const supabase = await createClient();
  const [kw, tasks, results] = await Promise.all([
    supabase.from("tracked_keywords").select("client_id").in("client_id", projectIds).eq("is_active", true),
    supabase.from("tasks").select("client_id").in("client_id", projectIds).in("status", ["todo", "in_progress"]),
    supabase.from("search_results").select("client_id, created_at").in("client_id", projectIds).order("created_at", { ascending: false }).limit(2000),
  ]);
  for (const r of (kw.data ?? []) as { client_id: string }[]) out.get(r.client_id)!.searches++;
  for (const r of (tasks.data ?? []) as { client_id: string }[]) out.get(r.client_id)!.openTasks++;
  for (const r of (results.data ?? []) as { client_id: string; created_at: string }[]) {
    const c = out.get(r.client_id);
    if (c && !c.lastCheck) c.lastCheck = r.created_at;
  }
  return out;
}

export default async function ProjectsPage() {
  const { projects, active, error } = await requireProjectContext();
  const counts = await loadCounts(projects.map((p) => p.id));

  return (
    <PageContainer>
      <PageHeader
        title="Projects"
        description="Each project is one website with its own searches, checks, tasks and reports."
        actions={
          projects.length > 0 ? (
            <ButtonLink href="/dashboard/clients/new" variant="primary">
              <Plus size={15} strokeWidth={1.75} aria-hidden />
              Add another website
            </ButtonLink>
          ) : undefined
        }
      />

      {error && <Notice tone="critical" title={error}>Refresh the page to try again.</Notice>}

      {!error && projects.length === 0 ? (
        <EmptyState diagram={<OverviewScene />} title="No websites yet" action={
            <GuideTarget step="website">
              <AddWebsiteButton />
            </GuideTarget>
          }>
          Add your website to start auditing it and checking how you appear in Google and AI answers. One website powers every part of VSI.
        </EmptyState>
      ) : (
        <div className="rounded-panel border border-line bg-surface">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_6.5rem_6.5rem_8.5rem_3rem] gap-4 rounded-t-panel border-b border-line bg-surface-2 px-4 py-2.5 text-caption font-medium text-ink-3 md:grid">
            <span>Project</span>
            <span>Searches</span>
            <span>Open tasks</span>
            <span>Last check</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul className="divide-y divide-line">
            {projects.map((p) => {
              const c = counts.get(p.id)!;
              return (
                <li key={p.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_6.5rem_6.5rem_8.5rem_3rem] md:items-center md:gap-4">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <Link href={`/dashboard/clients/${p.id}`} className="block truncate text-body font-medium text-ink hover:underline">
                        {p.name}
                        {p.id === active?.id && <span className="ml-2 text-caption font-normal text-brand-strong">Current</span>}
                      </Link>
                      <span className="block truncate text-support text-ink-3">
                        {displayDomain(p.website) ?? "No website"}
                        {p.agencyName ? ` · ${p.agencyName}` : ""}
                      </span>
                    </div>
                    <div className="md:hidden">
                      <DeleteProjectButton
                        project={{
                          id: p.id,
                          name: p.name,
                          website: p.website,
                          searches: c.searches,
                          openTasks: c.openTasks,
                          isCurrent: p.id === active?.id,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-support tabular text-ink-2">
                    <span className="text-ink-3 md:hidden">Searches: </span>
                    {c.searches}
                  </span>
                  <span className="text-support tabular text-ink-2">
                    <span className="text-ink-3 md:hidden">Open tasks: </span>
                    {c.openTasks}
                  </span>
                  <span className="text-support text-ink-3">
                    <span className="text-ink-3 md:hidden">Last check: </span>
                    {c.lastCheck ? formatDate(c.lastCheck) : "Not checked yet"}
                  </span>
                  <div className="hidden md:flex md:justify-end">
                    <DeleteProjectButton
                      project={{
                        id: p.id,
                        name: p.name,
                        website: p.website,
                        searches: c.searches,
                        openTasks: c.openTasks,
                        isCurrent: p.id === active?.id,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </PageContainer>
  );
}
