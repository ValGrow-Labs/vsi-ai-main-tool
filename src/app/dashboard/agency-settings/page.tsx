"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Settings, Palette, Mail, FileText, Save, Building2, Check, Upload, Shield, Bell, CreditCard, ChevronRight, Loader2 } from "lucide-react";
import { changedAgencySettings, type AgencySettingsResponse } from "@/lib/agency-settings";

const SECTIONS = [
  { id: "branding", label: "Agency Branding", icon: Palette, desc: "Logo, colors & display name" },
  { id: "account", label: "Account", icon: Building2, desc: "Plan & agency details" },
  { id: "notifications", label: "Notifications", icon: Bell, desc: "Alert preferences" },
  { id: "email", label: "Email & Reports", icon: Mail, desc: "Report sending settings" },
  { id: "billing", label: "Billing", icon: CreditCard, desc: "Plan and usage" },
];

const NOT_AVAILABLE = "Not available";

type Form = { display_name: string; primary_color: string; support_email: string; report_footer: string };

const toForm = (org: AgencySettingsResponse["organization"]): Form => ({
  display_name: org.display_name ?? "",
  primary_color: org.primary_color ?? "",
  support_email: org.support_email ?? "",
  report_footer: org.report_footer ?? "",
});

function roleLabel(role: string | undefined): string {
  if (role === "super_admin") return "Platform admin";
  if (role === "pilot") return "Member";
  return role ?? NOT_AVAILABLE;
}

function planLabel(isPilot: boolean | null | undefined): string {
  if (isPilot === true) return "Pilot";
  if (isPilot === false) return "Not on the pilot plan";
  return NOT_AVAILABLE;
}

function fmt(n: number | null | undefined): string {
  return typeof n === "number" ? n.toLocaleString() : NOT_AVAILABLE;
}

export default function AgencySettingsPage() {
  const [activeSection, setActiveSection] = useState("branding");
  const [data, setData] = useState<AgencySettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ display_name: "", primary_color: "", support_email: "", report_footer: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agency/settings?include=usage", { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as Partial<AgencySettingsResponse> & { error?: string };
        if (!res.ok || !json.ok || !json.organization) throw new Error(json.error || "Couldn't load your organization.");
        if (cancelled) return;
        setData(json as AgencySettingsResponse);
        setForm(toForm(json.organization));
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't load your organization.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (key: keyof Form, val: string) => setForm(f => ({ ...f, [key]: val }));

  const org = data?.organization;
  const canSave = !!data && data.mode === "database" && data.canEdit;

  const handleSave = async () => {
    if (!data || !canSave || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const changes = changedAgencySettings(toForm(data.organization), form);
      if (Object.keys(changes).length === 0) {
        setSaveError("There are no changes to save.");
        return;
      }
      const res = await fetch("/api/agency/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Your changes weren't saved. Please try again.");
      setData({ ...data, organization: { ...data.organization, ...changes } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Your changes weren't saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const activeInfo = SECTIONS.find(s => s.id === activeSection);
  const previewColor = form.primary_color || "var(--brand)";
  const displayName = form.display_name || org?.name || "";
  const keywordsUsed = data?.usage?.activeKeywords;
  const keywordCap = org?.maxKeywords;

  return (
    <div className="min-h-[calc(100vh-60px)] bg-canvas p-3 sm:p-6 font-sans text-ink">
      <div className="max-w-[1400px] mx-auto bg-surface rounded-[2rem] p-6 lg:p-8 shadow-overlay border border-line min-h-[calc(100vh-108px)]">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8 border-b border-line pb-6">
          <div className="w-10 h-10 rounded-panel bg-brand-soft border border-line flex items-center justify-center text-brand-strong">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-display font-semibold text-ink">Organization settings</h1>
            <p className="text-body text-ink-3 mt-0.5">Branding, connections and preferences for your organization.</p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">

          {/* Left Navigation Tabs */}
          <nav className="lg:w-64 shrink-0">
            <div className="bg-surface border border-line rounded-panel p-2 space-y-1">
              {SECTIONS.map(({ id, label, icon: Icon, desc }) => (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-panel text-body transition-all text-left group cursor-pointer ${
                    activeSection === id
                      ? "bg-ink text-white font-semibold "
                      : "text-ink-3 hover:text-ink hover:bg-surface-2 border border-transparent"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${activeSection === id ? "text-white" : "text-ink-3 group-hover:text-ink"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-none">{label}</p>
                    <p className={`text-caption mt-0.5 leading-none ${activeSection === id ? "text-white/80 font-medium" : "text-ink-3"}`}>{desc}</p>
                  </div>
                  {activeSection === id && <ChevronRight className="w-3.5 h-3.5 text-white shrink-0" />}
                </button>
              ))}
            </div>
          </nav>

          {/* Content Panel */}
          <div className="flex-1">
            <div className="bg-surface border border-line rounded-panel p-6 lg:p-8 space-y-6 h-full">

              {/* Section title */}
              <div className="pb-4 border-b border-line">
                <h2 className="text-lg font-semibold text-ink">{activeInfo?.label}</h2>
                <p className="text-body text-ink-3 mt-0.5">{activeInfo?.desc}</p>
              </div>

              {!data && !loadError && (
                <p className="flex items-center gap-2 text-body text-ink-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading your organization…
                </p>
              )}
              {loadError && (
                <p role="alert" className="text-body text-critical">
                  {loadError} Nothing on this page can be shown or saved until it loads.
                </p>
              )}
              {data?.mode === "local" && (
                <p className="text-caption text-ink-3">Local development session: there is no database, so these values aren&apos;t a real organization&apos;s and can&apos;t be saved here.</p>
              )}
              {data?.mode === "database" && !data.canEdit && ["branding", "email"].includes(activeSection) && (
                <p className="text-caption text-ink-3">You can view these settings, but only a platform admin can change them.</p>
              )}

              {/* ── BRANDING ── */}
              {data && activeSection === "branding" && (
                <div className="space-y-6">
                  {/* Logo */}
                  <div>
                    <label className="block text-caption font-semibold text-ink-3 mb-3">Logo</label>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-panel bg-surface-2 border border-line flex items-center justify-center overflow-hidden">
                        {org?.logo_url ? (
                          <Image src={org.logo_url} alt="Your logo" width={72} height={72} className="h-full w-full object-contain p-1" unoptimized />
                        ) : (
                          <span className="text-3xl font-semibold text-brand-strong">{displayName.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Link href="/dashboard/settings" className="flex items-center gap-2 bg-surface-2 border border-line hover:border-line text-ink text-body font-semibold px-4 py-2.5 rounded-panel transition-colors cursor-pointer">
                          <Upload className="w-4 h-4 text-brand-strong" />
                          Change logo in Settings
                        </Link>
                        <p className="text-caption text-ink-3">{org?.logo_url ? "Your uploaded logo." : "No logo uploaded yet."}</p>
                      </div>
                    </div>
                  </div>

                  {/* Names */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-caption font-semibold text-ink mb-2">Legal Name</label>
                      <input
                        value={org?.name ?? ""}
                        readOnly
                        disabled
                        className="w-full bg-canvas border border-line focus:border-line-strong rounded-panel px-4 py-3 text-body text-ink placeholder:text-ink-3/70 focus:outline-none transition-colors"
                        placeholder={NOT_AVAILABLE}
                      />
                    </div>
                    <div>
                      <label className="block text-caption font-semibold text-ink mb-2">Display Name</label>
                      <input
                        value={form.display_name}
                        onChange={e => update("display_name", e.target.value)}
                        disabled={!canSave}
                        className="w-full bg-canvas border border-line focus:border-line-strong rounded-panel px-4 py-3 text-body text-ink placeholder:text-ink-3/70 focus:outline-none transition-colors"
                        placeholder={org?.name ?? "Not set"}
                      />
                    </div>
                  </div>

                  {/* Brand Color */}
                  <div>
                    <label className="block text-caption font-semibold text-ink mb-3">Brand Color</label>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <input
                          type="color"
                          value={/^#[0-9A-Fa-f]{6}$/.test(form.primary_color) ? form.primary_color : "#000000"}
                          onChange={e => update("primary_color", e.target.value)}
                          disabled={!canSave}
                          className="w-12 h-12 rounded-panel cursor-pointer border border-line p-1 bg-canvas"
                          style={{ appearance: "none" }}
                        />
                      </div>
                      <input
                        value={form.primary_color}
                        onChange={e => update("primary_color", e.target.value)}
                        disabled={!canSave}
                        className="w-36 bg-canvas border border-line focus:border-line-strong rounded-panel px-4 py-3 text-body text-ink focus:outline-none transition-colors"
                        placeholder="Not set"
                      />
                      <div className="flex-1 bg-surface-2 border border-line rounded-panel p-3">
                        <p className="text-caption text-ink-3">Used in client-facing reports</p>
                      </div>
                    </div>
                  </div>

                  {/* Preview Card */}
                  <div className="bg-surface-2/50 border border-line rounded-panel p-5">
                    <p className="text-caption font-semibold text-ink-3 mb-3">Preview - Report Header</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-panel flex items-center justify-center font-semibold text-xl text-white" style={{ backgroundColor: previewColor }}>
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-body font-semibold text-ink">{displayName || "Your organization"}</p>
                        <p className="text-caption font-semibold" style={{ color: previewColor }}>SearchIntel Report</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ACCOUNT ── */}
              {data && activeSection === "account" && (
                <div className="space-y-5">
                  <div className="bg-positive/10 border border-positive/30 rounded-panel p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-panel bg-positive/20 flex items-center justify-center">
                        <Shield className="w-6 h-6 text-positive" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-ink">{planLabel(org?.isPilot)}</p>
                        <p className="text-caption text-ink-3 mt-0.5">
                          {typeof keywordCap === "number" ? `Up to ${keywordCap.toLocaleString()} tracked keywords` : "Keyword limit not available"}
                          {" · "}
                          {typeof org?.maxClients === "number" ? `Up to ${org.maxClients.toLocaleString()} clients` : data.mode === "database" ? "No client limit" : "Client limit not available"}
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-control bg-positive/20 border border-positive/30 text-positive text-caption font-semibold">Active</span>
                  </div>

                  {[
                    { label: "Agency ID", value: org?.id ?? NOT_AVAILABLE, mono: true },
                    { label: "User Email", value: data.user.email || NOT_AVAILABLE, mono: false },
                    { label: "User Role", value: roleLabel(data.user.role), mono: false },
                    { label: "Max Keywords", value: fmt(keywordCap), mono: false },
                  ].map(({ label, value, mono }) => (
                    <div key={label}>
                      <label className="block text-caption font-semibold text-ink-3 mb-2">{label}</label>
                      <div className={`bg-surface-2 border border-line rounded-panel px-4 py-3 text-body ${mono ? "font-mono text-ink-3" : "text-ink font-semibold"}`}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── NOTIFICATIONS ── */}
              {data && activeSection === "notifications" && (
                <div className="space-y-4">
                  <p className="text-caption text-ink-3">Not available yet: VSI doesn&apos;t store or send these alerts today, so they can&apos;t be switched on.</p>
                  {[
                    { key: "notif_email", label: "Email Alerts", desc: "Receive alerts when keyword rankings change significantly" },
                    { key: "notif_weekly", label: "Weekly Digest", desc: "Get a weekly summary of all client performance metrics" },
                    { key: "notif_tasks", label: "Task Due Notifications", desc: "Get notified when tasks are overdue or context has changed" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="bg-surface-2 border border-line rounded-panel p-5 flex items-center justify-between">
                      <div>
                        <p className="text-body font-semibold text-ink">{label}</p>
                        <p className="text-caption text-ink-3 mt-0.5">{desc}</p>
                      </div>
                      <button
                        disabled
                        aria-disabled
                        aria-label={`${label}: not available yet`}
                        className="relative w-12 h-6 rounded-full transition-colors shrink-0 ml-4 cursor-not-allowed opacity-60 bg-surface-2 border border-line"
                      >
                        <span className="absolute top-1 w-4 h-4 bg-card rounded-full shadow transition-all left-1" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* ── EMAIL ── */}
              {data && activeSection === "email" && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-caption font-semibold text-ink mb-2">Support Email</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
                      <input
                        value={form.support_email}
                        onChange={e => update("support_email", e.target.value)}
                        disabled={!canSave}
                        className="w-full bg-canvas border border-line focus:border-line-strong rounded-panel pl-11 pr-4 py-3 text-body text-ink placeholder:text-ink-3/70 focus:outline-none transition-colors"
                        placeholder="Not set"
                      />
                    </div>
                    <p className="text-caption text-ink-3 mt-1.5">Shown to clients in exported reports</p>
                  </div>
                  <div>
                    <label className="block text-caption font-semibold text-ink mb-2">Report Footer Text</label>
                    <div className="relative">
                      <FileText className="absolute left-4 top-4 w-4 h-4 text-ink-3" />
                      <textarea
                        value={form.report_footer}
                        onChange={e => update("report_footer", e.target.value)}
                        disabled={!canSave}
                        rows={3}
                        className="w-full bg-canvas border border-line focus:border-line-strong rounded-panel pl-11 pr-4 py-3 text-body text-ink placeholder:text-ink-3/70 focus:outline-none transition-colors resize-none"
                        placeholder="Not set"
                      />
                    </div>
                  </div>
                </div>
              )}



              {/* ── BILLING ── */}
              {data && activeSection === "billing" && (
                <div className="space-y-5">
                  <div className="bg-brand-soft border border-line rounded-panel p-6">
                    <p className="text-caption text-brand-strong font-semibold mb-1">Current Plan</p>
                    <p className="text-2xl font-semibold text-ink">{planLabel(org?.isPilot)}</p>
                    <p className="text-body text-ink-3 mt-1">Billing isn&apos;t managed in VSI yet.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      {
                        label: "Active tracked keywords",
                        value:
                          typeof keywordsUsed === "number"
                            ? typeof keywordCap === "number"
                              ? `${keywordsUsed.toLocaleString()} / ${keywordCap.toLocaleString()}`
                              : keywordsUsed.toLocaleString()
                            : NOT_AVAILABLE,
                      },
                      { label: "Clients", value: fmt(data.usage?.clients) },
                      { label: "Reports generated", value: fmt(data.usage?.reports) },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-surface-2 border border-line rounded-panel p-4 text-center">
                        <p className="text-xl font-semibold text-ink">{value}</p>
                        <p className="text-caption text-ink-3 mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Save Button: only where there is something that can really be saved */}
              {data && ["branding", "email"].includes(activeSection) && (
                <div className="pt-4 border-t border-line space-y-2">
                  <button
                    onClick={handleSave}
                    disabled={!canSave || saving}
                    className={`flex items-center gap-2 px-6 py-3 rounded-panel text-body font-semibold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                      saved
                        ? "bg-positive/10 border border-positive/30 text-positive"
                        : "bg-ink hover:bg-ink-2 text-white "
                    }`}
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {saving ? "Saving…" : saved ? "Changes saved" : "Save changes"}
                  </button>
                  {saveError && <p role="alert" className="text-caption text-critical">{saveError}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
