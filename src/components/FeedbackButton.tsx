"use client";

import { MessageSquarePlus } from "lucide-react";
import { useFeedback } from "@/contexts/FeedbackContext";
import { usePathname } from "next/navigation";

export default function FeedbackButton() {
  const { openFeedback } = useFeedback();
  const pathname = usePathname();

  if (pathname?.startsWith("/dashboard/feedback")) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-6 md:left-72 z-40 group">
      <button
        onClick={openFeedback}
        aria-label="Send Feedback & Feature Requests"
        title="Send Feedback"
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg hover:shadow-amber-500/25 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer border border-amber-400/40"
      >
        <MessageSquarePlus size={22} strokeWidth={2.25} />

        {/* Pulsing indicator dot */}
        <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-400 border-2 border-amber-600" />
        </span>
      </button>

      {/* Floating Hover Label / Tooltip */}
      <div className="absolute left-14 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 translate-x-1 group-hover:translate-x-0">
        <div className="bg-card text-foreground text-xs font-bold px-3 py-1.5 rounded-xl border border-border shadow-xl whitespace-nowrap flex items-center gap-1.5">
          <MessageSquarePlus size={14} className="text-amber-500" />
          <span>Send Feedback</span>
        </div>
      </div>
    </div>
  );
}
