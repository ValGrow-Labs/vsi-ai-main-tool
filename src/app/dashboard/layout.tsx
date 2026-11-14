import ScrollToTop from "@/components/ScrollToTop";
import WelcomeToast from "@/components/WelcomeToast";
import { ProjectProvider } from "@/components/layout/ProjectProvider";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { createClient } from "@/lib/supabase/server";
import { requireAgency, isDummySupabase } from "@/lib/auth";
import { getProjectContext, startProjectLoad } from "@/lib/project-context";
import { loadOnboardingState } from "@/lib/onboarding-load";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";

import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { MessagesProvider } from "@/contexts/MessagesContext";
import { FeedbackProvider } from "@/contexts/FeedbackContext";

async function loadAgencyLimits(agencyId: string) {
  if (isDummySupabase()) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("agencies").select("max_clients").eq("id", agencyId).maybeSingle();
  return data as { max_clients: number | null } | null;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The projects read needs only the request's own credentials, so it runs while the session is looked up.
  startProjectLoad();
  const session = await requireAgency();
  const isSuperAdmin = session.role === "super_admin";

  // The organization's project limit and the first-use guidance are independent of each other, so they run together.
  const limits = loadAgencyLimits(session.agencyId);
  limits.catch(() => {}); // a failure is still raised where it is awaited below; this only avoids an unhandled rejection if an earlier step throws first
  const projectContext = await getProjectContext(session);
  // First-use guidance comes from real project state. If the project list failed to load, show no guidance.
  const onboarding = projectContext.error
    ? { hasProject: true, known: false, searches: 0, competitors: null, auditDone: false, auditRunning: false }
    : await loadOnboardingState(projectContext.active);
  const agency = await limits;

  const maxClients = agency?.max_clients;
  const atClientCap = !isSuperAdmin && typeof maxClients === "number" && projectContext.projects.length >= maxClients;
  const agencyName = session.branding.displayName || session.agencyName;
  const projectKey = projectContext.active?.id ?? "none";

  return (
    <NotificationsProvider userId={session.userId}>
      <MessagesProvider>
        <FeedbackProvider>
          <ProjectProvider project={projectContext.active}>
            <OnboardingProvider state={onboarding} projectId={projectContext.active?.id ?? null}>
            <ScrollToTop />
            <WelcomeToast />
            <DashboardShell
              agencyName={agencyName}
              projects={projectContext.projects}
              activeProjectId={projectContext.active?.id ?? null}
              userRole={session.role}
              userEmail={session.email}
              atClientCap={atClientCap}
              projectKey={projectKey}
            >
              {children}
            </DashboardShell>
            </OnboardingProvider>
          </ProjectProvider>
        </FeedbackProvider>
      </MessagesProvider>
    </NotificationsProvider>
  );
}
