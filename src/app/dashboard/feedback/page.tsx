"use client";

import React, { useState, useEffect } from "react";
import { Send, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { checkSupabaseConfig, classifyFeedbackError, submitFeedback } from "@/lib/feedback";

type FormCategory = "Feature Request" | "Bug Report" | "UX Improvement";

interface FeedbackItem {
 id: string;
 category: string;
 subject: string;
 message: string;
 createdAt: string;
 status: "Open" | "In Review" | "Resolved" | "Closed";
}

/** Labels for the categories stored in the feedback table. */
const CATEGORY_LABEL: Record<string, string> = {
 bug: "Bug Report",
 idea: "Feature Request",
 general: "UX Improvement",
 question: "Question",
 praise: "Praise",
};

function statusLabel(stat: string): FeedbackItem["status"] {
 if (stat === "done") return "Resolved";
 if (stat === "archived") return "Closed";
 if (stat === "triaged" || stat === "in_progress") return "In Review";
 return "Open";
}

export default function FeedbackPage() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<FormCategory>("Feature Request");
  const [submitted, setSubmitted] = useState(false);
  const [myFeedback, setMyFeedback] = useState<FeedbackItem[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  const fetchMyFeedback = async () => {
    try {
      checkSupabaseConfig();
      const supabase = createClient();
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        setListState("error");
        return;
      }

      const { data, error } = await supabase
        .from("feedback")
        // Explicit columns: never fetch internal admin_notes into the browser.
        .select("id, category, subject, message, status, created_at, context_data")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const mapped: FeedbackItem[] = (Array.isArray(data) ? data : []).map((item: any) => ({
        id: item.id,
        category: CATEGORY_LABEL[item.category] ?? "Feedback",
        subject: item.subject || item.context_data?.subject || "(No subject)",
        message: item.message,
        createdAt: item.created_at ? String(item.created_at).split("T")[0] : "",
        status: statusLabel(item.status),
      }));
      setMyFeedback(mapped);
      setListState("ready");
    } catch (e: any) {
      console.warn("Failed to fetch feedback from Supabase directly:", e);
      setListState("error");
    }
  };

  useEffect(() => {
    const loadSession = async () => {
      try {
        const supabase = createClient();
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        setUser(currentUser);
      } catch (e) {
        console.error("Error loading session:", e);
      } finally {
        setAuthLoading(false);
      }
    };
    loadSession();
  }, []);

  useEffect(() => {
    if (!authLoading) {
      fetchMyFeedback();
    }
  }, [authLoading]);

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!subject.trim() || !message.trim()) return;

    if (authLoading) {
      setErrorMessage("Authentication error: Session is still loading. Please wait a moment.");
      return;
    }

    const apiCategory = 
      category === "Bug Report" ? "bug" : 
      category === "Feature Request" ? "idea" : "general";

    setIsSubmitting(true);

    try {
      // Stored through the API, which takes who sent it from the signed-in session. The browser
      // never writes the feedback table itself and sends no identity or status fields.
      const { id: insertedId } = await submitFeedback({
        category: apiCategory,
        subject: subject.trim(),
        message: message.trim(),
        page_url: "/dashboard/feedback",
        context_data: {
          subject: subject.trim(),
          submitted_from: "dashboard_feedback_page",
          timestamp: new Date().toISOString(),
        },
      });

      // Only reached when the row was really stored (insertedId comes from the database).
      if (!insertedId) throw new Error("Database insert failed");
      setSubject("");
      setMessage("");
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 5000);

      // Re-fetch to sync
      await fetchMyFeedback();
    } catch (err: any) {
      console.error("Feedback submission error:", err);
      const classified = classifyFeedbackError(err);
      setErrorMessage(classified.message);
    } finally {
      setIsSubmitting(false);
    }
  };

 return (
 <div className="mx-auto w-full max-w-[1240px] animate-fade-in space-y-10 px-4 pb-24 pt-6 font-sans md:px-8 md:pt-9 xl:px-10">
 {/* Page Header */}
 <header className="border-b border-line pb-7">
 <h1 className="text-display font-semibold text-ink">Feedback</h1>
 <p className="mt-2 max-w-[65ch] text-body text-ink-2 md:text-[0.9375rem] md:leading-6">
 Tell us what could be better. Every message goes to the people who build VSI.
 </p>
 </header>

 {submitted && (
 <div role="status" className="flex items-center gap-2 rounded-panel bg-positive-soft p-3.5 text-support font-medium text-positive">
 <CheckCircle2 size={16} />
 <span>Feedback sent. It is saved and listed under Your feedback.</span>
 </div>
 )}

 {errorMessage && (
 <div role="alert" className="flex items-start gap-2 rounded-panel bg-critical/10 border border-critical/20 p-3.5 text-support font-medium text-critical">
 <AlertCircle size={16} className="mt-0.5 shrink-0" />
 <span>{errorMessage}</span>
 </div>
 )}

 <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
 {/* Submit Form (5 Cols) */}
 <div className="lg:col-span-5 bg-surface rounded-panel border border-line p-6 space-y-4">
 <h2 className="text-[1.0625rem] font-semibold leading-6 text-ink">Send feedback</h2>

 <form onSubmit={handleSubmitFeedback} className="space-y-4">
 <div>
 <label className="block text-caption font-semibold text-ink mb-1">
 Category
 </label>
 <select
 value={category}
 onChange={(e) => setCategory(e.target.value as FormCategory)}
 className="w-full rounded-panel border border-line bg-canvas px-3.5 py-2 text-caption text-ink focus:outline-none focus:border-line-strong"
 >
 <option value="Feature Request">Feature Request</option>
 <option value="Bug Report">Bug Report</option>
 <option value="UX Improvement">UX Improvement</option>
 </select>
 </div>

 <div>
 <label className="block text-caption font-semibold text-ink mb-1">
 Subject
 </label>
 <input
 type="text"
 required
 placeholder="Brief summary of your feedback..."
 value={subject}
 onChange={(e) => setSubject(e.target.value)}
 className="w-full rounded-panel border border-line bg-canvas px-3.5 py-2 text-caption text-ink focus:outline-none focus:border-line-strong"
 />
 </div>

 <div>
 <label className="block text-caption font-semibold text-ink mb-1">
 Details
 </label>
 <textarea
 rows={5}
 required
 placeholder="Describe how this feature will improve your workflow..."
 value={message}
 onChange={(e) => setMessage(e.target.value)}
 className="w-full rounded-panel border border-line bg-canvas p-3.5 text-caption text-ink focus:outline-none focus:border-line-strong"
 />
 </div>

 <button
 type="submit"
 disabled={isSubmitting}
 className="w-full flex items-center justify-center gap-2 rounded-control bg-ink hover:bg-ink-2 text-white px-4 py-2.5 text-caption font-semibold transition-colors disabled:opacity-50"
 >
 {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
 <span>{isSubmitting ? "Sending..." : "Send feedback"}</span>
 </button>
 </form>
 </div>

 {/* Your real submissions (7 Cols) */}
 <div className="lg:col-span-7 space-y-4">
 <div className="flex flex-wrap items-baseline justify-between gap-2">
 <h2 className="text-[1.0625rem] font-semibold leading-6 text-ink">Your feedback</h2>
 </div>

 {listState === "loading" ? (
 <div className="rounded-panel border border-dashed border-line p-10 text-center text-ink-2 text-body">
 <Loader2 size={16} className="mx-auto animate-spin" />
 </div>
 ) : listState === "error" ? (
 <div role="alert" className="rounded-panel border border-dashed border-line p-10 text-center text-ink-2 text-body">
 Your feedback couldn&apos;t be loaded right now.
 </div>
 ) : myFeedback.length === 0 ? (
 <div className="rounded-panel border border-dashed border-line p-10 text-center text-ink-2 text-body">
 You haven&apos;t submitted any feedback yet.
 </div>
 ) : (
 <div className="space-y-3">
 {myFeedback.map((item) => (
 <div
 key={item.id}
 className="bg-surface rounded-panel border border-line p-5 flex items-start gap-4"
 >
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap mb-1">
 <span className="text-caption font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
 {item.category}
 </span>
 <span className={`text-caption font-semibold px-2 py-0.5 rounded ${
 item.status === "Resolved" ? "bg-positive-soft text-positive" :
 item.status === "In Review" ? "bg-info-soft text-info" :
 "bg-surface-2 text-ink-2"
 }`}>
 {item.status}
 </span>
 </div>

 <h3 className="text-body font-semibold text-ink">{item.subject}</h3>
 <p className="text-caption text-ink-2 mt-1 whitespace-pre-wrap">{item.message}</p>

 <div className="mt-3 flex items-center justify-between text-caption text-ink-2">
 <span>Submitted by you</span>
 <span>{item.createdAt}</span>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>
 );
}
