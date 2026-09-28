"use client";

import React, { useState, useRef, useEffect, useTransition } from "react";
import { ImageIcon, Loader2, Save, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Eyebrow, PageContainer, PageHeader, Section } from "@/components/ui/Page";
import { Notice } from "@/components/ui/Status";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { changedAgencySettings, type AgencySettingsResponse } from "@/lib/agency-settings";

/* ─── Local-development storage (only used when there is no database) ─── */
const LOGO_LS_KEY = "searchintel_agency_logo";
const NAME_LS_KEY = "searchintel_agency_name";
const EMAIL_LS_KEY = "searchintel_agency_email";

/* Cookie names (readable server-side by dynamicSession in auth.ts, local development only) */
const COOKIE_DISPLAY_NAME = "vsi_agency_display_name";
const COOKIE_EMAIL = "vsi_agency_email";
const COOKIE_LOGO_MARKER = "vsi_agency_logo_marker";

const MAX_AGE_30_DAYS = 2592000; // seconds

/* ─── Validation ────────────────────────────────────────────────────── */
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/* ─── Helpers ───────────────────────────────────────────────────────── */
function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE_30_DAYS}; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

function compressImage(dataUrl: string, maxDim = 400, quality = 0.75): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Uploads a picked logo (data URL) to the organization's folder in the agency-logos bucket. */
async function uploadLogo(agencyId: string, dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const ext = blob.type === "image/svg+xml" ? "svg" : blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${agencyId}/logo-${Date.now()}.${ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage.from("agency-logos").upload(path, blob, { contentType: blob.type, upsert: true });
  if (error) throw new Error(`The logo couldn't be uploaded: ${error.message}`);
  return supabase.storage.from("agency-logos").getPublicUrl(path).data.publicUrl;
}

type Loaded = { displayName: string; contactEmail: string; logoUrl: string | null };

export default function SettingsPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /* What the organization really has stored (the Reset target). */
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<AgencySettingsResponse["mode"] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [legalName, setLegalName] = useState<string | null>(null);

  /* Agency Profile form state */
  const [agencyName, setAgencyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  /** Logo shown in the form: the stored URL, a newly picked data URL, or null. */
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  /* UI feedback state */
  const [logoError, setLogoError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Load the organization's real settings ────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agency/settings", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as Partial<AgencySettingsResponse> & { error?: string };
        if (!res.ok || !data.ok || !data.organization) {
          throw new Error(data.error || "Couldn't load your organization's settings.");
        }
        if (cancelled) return;
        const org = data.organization;
        let logo = org.logo_url;
        if (data.mode === "local") {
          // Local development: the logo only ever lived in this browser.
          try {
            logo = localStorage.getItem(LOGO_LS_KEY);
          } catch {
            /* ignore */
          }
        } else {
          // Values once kept in this browser were never the organization's; drop them.
          try {
            localStorage.removeItem(LOGO_LS_KEY);
            localStorage.removeItem(NAME_LS_KEY);
            localStorage.removeItem(EMAIL_LS_KEY);
          } catch {
            /* ignore */
          }
        }
        const next: Loaded = { displayName: org.display_name ?? "", contactEmail: org.support_email ?? "", logoUrl: logo };
        setMode(data.mode ?? null);
        setCanEdit(!!data.canEdit);
        setAgencyId(org.id);
        setLegalName(org.name);
        setLoaded(next);
        setAgencyName(next.displayName);
        setContactEmail(next.contactEmail);
        setLogoDataUrl(next.logoUrl);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't load your organization's settings.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── File pick & validate ─────────────────────────────────────────── */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setLogoError("Please upload PNG, JPG, JPEG, WEBP, or SVG image.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setLogoError("Logo size must be less than 5 MB.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;
      const final = file.type === "image/svg+xml" ? raw : await compressImage(raw);
      setLogoDataUrl(final);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveLogo = () => {
    setLogoDataUrl(null);
    setLogoError(null);
  };

  /** Back to what is stored, not to made-up defaults. */
  const handleReset = () => {
    setAgencyName(loaded?.displayName ?? "");
    setContactEmail(loaded?.contactEmail ?? "");
    setLogoDataUrl(loaded?.logoUrl ?? null);
    setLogoError(null);
    setSaveError(null);
  };

  /* ── Save ─────────────────────────────────────────────────────────── */
  const saveLocally = () => {
    try {
      if (logoDataUrl) localStorage.setItem(LOGO_LS_KEY, logoDataUrl);
      else localStorage.removeItem(LOGO_LS_KEY);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      throw new Error(
        msg.toLowerCase().includes("quota")
          ? "Logo is too large to save locally. Try a smaller image (under 500 KB)."
          : "Failed to save preferences. Please try again.",
      );
    }
    if (agencyName.trim()) setCookie(COOKIE_DISPLAY_NAME, agencyName.trim());
    else deleteCookie(COOKIE_DISPLAY_NAME);
    if (contactEmail.trim()) setCookie(COOKIE_EMAIL, contactEmail.trim());
    else deleteCookie(COOKIE_EMAIL);
    if (logoDataUrl) setCookie(COOKIE_LOGO_MARKER, "__local__");
    else deleteCookie(COOKIE_LOGO_MARKER);
    window.dispatchEvent(new Event("storage"));
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !loaded) return;

    setSaving(true);
    setSaveError(null);
    setSaved(null);

    try {
      if (mode === "local") {
        saveLocally();
        setLoaded({ displayName: agencyName.trim(), contactEmail: contactEmail.trim(), logoUrl: logoDataUrl });
        setSaved("Saved in this browser only. Local development has no database, so nobody else sees these settings.");
      } else {
        if (!canEdit || !agencyId) throw new Error("Your account can't change organization settings.");

        // A newly picked logo is a data URL: upload it first, then store its URL.
        let logoUrl = logoDataUrl;
        if (logoDataUrl && logoDataUrl.startsWith("data:")) {
          logoUrl = await uploadLogo(agencyId, logoDataUrl);
        }

        const changes = changedAgencySettings(
          { display_name: loaded.displayName, support_email: loaded.contactEmail, logo_url: loaded.logoUrl },
          { display_name: agencyName, support_email: contactEmail, logo_url: logoUrl },
        );
        if (Object.keys(changes).length === 0) {
          setSaved("There were no changes to save.");
          return;
        }

        const res = await fetch("/api/agency/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Your settings weren't saved. Please try again.");
        }

        setLoaded({ displayName: agencyName.trim(), contactEmail: contactEmail.trim(), logoUrl });
        setLogoDataUrl(logoUrl);
        setSaved("Your changes now apply across your workspace.");
      }

      startTransition(() => {
        router.refresh();
      });
      setTimeout(() => setSaved(null), 4000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Your settings weren't saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const readOnly = !loaded || (mode === "database" && !canEdit);
  const isBusy = saving || isPending || readOnly;

  // Extract initials for preview
  const initials = (agencyName || legalName || "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const field =
    "h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-body text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none disabled:opacity-60";

  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        description="How your organization appears across VSI and in the reports you share."
        meta={<span>Only people in your organization can see these settings</span>}
      />

      {saved && (
        <Notice tone="positive" title="Settings saved">
          {saved}
        </Notice>
      )}
      {saveError && <Notice tone="critical" title={saveError} />}
      {loadError && (
        <Notice tone="critical" title="Your organization's settings couldn't be loaded">
          {loadError} Nothing can be saved until they load.
        </Notice>
      )}
      {loaded && mode === "database" && !canEdit && (
        <Notice tone="info" title="You can view these settings, but not change them">
          Only a platform admin can update your organization&apos;s name, contact email and logo.
        </Notice>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-10">
        <Section title="Organization" description="Shown across your workspace, in reports and in messages to clients.">
          <div className="grid items-start gap-x-12 gap-y-8 border-t border-line pt-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
            <div className="divide-y divide-line">
              {/* Name */}
              <div className="grid gap-x-8 gap-y-2 pb-6 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <div>
                  <label htmlFor="org-name" className="text-body font-medium text-ink">
                    Display name
                  </label>
                  <p className="mt-0.5 text-support text-ink-3">Shown across VSI and in reports.</p>
                </div>
                <input
                  id="org-name"
                  type="text"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  disabled={isBusy}
                  className={field}
                  placeholder={legalName ?? "Your organization's name"}
                />
              </div>

              {/* Email */}
              <div className="grid gap-x-8 gap-y-2 py-6 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <div>
                  <label htmlFor="org-email" className="text-body font-medium text-ink">
                    Contact email
                  </label>
                  <p className="mt-0.5 text-support text-ink-3">Used for important notices.</p>
                </div>
                <input
                  id="org-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  disabled={isBusy}
                  className={field}
                  placeholder="Not set"
                />
              </div>
              {/* Logo */}
              <div className="grid gap-x-8 gap-y-3 pt-6 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <div>
                  <p className="text-body font-medium text-ink">Logo</p>
                  <p className="mt-0.5 text-support text-ink-3">PNG, JPG, WEBP or SVG, up to 5 MB.</p>
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-4 rounded-panel border border-dashed border-line-strong bg-surface p-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-surface-2 text-ink-3">
                      {logoDataUrl ? (
                        <Image src={logoDataUrl} alt="Your logo" width={52} height={52} className="h-full w-full object-contain p-1" unoptimized />
                      ) : (
                        <ImageIcon size={20} strokeWidth={1.6} aria-hidden />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 text-body font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-2">
                        <Upload size={14} strokeWidth={1.75} aria-hidden />
                        {logoDataUrl ? "Change logo" : "Choose logo"}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          className="hidden"
                          onChange={handleFileChange}
                          disabled={isBusy}
                        />
                      </label>
                      {logoDataUrl && (
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          disabled={isBusy}
                          className="inline-flex h-9 items-center gap-1.5 rounded-control px-3 text-body font-medium text-critical transition-colors hover:bg-critical-soft"
                        >
                          <X size={14} strokeWidth={1.75} aria-hidden />
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  {logoError && (
                    <p role="alert" className="text-support text-critical">
                      {logoError}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Preview */}
            <figure className="rounded-panel bg-surface-2 p-5">
              <figcaption>
                <Eyebrow>Preview</Eyebrow>
                <p className="mt-1.5 text-support text-ink-3">How your organization appears in VSI.</p>
              </figcaption>
              <div className="mt-4 flex items-center gap-3.5 rounded-panel border border-line bg-surface p-4">
                {logoDataUrl ? (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-surface p-1">
                    <Image src={logoDataUrl} alt="" width={44} height={44} className="h-full w-full object-contain" unoptimized />
                  </div>
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-brand-soft text-[1.0625rem] font-semibold text-brand-strong">
                    {initials}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-body font-semibold text-ink">{agencyName || legalName || "Your organization"}</p>
                  <p className="mt-0.5 truncate text-support text-ink-3">{contactEmail || "No contact email set"}</p>
                </div>
              </div>
            </figure>
          </div>
        </Section>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <Button type="submit" variant="primary" disabled={isBusy}>
            {saving || isPending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Save size={15} strokeWidth={1.75} aria-hidden />}
            {saving || isPending ? "Saving" : !loaded && !loadError ? "Loading" : "Save changes"}
          </Button>
          <Button type="button" onClick={handleReset} disabled={isBusy}>
            Reset
          </Button>
          <p className="text-support text-ink-3">Changes apply across your workspace.</p>
        </div>
      </form>

      <Section title="Not available yet" description="These settings are planned. Nothing here can be changed today.">
        <ul className="divide-y divide-line border-y border-line">
          {["Appearance", "Password and sign-in", "Notification preferences"].map((label) => (
            <li key={label} className="flex items-center justify-between gap-4 py-3.5">
              <span className="text-body text-ink-2">{label}</span>
              <span className="text-caption text-ink-3">Coming soon</span>
            </li>
          ))}
        </ul>
      </Section>
    </PageContainer>
  );
}
