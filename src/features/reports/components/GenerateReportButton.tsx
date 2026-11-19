"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function GenerateReportButton({
  clientId,
  align = "end",
  disabled = false,
}: {
  clientId: string;
  /** "end" in page headers, "start" inside content. */
  align?: "start" | "end";
  disabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ url: string } | null>(null);

  async function generate() {
    if (loading) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      });
      const data = (await res.json().catch(() => ({}))) as { share_url?: string; error?: string };
      if (!res.ok || !data.share_url) {
        if (res.status === 401) {
          setError("Session expired. Please click below to sign in again.");
          setTimeout(() => {
            window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
          }, 1500);
          return;
        }
        setError(data.error ?? "We couldn't create the report. Please try again.");
        return;
      }
      setSuccess({ url: data.share_url });
      router.refresh();
    } catch {
      setError("We couldn't reach VSI. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={align === "end" ? "flex flex-col items-start gap-1.5 md:items-end" : "flex flex-col items-start gap-1.5"}>
      <Button variant="primary" onClick={generate} disabled={loading || disabled}>
        {loading ? (
          <>
            <Loader2 size={15} strokeWidth={1.75} className="animate-spin" aria-hidden />
            Creating report
          </>
        ) : (
          <>
            <Plus size={15} strokeWidth={2} aria-hidden />
            Create report
          </>
        )}
      </Button>
      {error && (
        <p role="alert" className="max-w-xs text-support text-critical">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-support text-positive">
          Report ready.{" "}
          <a href={success.url} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-4">
            Open it
          </a>
        </p>
      )}
    </div>
  );
}
