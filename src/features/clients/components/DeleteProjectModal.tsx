"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Status";
import { displayDomain } from "@/lib/project-types";
import { cn } from "@/lib/utils";

export interface DeleteProjectModalProps {
  project: {
    id: string;
    name: string;
    website?: string | null;
    searches?: number;
    openTasks?: number;
    isCurrent?: boolean;
  };
  open: boolean;
  onClose: () => void;
  onDeleted?: (id: string) => void;
  redirectOnDelete?: string;
}

export function DeleteProjectModal({
  project,
  open,
  onClose,
  onDeleted,
  redirectOnDelete,
}: DeleteProjectModalProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the Cancel button on open for safety (so Enter doesn't delete accidentally)
  useEffect(() => {
    if (open) {
      setError(null);
      setDeleting(false);
      const timer = setTimeout(() => {
        cancelBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, deleting, onClose]);

  // Lock body scroll while modal is visible
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  if (!open) return null;

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg =
          body?.error?.message ||
          (typeof body?.error === "string" ? body.error : null) ||
          "Could not delete this project. Please try again.";
        setError(errorMsg);
        setDeleting(false);
        return;
      }

      // Success
      setDeleting(false);
      onClose();
      if (onDeleted) {
        onDeleted(project.id);
      }
      if (redirectOnDelete) {
        router.push(redirectOnDelete);
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      console.error("[DeleteProjectModal] delete request failed", err);
      setError("A network error occurred. Please check your connection and try again.");
      setDeleting(false);
    }
  };

  const domain = displayDomain(project.website);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === overlayRef.current && !deleting) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`delete-title-${project.id}`}
      aria-describedby={`delete-desc-${project.id}`}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-panel border border-line bg-surface p-6 shadow-overlay animate-in zoom-in-95 duration-150 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-critical-soft text-critical">
              <AlertTriangle size={20} strokeWidth={2} aria-hidden />
            </div>
            <div>
              <h2 id={`delete-title-${project.id}`} className="text-body font-semibold text-ink">
                Delete project?
              </h2>
              <p className="text-support text-ink-3">
                This action is permanent and cannot be undone.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-control p-1 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-40 disabled:pointer-events-none transition-colors"
            aria-label="Close dialog"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {/* Project info card */}
        <div className="rounded-control border border-line bg-surface-2 p-3.5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-body font-medium text-ink truncate">
              {project.name}
            </span>
            {project.isCurrent && (
              <span className="rounded bg-brand-soft px-1.5 py-0.5 text-caption font-medium text-brand-strong shrink-0">
                Current project
              </span>
            )}
          </div>
          {domain && (
            <p className="text-support text-ink-3 truncate">{domain}</p>
          )}
        </div>

        {/* Description & Impact List */}
        <div id={`delete-desc-${project.id}`} className="space-y-2 text-support text-ink-2">
          <p>
            Deleting <strong className="font-semibold text-ink">{project.name}</strong> will permanently remove:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-caption text-ink-3">
            <li>Tracked searches and historical ranking data</li>
            <li>Site audit reports, crawl snapshots, and technical issues</li>
            <li>AI visibility check results and prompt benchmark data</li>
            <li>Configured competitors and project tasks</li>
          </ul>
          <p className="text-caption text-ink-3 pt-1">
            Other projects in your workspace will not be affected.
          </p>
        </div>

        {/* Active project notice */}
        {project.isCurrent && (
          <Notice tone="attention" title="Switching active project">
            This project is currently selected. Deleting it will automatically switch your workspace to your next available project.
          </Notice>
        )}

        {/* Error banner */}
        {error && (
          <Notice tone="critical" title="Could not delete project">
            {error}
          </Notice>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
          <Button
            ref={cancelBtnRef}
            variant="secondary"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 size={15} aria-hidden />
                Delete project
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface DeleteProjectButtonProps {
  project: {
    id: string;
    name: string;
    website?: string | null;
    searches?: number;
    openTasks?: number;
    isCurrent?: boolean;
  };
  className?: string;
  onDeleted?: (id: string) => void;
  redirectOnDelete?: string;
  buttonStyle?: "icon" | "danger";
  label?: string;
}

export function DeleteProjectButton({
  project,
  className,
  onDeleted,
  redirectOnDelete,
  buttonStyle = "icon",
  label = "Delete project",
}: DeleteProjectButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {buttonStyle === "danger" ? (
        <Button
          variant="danger"
          size="sm"
          onClick={() => setIsOpen(true)}
          className={className}
        >
          <Trash2 size={14} aria-hidden />
          {label}
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={cn(
            "inline-flex items-center justify-center h-8 w-8 rounded-control text-ink-3 hover:text-critical hover:bg-critical-soft transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-critical",
            className
          )}
          title={`Delete project "${project.name}"`}
          aria-label={`Delete project "${project.name}"`}
        >
          <Trash2 size={15} strokeWidth={1.75} aria-hidden />
        </button>
      )}

      <DeleteProjectModal
        project={project}
        open={isOpen}
        onClose={() => setIsOpen(false)}
        onDeleted={onDeleted}
        redirectOnDelete={redirectOnDelete}
      />
    </>
  );
}
