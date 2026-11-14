"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import ChatFloating from "@/components/ChatFloating";
import PilotBanner from "@/components/PilotBanner";
import type { UserRole } from "@/lib/auth";
import type { ProjectSummary } from "@/lib/project-types";

interface DashboardShellProps {
  agencyName: string;
  projects: ProjectSummary[];
  activeProjectId: string | null;
  userRole: UserRole;
  userEmail: string;
  atClientCap?: boolean;
  projectKey: string;
  children: React.ReactNode;
}

export function DashboardShell({
  agencyName,
  projects,
  activeProjectId,
  userRole,
  userEmail,
  atClientCap = false,
  projectKey,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  // Full-screen mode for the website setup wizard: removes sidebar, topbar, and distractions
  const isFullscreen = pathname === "/dashboard/clients/new" || pathname?.startsWith("/dashboard/clients/new");

  if (isFullscreen) {
    return (
      <div className="min-h-screen w-full bg-canvas font-sans text-ink">
        {children}
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-canvas font-sans text-ink md:flex md:h-screen">
      <Sidebar
        agencyName={agencyName}
        projects={projects}
        activeProjectId={activeProjectId}
        userRole={userRole}
        userEmail={userEmail}
        atClientCap={atClientCap}
      />
      <div className="flex min-w-0 flex-1 flex-col md:h-screen md:overflow-hidden">
        <Topbar userEmail={userEmail} userRole={userRole} agencyName={agencyName} />
        <PilotBanner />
        <main className="min-w-0 flex-1 md:overflow-y-auto" data-scroll-container>
          {/* Keyed by project: switching project remounts the page, so no state from the previous project survives. */}
          <div key={projectKey} className="contents">
            {children}
          </div>
        </main>
      </div>
      <ChatFloating key={projectKey} />
    </div>
  );
}

