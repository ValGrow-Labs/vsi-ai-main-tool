import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAgency, isDummySupabase } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { displayDomain, UUID_PATTERN } from "@/lib/project-types";
import { LOCATIONS, type Location } from "@/types/search";
import { matchLocationOption } from "@/components/project-creation/location";
import { PageContainer, PageHeader } from "@/components/ui/Page";
import { Notice } from "@/components/ui/Status";
import { AddSearchesForm } from "@/features/searches/components/AddSearchesForm";

export const metadata: Metadata = { title: "Add searches" };
export const dynamic = "force-dynamic";

export default async function AddSearchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAgency();
  if (!UUID_PATTERN.test(id) || isDummySupabase()) notFound();

  const supabase = await createClient();
  let q = supabase.from("clients").select("id, agency_id, name, website, brand_name, industry, default_location, country").eq("id", id);
  if (session.role !== "super_admin") q = q.eq("agency_id", session.agencyId);
  const [{ data: client }, { data: kws }] = await Promise.all([
    q.maybeSingle(),
    supabase.from("tracked_keywords").select("keyword").eq("client_id", id),
  ]);
  if (!client) notFound();

  const domain = displayDomain(client.website as string | null);
  const locMatch =
    (client.country ? matchLocationOption(client.country as string) : null) ||
    (client.default_location ? matchLocationOption(client.default_location as string) : null);
  const location: Location =
    (locMatch?.code && locMatch.code in LOCATIONS ? (locMatch.code as Location) : null) ||
    ((client.default_location as Location | null) && (client.default_location as Location) in LOCATIONS
      ? (client.default_location as Location)
      : "in");

  return (
    <PageContainer className="max-w-[880px]">
      <PageHeader
        title="Add searches"
        description="Choose the searches your customers use. VSI checks each one in Google and in AI answers."
        meta={domain && <span>{domain}</span>}
      />
      {!domain ? (
        <Notice tone="attention" title="Add your website address first">
          Searches are checked against the website saved on the project. Add it in project settings.
        </Notice>
      ) : (
        <AddSearchesForm
          project={{
            id: client.id as string,
            agencyId: client.agency_id as string,
            name: client.name as string,
            domain,
            brand: ((client.brand_name as string | null) || (client.name as string)).trim(),
            industry: (client.industry as string | null) ?? null,
            location,
          }}
          existing={((kws ?? []) as { keyword: string }[]).map((k) => k.keyword)}
        />
      )}
    </PageContainer>
  );
}
