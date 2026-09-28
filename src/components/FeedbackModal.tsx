"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  X, Bold, Italic, Underline, List, ListOrdered,
  Link2, Code2, Quote, Minus, Paperclip, Loader2,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { classifyFeedbackError, submitFeedback } from "@/lib/feedback";

interface EmojiOption {
  emoji: string;
  label: string;
  value: number;
}

const EMOJI_OPTIONS: EmojiOption[] = [
  { emoji: "😡", label: "Very Poor",  value: 1 },
  { emoji: "😕", label: "Poor",       value: 2 },
  { emoji: "😐", label: "Average",    value: 3 },
  { emoji: "🙂", label: "Good",       value: 4 },
  { emoji: "😍", label: "Excellent",  value: 5 },
];

const MAX_FILE_SIZE   = 10 * 1024 * 1024;
const ACCEPTED_TYPES  = ["image/png", "image/jpeg", "application/pdf", "text/plain"];
const ACCEPTED_EXTS   = ".png,.jpg,.jpeg,.pdf,.txt";

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({
  message,
  type,
  onDismiss,
}: {
  message: string;
  type: "success" | "error";
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        "fixed bottom-6 right-6 z-[9999] flex items-center gap-3",
        "rounded-panel px-4 py-3.5 shadow-overlay border text-body font-semibold",
        type === "success"
          ? "bg-positive border-positive/30 text-white"
          : "bg-critical border-critical/30 text-white",
      ].join(" ")}
      style={{ animation: "toastIn 300ms cubic-bezier(.22,1,.36,1) both" }}
    >
      {type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-1 opacity-80 hover:opacity-100 transition-opacity" aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Toolbar Button ───────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      tabIndex={0}
      className="h-7 w-7 flex items-center justify-center rounded-control text-ink-3 hover:text-ink hover:bg-surface-2 transition-all duration-150"
    >
      {children}
    </button>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const pathname        = usePathname();
  const { resolvedTheme } = useTheme();

  const [rating,        setRating]        = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [comment,       setComment]       = useState("");
  const [attachment,    setAttachment]    = useState<File | null>(null);
  const [fileError,     setFileError]     = useState<string | null>(null);
  const [submitting,    setSubmitting]    = useState(false);
  const [toast,         setToast]         = useState<{ message: string; type: "success" | "error" } | null>(null);

  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayRef   = useRef<HTMLDivElement>(null);
  const closeBtnRef  = useRef<HTMLButtonElement>(null);

  // ── Reset on open ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setRating(null);
      setHoveredRating(null);
      setComment("");
      setAttachment(null);
      setFileError(null);
      setSubmitting(false);
    } else {
      setTimeout(() => closeBtnRef.current?.focus(), 60);
    }
  }, [open]);

  // ── ESC to close ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  // ── Body scroll lock ─────────────────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // ── Focus trap ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const modal = document.getElementById("vsi-feedback-modal");
    if (!modal) return;
    const getFocusable = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]),textarea,input,[tabindex]:not([tabindex="-1"])'
        )
      );
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = getFocusable();
      const first = els[0];
      const last  = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);

  // ── Toolbar helpers ──────────────────────────────────────────────────────
  const wrapSelection = useCallback((before: string, after = before) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e);
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    setComment(next);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    }, 0);
  }, []);

  const insertAtLineStart = useCallback((prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, value } = ta;
    const ls = value.lastIndexOf("\n", s - 1) + 1;
    const next = value.slice(0, ls) + prefix + value.slice(ls);
    setComment(next);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + prefix.length, s + prefix.length); }, 0);
  }, []);

  const insertHR = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    setComment((v) => v.slice(0, s) + "\n\n---\n\n" + v.slice(s));
    setTimeout(() => ta.focus(), 0);
  }, []);

  const insertLink = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel  = value.slice(s, e) || "link text";
    const url  = prompt("Enter URL:");
    if (!url) return;
    const rep  = `[${sel}](${url})`;
    setComment(value.slice(0, s) + rep + value.slice(e));
    setTimeout(() => ta.focus(), 0);
  }, []);

  // ── File upload ──────────────────────────────────────────────────────────
  const handleFile = (file?: File | null) => {
    setFileError(null);
    if (!file) { setAttachment(null); return; }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileError("Unsupported file. Please upload PNG, JPG, JPEG, PDF, or TXT.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError("File too large. Maximum size is 10 MB.");
      return;
    }
    setAttachment(file);
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const canSubmit = rating !== null && comment.trim().length >= 4 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      const browser  = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : "";
      const device   = /Mobile|Android|iPhone|iPad/i.test(browser) ? "mobile" : "desktop";
      const screen   = typeof window !== "undefined" ? `${window.screen.width}x${window.screen.height}` : "";
      const viewport = typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "";
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const os       = (() => {
        if (/Windows/.test(browser))      return "Windows";
        if (/Mac OS/.test(browser))       return "macOS";
        if (/Android/.test(browser))      return "Android";
        if (/iPhone|iPad/.test(browser))  return "iOS";
        if (/Linux/.test(browser))        return "Linux";
        return "Other";
      })();

      // Only the file name is recorded; the file itself is not uploaded.
      const attachmentName: string | null = attachment ? attachment.name : null;

      // Stored through the API, which takes who sent it from the signed-in session. The browser
      // never writes the feedback table itself and sends no identity or status fields.
      await submitFeedback({
        rating,
        comment: comment.trim(),
        attachment_name: attachmentName,
        page: pathname,
        browser,
        device,
        os,
        screen,
        viewport,
        timezone,
        theme: resolvedTheme,
        timestamp: new Date().toISOString(),
      });

      setRating(null);
      setHoveredRating(null);
      setComment("");
      setAttachment(null);
      setFileError(null);
      setToast({ message: "Feedback submitted successfully.", type: "success" });
      onClose();
    } catch (err: any) {
      console.error("Feedback modal DB insert failed:", err);
      const classified = classifyFeedbackError(err);
      setToast({ message: classified.message, type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Toast lives outside modal so it persists after close */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}

      {open && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
          aria-modal="true"
          role="dialog"
          aria-label="Send feedback"
        >
          <div
            id="vsi-feedback-modal"
            className="w-full bg-surface border border-line shadow-overlay flex flex-col overflow-hidden"
            style={{
              maxWidth: "520px",
              borderRadius: "20px",
              animation: "vsi-fm-scale 220ms cubic-bezier(0.34,1.56,0.64,1) both",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-7 pt-6 pb-5 border-b border-line">
              <h2 className="text-base font-semibold text-ink tracking-tight">Feedback</h2>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={onClose}
                aria-label="Close feedback modal"
                className="h-8 w-8 rounded-panel flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-2 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* ── Scrollable Body ─────────────────────────────────────── */}
            <div
              className="px-7 py-5 space-y-6 overflow-y-auto custom-scrollbar"
              style={{ maxHeight: "calc(100dvh - 180px)" }}
            >
              {/* ─ Emoji Rating ──────────────────────────────────────── */}
              <div>
                <p className="text-body font-semibold text-ink leading-snug">
                  How would you rate your experience with SearchIntel?
                </p>
                <p className="text-caption text-ink-3 mt-1">
                  Your feedback helps us improve SearchIntel for everyone.
                </p>

                <div
                  className="flex items-center gap-2 mt-4"
                  role="radiogroup"
                  aria-label="Experience rating"
                >
                  {EMOJI_OPTIONS.map((opt) => {
                    const sel = rating === opt.value;
                    const hov = hoveredRating === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={sel}
                        aria-label={opt.label}
                        title={opt.label}
                        onClick={() => setRating(opt.value)}
                        onMouseEnter={() => setHoveredRating(opt.value)}
                        onMouseLeave={() => setHoveredRating(null)}
                        className="flex flex-col items-center gap-1.5 outline-none"
                      >
                        <span
                          className="flex items-center justify-center rounded-panel cursor-pointer transition-all duration-150"
                          style={{
                            fontSize: "26px",
                            lineHeight: 1,
                            padding: "10px",
                            transform: sel || hov ? "scale(1.2)" : "scale(1)",
                            boxShadow: sel
                              ? "0 0 0 2.5px #f59e0b, 0 4px 16px rgba(245,158,11,0.3)"
                              : hov
                              ? "0 4px 14px rgba(245,158,11,0.2)"
                              : "none",
                            background: sel
                              ? "rgba(245,158,11,0.13)"
                              : hov
                              ? "rgba(245,158,11,0.07)"
                              : "transparent",
                          }}
                        >
                          {opt.emoji}
                        </span>
                        <span
                          className="text-caption font-semibold transition-colors"
                          style={{ color: sel ? "#f59e0b" : "var(--color-muted-foreground, #888)" }}
                        >
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ─ Comment ───────────────────────────────────────────── */}
              <div>
                <label htmlFor="vsi-feedback-comment" className="block text-body font-semibold text-ink mb-2">
                  Your feedback
                </label>

                {/* Rich Toolbar */}
                <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 bg-surface-2 rounded-t-xl border border-line border-b-0">
                  <ToolbarBtn onClick={() => wrapSelection("**")}  title="Bold">       <Bold         size={12} /></ToolbarBtn>
                  <ToolbarBtn onClick={() => wrapSelection("_")}   title="Italic">     <Italic       size={12} /></ToolbarBtn>
                  <ToolbarBtn onClick={() => wrapSelection("__")}  title="Underline">  <Underline    size={12} /></ToolbarBtn>
                  <div className="w-px h-4 bg-border mx-1" aria-hidden />
                  <ToolbarBtn onClick={() => insertAtLineStart("- ")}  title="Bullet List">    <List         size={12} /></ToolbarBtn>
                  <ToolbarBtn onClick={() => insertAtLineStart("1. ")} title="Numbered List">  <ListOrdered  size={12} /></ToolbarBtn>
                  <ToolbarBtn onClick={insertLink}                 title="Insert Link"> <Link2        size={12} /></ToolbarBtn>
                  <div className="w-px h-4 bg-border mx-1" aria-hidden />
                  <ToolbarBtn onClick={() => wrapSelection("`")}   title="Code">        <Code2        size={12} /></ToolbarBtn>
                  <ToolbarBtn onClick={() => insertAtLineStart("> ")} title="Quote">   <Quote        size={12} /></ToolbarBtn>
                  <ToolbarBtn onClick={insertHR}                   title="Divider">    <Minus        size={12} /></ToolbarBtn>
                </div>

                <textarea
                  id="vsi-feedback-comment"
                  ref={textareaRef}
                  value={comment}
                  onChange={(e) => {
                    if (e.target.value.length <= 2000) setComment(e.target.value);
                  }}
                  placeholder="Tell us what you liked, what didn't work, or how we can improve..."
                  rows={5}
                  aria-describedby="vsi-char-count"
                  className="w-full rounded-b-xl border border-line bg-canvas px-3.5 py-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ink/10 focus:border-line-strong resize-none transition-all"
                />

                <div className="flex items-center justify-between mt-1" id="vsi-char-count">
                  <span className="text-caption text-ink-3">
                    {comment.length > 0 && comment.trim().length < 4 && (
                      <span className="text-brand-strong font-medium">
                        {4 - comment.trim().length} more character{4 - comment.trim().length !== 1 ? "s" : ""} needed ·{" "}
                      </span>
                    )}
                    {comment.length} / 2000
                  </span>
                </div>
              </div>

              {/* ─ Attachment ─────────────────────────────────────────── */}
              <div>
                <p className="text-body font-semibold text-ink mb-2">
                  Attachment{" "}
                  <span className="text-ink-3 font-normal text-caption">(optional)</span>
                </p>

                {attachment ? (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-panel border border-line bg-surface-2">
                    <Paperclip size={14} className="text-brand-strong shrink-0" />
                    <span className="text-body text-ink font-medium flex-1 truncate">{attachment.name}</span>
                    <span className="text-caption text-ink-3 shrink-0">
                      {(attachment.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => { setAttachment(null); setFileError(null); }}
                      aria-label="Remove attachment"
                      className="h-6 w-6 rounded-control flex items-center justify-center text-ink-3 hover:text-critical hover:bg-critical/10 transition-all"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-panel border border-dashed border-line hover:border-line bg-surface-2/50 hover:bg-brand-soft text-body text-ink-3 hover:text-attention transition-all group"
                  >
                    <Paperclip size={14} className="shrink-0 group-hover:text-ink transition-colors" />
                    <span>Click to attach a file</span>
                    <span className="ml-auto text-caption text-ink-3">PNG, JPG, PDF, TXT · max 10 MB</span>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTS}
                  className="sr-only"
                  aria-label="Attach file"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
                />

                {fileError && (
                  <p className="mt-2 text-caption text-critical flex items-center gap-1.5">
                    <AlertCircle size={12} /> {fileError}
                  </p>
                )}
              </div>
            </div>

            {/* ── Footer ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-end gap-3 px-7 py-4 border-t border-line bg-surface-2/40">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-panel text-body font-semibold text-ink border border-line hover:bg-surface-2 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                aria-disabled={!canSubmit}
                className="flex items-center gap-2 px-5 py-2 rounded-panel text-body font-semibold text-white bg-ink hover:bg-ink-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all "
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Submitting Feedback...
                  </>
                ) : (
                  "Send Feedback"
                )}
              </button>
            </div>
          </div>

          <style>{`
            @keyframes vsi-fm-scale {
              from { opacity: 0; transform: scale(0.92) translateY(10px); }
              to   { opacity: 1; transform: scale(1) translateY(0); }
            }
            @keyframes toastIn {
              from { opacity: 0; transform: translateY(12px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
