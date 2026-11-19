"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useContext, useSyncExternalStore } from "react";
import {
  Check,
  ChevronsUpDown,
  FolderOpen,
  HelpCircle,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
  Shield,
  X,
} from "lucide-react";
import NotificationDropdown from "@/components/NotificationDropdown";
import { MessagesContext } from "@/contexts/MessagesContext";
import type { UserRole } from "@/lib/auth";
import { logoutAndRedirect } from "@/lib/auth-client";
import { displayDomain, type ProjectSummary } from "@/lib/project-types";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "./nav";

interface Props {
  agencyName: string;
  projects: ProjectSummary[];
  activeProjectId: string | null;
  userRole: UserRole;
  userEmail: string;
  atClientCap?: boolean;
}

const COLLAPSE_KEY = "vsi_sidebar_collapsed";

const COLLAPSE_EVENT = "vsi:sidebar-collapse";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSE_EVENT, onChange);
  };
}

export default function Sidebar({ agencyName, projects, activeProjectId, userRole, userEmail, atClientCap = false }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const messagesCtx = useContext(MessagesContext);
  const unreadCount = messagesCtx?.unreadCount ?? 0;

  // Close the mobile menu whenever the page changes.
  const navKey = `${pathname}?${searchParams.toString()}`;
  const [lastNavKey, setLastNavKey] = useState(navKey);
  if (navKey !== lastNavKey) {
    setLastNavKey(navKey);
    setMobileOpen(false);
  }

  const toggleCollapsed = () => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(!collapsed));
    } catch {
      /* storage unavailable: the sidebar just doesn't remember */
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  };

  const active = projects.find((p) => p.id === activeProjectId) ?? null;
  const isCollapsed = collapsed && !mobileOpen;

  const content = (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {/* Brand */}
      <div className={cn("flex h-14 shrink-0 items-center border-b border-line", isCollapsed ? "justify-center px-2" : "justify-between px-4")}>
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5" aria-label="VSI overview">
          <Image src="/vg-logo.png" alt="" width={28} height={28} className="shrink-0 rounded-md ring-1 ring-line" />
          {!isCollapsed && (
            <span className="min-w-0">
              <span className="block text-[0.9375rem] font-semibold leading-5 tracking-[-0.01em] text-ink">VSI</span>
              <span className="block truncate text-[0.6875rem] font-medium uppercase leading-4 tracking-[0.08em] text-ink-3">Search Intelligence</span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-control p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink md:hidden"
          aria-label="Close menu"
        >
          <X size={18} strokeWidth={1.75} />
        </button>
        {!isCollapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden rounded-control p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink md:inline-flex"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Project */}
      <div className={cn("shrink-0 border-b border-line", isCollapsed ? "p-2" : "p-3")}>
        <ProjectSwitcher
          projects={projects}
          active={active}
          collapsed={isCollapsed}
          atClientCap={atClientCap}
          onExpand={toggleCollapsed}
        />
      </div>

      {/* Navigation */}
      <nav aria-label="Main" className={cn("min-h-0 flex-1 overflow-y-auto py-4", isCollapsed ? "px-2" : "px-3")}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className={cn(gi > 0 && "mt-6")}>
            {group.title && !isCollapsed && (
              <p className="mb-1.5 px-2.5 text-[0.6875rem] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-3">{group.title}</p>
            )}
            {group.title && isCollapsed && <div className="mx-2 mb-2 border-t border-line" aria-hidden />}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = item.isActive(pathname, tab);
                const Icon = item.Icon;
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href(active?.id ?? null)}
                      aria-current={isActive ? "page" : undefined}
                      title={isCollapsed ? item.label : undefined}
                      className={cn(
                        "group relative flex h-9 items-center gap-2.5 rounded-control text-body transition-colors duration-200",
                        isCollapsed ? "justify-center" : "px-2.5",
                        isActive ? "bg-brand-soft font-semibold text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute inset-y-2 left-0 w-[3px] origin-center rounded-full bg-brand transition-transform duration-200",
                          isActive ? "scale-y-100" : "scale-y-0",
                        )}
                        aria-hidden
                      />
                      <Icon
                        size={16}
                        strokeWidth={isActive ? 2 : 1.75}
                        aria-hidden
                        className={cn("shrink-0 transition-colors duration-200", isActive ? "text-brand-strong" : "text-ink-3 group-hover:text-ink-2")}
                      />
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn("shrink-0 space-y-0.5 border-t border-line py-3", isCollapsed ? "px-2" : "px-3")}>
        <FooterLink href="/dashboard/help" label="Help" Icon={HelpCircle} collapsed={isCollapsed} active={pathname === "/dashboard/help"} />
        <FooterLink href="/dashboard/feedback" label="Feedback" Icon={MessageCircle} collapsed={isCollapsed} active={pathname === "/dashboard/feedback"} />
        {userRole === "super_admin" && (
          <FooterLink href="/admin" label="Admin" Icon={Shield} collapsed={isCollapsed} active={pathname.startsWith("/admin")} />
        )}
        {isCollapsed ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex h-8 w-full items-center justify-center rounded-control text-ink-3 hover:bg-surface-2 hover:text-ink"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen size={16} strokeWidth={1.75} />
          </button>
        ) : (
          <div className="mt-2 flex items-center gap-2.5 border-t border-line px-1.5 pt-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-caption font-semibold uppercase text-brand-strong ring-1 ring-brand/20"
              aria-hidden
            >
              {userEmail.charAt(0) || "?"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-support text-ink" title={userEmail}>
                {userEmail}
              </p>
              <p className="truncate text-caption text-ink-3">{agencyName}</p>
            </div>
            <button
              type="button"
              onClick={() => logoutAndRedirect()}
              className="rounded-control p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={16} strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-3 sm:px-4 md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="-ml-1 rounded-control p-1.5 text-ink-2 hover:bg-surface-2 cursor-pointer"
            aria-label="Open menu"
          >
            <Menu size={20} strokeWidth={1.75} />
          </button>
          <Image src="/vg-logo.png" alt="VSI" width={24} height={24} className="rounded shrink-0" />
          <span className="min-w-0 truncate text-body font-semibold text-ink">{active?.name ?? "VSI"}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <NotificationDropdown />
          <Link
            href="/dashboard/messages"
            className="relative rounded-control p-2 text-ink-3 hover:bg-surface-2 hover:text-ink cursor-pointer"
            aria-label={unreadCount > 0 ? `Messages, ${unreadCount} unread` : "Messages"}
          >
            <Mail size={17} strokeWidth={1.75} />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold text-white tabular">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-caption font-semibold uppercase text-brand-strong ring-1 ring-brand/20 ml-1 cursor-pointer"
            aria-label="Account & Navigation menu"
            title={userEmail}
          >
            {userEmail.charAt(0) || "?"}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 animate-fade-in bg-ink/30 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 h-dvh shrink-0 border-r border-line transition-[width,transform] duration-200 md:sticky md:top-0 md:z-30 md:h-screen md:translate-x-0",
          isCollapsed ? "w-60 md:w-14" : "w-60",
          mobileOpen ? "translate-x-0 shadow-overlay" : "-translate-x-full",
        )}
      >
        {content}
      </aside>
    </>
  );
}

function FooterLink({
  href,
  label,
  Icon,
  collapsed,
  active,
}: {
  href: string;
  label: string;
  Icon: typeof HelpCircle;
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-control text-support",
        collapsed ? "justify-center" : "px-2.5",
        active ? "bg-surface-2 text-ink" : "text-ink-3 hover:bg-surface-2 hover:text-ink",
      )}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

function ProjectSwitcher({
  projects,
  active,
  collapsed,
  atClientCap,
  onExpand,
}: {
  projects: ProjectSummary[];
  active: ProjectSummary | null;
  collapsed: boolean;
  atClientCap: boolean;
  onExpand: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function select(id: string) {
    if (id === active?.id) {
      setOpen(false);
      return;
    }
    setPending(id);
    setError(null);
    try {
      const res = await fetch("/api/project/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id }),
      });
      if (!res.ok) throw new Error();
      setOpen(false);
      // Project-scoped detail pages belong to the old project; go to the same
      // section at the top level instead of showing stale data.
      if (window.location.pathname.startsWith("/dashboard/clients/")) router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Couldn't switch project. Try again.");
    } finally {
      setPending(null);
    }
  }

  if (projects.length === 0) {
    if (collapsed) {
      return (
        <Link
          href="/dashboard/clients/new"
          title="Add your website"
          aria-label="Add your website"
          className="flex h-9 w-full items-center justify-center rounded-control border border-dashed border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink"
        >
          <Plus size={16} strokeWidth={1.75} />
        </Link>
      );
    }
    return (
      <div className="space-y-2.5 px-1 py-0.5">
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-3">Your project</p>
          <p className="text-support font-medium text-ink">No website added</p>
        </div>
        {atClientCap ? (
          <p className="text-caption text-ink-3">Your plan&apos;s project limit is reached.</p>
        ) : (
          <Link
            href="/dashboard/clients/new"
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-control border border-line-strong bg-surface text-support font-medium text-ink hover:border-ink-3 hover:bg-surface-2"
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
            Add your website
          </Link>
        )}
      </div>
    );
  }

  const initial = (active?.name ?? "?").charAt(0).toUpperCase();

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onExpand}
        title={active ? `${active.name}` : "Choose a project"}
        className="flex h-9 w-full items-center justify-center rounded-control border border-line bg-surface text-support font-semibold text-ink hover:border-line-strong"
      >
        {initial}
      </button>
    );
  }

  const filtered = projects.filter((p) => {
    const q = query.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || (p.website ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-control border border-line bg-surface px-2.5 py-2 text-left hover:border-line-strong"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-brand-soft text-support font-semibold text-brand-strong">
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-support font-medium text-ink">{active?.name ?? "Choose a project"}</span>
          <span className="block truncate text-caption text-ink-3">
            {active ? displayDomain(active.website) ?? "No website set" : `${projects.length} projects`}
          </span>
        </span>
        <ChevronsUpDown size={14} strokeWidth={1.75} className="shrink-0 text-ink-3" aria-hidden />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 animate-fade-in rounded-panel border border-line bg-surface p-1.5 shadow-overlay">
          {projects.length > 6 && (
            <div className="relative mb-1.5">
              <Search size={14} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a project"
                aria-label="Find a project"
                className="h-8 w-full rounded-control border border-line bg-surface pl-8 pr-2 text-support text-ink placeholder:text-ink-3 focus:border-line-strong focus:outline-none"
              />
            </div>
          )}
          <ul role="listbox" aria-label="Projects" className="max-h-60 overflow-y-auto">
            {filtered.length === 0 && <li className="px-2.5 py-2 text-support text-ink-3">No projects found.</li>}
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={p.id === active?.id}
                  disabled={pending !== null}
                  onClick={() => select(p.id)}
                  className="flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left hover:bg-surface-2 disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-support text-ink">{p.name}</span>
                    <span className="block truncate text-caption text-ink-3">
                      {displayDomain(p.website) ?? "No website"}
                      {p.agencyName ? ` · ${p.agencyName}` : ""}
                    </span>
                  </span>
                  {p.id === active?.id && <Check size={14} strokeWidth={1.75} className="shrink-0 text-ink" aria-hidden />}
                  {pending === p.id && <span className="shrink-0 text-caption text-ink-3">Switching</span>}
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="px-2.5 py-1.5 text-caption text-critical">{error}</p>}
          <div className="mt-1.5 space-y-0.5 border-t border-line pt-1.5">
            <MenuLink href="/dashboard/clients" Icon={FolderOpen} onClick={() => setOpen(false)}>
              All projects
            </MenuLink>
            {active && (
              <MenuLink href={`/dashboard/clients/${active.id}/settings`} Icon={Settings2} onClick={() => setOpen(false)}>
                Project settings
              </MenuLink>
            )}
            {atClientCap ? (
              <p className="px-2.5 py-1.5 text-caption text-ink-3">Your plan&apos;s project limit is reached.</p>
            ) : (
              <MenuLink href="/dashboard/clients/new" Icon={Plus} onClick={() => setOpen(false)}>
                Add another website
              </MenuLink>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  Icon,
  onClick,
  children,
}: {
  href: string;
  Icon: typeof Plus;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2 rounded-control px-2.5 py-1.5 text-support text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden />
      {children}
    </Link>
  );
}
