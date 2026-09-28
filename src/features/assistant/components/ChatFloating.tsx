"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { usePathname } from "next/navigation";
import { Check, Copy, Maximize2, MessageSquareText, Minus, Paperclip, RefreshCw, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useActiveProject } from "@/components/layout/ProjectProvider";

type Role = "user" | "assistant";
interface Msg {
  id?: string;
  role: Role;
  content: string;
  timestamp?: string;
  attachedFile?: string;
  isError?: boolean;
}

type Scope =
  | { kind: "keyword"; clientId: string; keywordId: string }
  | { kind: "client"; clientId: string }
  | { kind: "global" };

function scopeFromPath(pathname: string): { scope: Scope; label: string } {
  const kwMatch = pathname.match(/^\/dashboard\/clients\/([^/]+)\/keywords\/([^/]+)/);
  if (kwMatch) return { scope: { kind: "keyword", clientId: kwMatch[1], keywordId: kwMatch[2] }, label: "this keyword" };
  const clientMatch = pathname.match(/^\/dashboard\/clients\/([^/]+)/);
  if (clientMatch) return { scope: { kind: "client", clientId: clientMatch[1] }, label: "this client" };
  return { scope: { kind: "global" }, label: "all clients" };
}

/** One conversation per project, so switching project never shows another project's chat. */
function sessionKey(projectId: string | null) {
  return `vsi.chat.session.${projectId ?? "none"}`;
}

function loadSession(key: string): Msg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

function saveSession(key: string, msgs: Msg[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(msgs));
  } catch {}
}

function renderMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  // Format tables
  const formatted = escaped.replace(
    /\|(.+)\|[\r\n]+\|[-:| ]+\|[\r\n]+((?:\|.+\|[\r\n]*)+)/g,
    (match) => {
      const rows = match.trim().split("\n");
      const headers = rows[0].split("|").filter((c) => c.trim() !== "").map((c) => `<th class="px-3 py-1.5 bg-surface-2 font-semibold text-left border border-line">${c.trim()}</th>`).join("");
      const bodyRows = rows.slice(2).map((r) => {
        const cols = r.split("|").filter((c) => c.trim() !== "").map((c) => `<td class="px-3 py-1.5 border border-line">${c.trim()}</td>`).join("");
        return `<tr class="hover:bg-surface-2/40">${cols}</tr>`;
      }).join("");
      return `<div class="overflow-x-auto my-2"><table class="w-full text-caption border-collapse border border-line rounded-control">${headers ? `<thead><tr>${headers}</tr></thead>` : ""}<tbody>${bodyRows}</tbody></table></div>`;
    }
  );

  return formatted
    .replace(/```([\s\S]*?)```/g, (_, code) => `<pre class="bg-ink text-white rounded-panel p-3 my-2 text-caption font-mono whitespace-pre-wrap border border-slate-800 shadow-inner">${code}</pre>`)
    .replace(/`([^`]+)`/g, '<code class="bg-surface-2 px-1.5 py-0.5 rounded text-caption font-mono border border-line/50">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\s)\*([^*]+)\*(?=\s|$)/g, "$1<em>$2</em>")
    .replace(/^### (.+)$/gm, '<h3 class="text-body font-semibold mt-2.5 mb-1 text-ink">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-body font-semibold mt-3 mb-1 text-ink">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-base font-semibold mt-3.5 mb-1 text-ink">$1</h1>')
    .replace(/^[-•] (.+)$/gm, '<div class="flex gap-2 my-1"><span class="text-ink-3 font-semibold">•</span><span>$1</span></div>')
    .replace(/\n{2,}/g, '<div class="h-2"></div>')
    .replace(/\n/g, "<br/>");
}

function ChatThumbs({ scopeKind, messageIndex }: { scopeKind: string; messageIndex: number }) {
  const [voted, setVoted] = useState<"up" | "down" | null>(null);
  async function vote(v: "up" | "down") {
    if (voted) return;
    setVoted(v);
    try {
      await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: v, scope_kind: scopeKind, message_index: messageIndex }),
      });
    } catch {}
  }
  return (
    <div className="mt-1 flex items-center gap-1.5 pl-1 text-caption text-ink-3">
      <button
        onClick={() => vote("up")}
        disabled={!!voted}
        title="Helpful"
        className={`h-5 w-5 rounded inline-flex items-center justify-center transition-colors ${
          voted === "up" ? "bg-positive/20 text-positive dark:text-positive font-semibold" : "hover:bg-surface-2 hover:text-ink disabled:opacity-40"
        }`}
      >
        <ThumbsUp size={13} strokeWidth={1.75} aria-hidden className="inline-block shrink-0 align-[-2px]" />
      </button>
      <button
        onClick={() => vote("down")}
        disabled={!!voted}
        title="Not useful"
        className={`h-5 w-5 rounded inline-flex items-center justify-center transition-colors ${
          voted === "down" ? "bg-critical/20 text-critical dark:text-critical font-semibold" : "hover:bg-surface-2 hover:text-ink disabled:opacity-40"
        }`}
      >
        <ThumbsDown size={13} strokeWidth={1.75} aria-hidden className="inline-block shrink-0 align-[-2px]" />
      </button>
      {voted && <span className="text-caption text-ink-3">Feedback saved</span>}
    </div>
  );
}

const FEATURE_CHIPS = [
  { label: "What should I fix first?", prompt: "What should I fix first, based on this project's latest findings?" },
  { label: "Why is my AI visibility low?", prompt: "Why is my AI visibility where it is? Which searches don't mention us and why?" },
  { label: "Who shows up instead of us?", prompt: "Which competitors appear in AI answers and Google for our searches, and where do they beat us?" },
  { label: "What changed recently?", prompt: "What changed since the previous checks for this project?" },
]

export default function ChatFloating() {
  const pathname = usePathname();
  const project = useActiveProject();
  const storageKey = sessionKey(project?.id ?? null);
  const [open, setOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(() => (typeof window === "undefined" ? [] : loadSession(storageKey)));
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [hasUnread, setHasUnread] = useState(false);
  const [attachedFile, setAttachedFile] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [conversationId] = useState(() => `conv_${Date.now()}`);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Outside project-specific pages, the chat talks about the active project.
  const { scope, label } = useMemo(() => {
    const fromPath = scopeFromPath(pathname);
    if (fromPath.scope.kind === "global" && project) {
      return { scope: { kind: "client", clientId: project.id } as Scope, label: project.name };
    }
    return fromPath;
  }, [pathname, project]);

  useEffect(() => {
    saveSession(storageKey, messages);
  }, [storageKey, messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamBuffer, open, streaming]);

  const handleOpen = () => {
    setOpen(true);
    setIsMinimized(false);
    setHasUnread(false);
  };

  function clearChat() {
    setMessages([]);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
  }

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAttachedFile(file.name);
  };

  async function fetchStreamWithRetry(payloadMessages: Msg[], isRetry = false): Promise<boolean> {
    const ac = new AbortController();
    abortRef.current = ac;

    const requestBody = {
      message: payloadMessages[payloadMessages.length - 1]?.content,
      conversationId,
      scope,
      messages: payloadMessages,
      workspaceId: "workspace_default",
      userId: "user_default",
    };

    try {
      // Try /api/assistant/chat first, fallback to /api/chat
      let res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal,
          body: JSON.stringify(requestBody),
        });
      }

      if (!res.ok || !res.body) {
        if (!isRetry) {
          console.warn("[chat] Request failed, auto-retrying once...");
          await new Promise((r) => setTimeout(r, 1000));
          return fetchStreamWithRetry(payloadMessages, true);
        }
        return false;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.delta) {
              assembled += parsed.delta;
              setStreamBuffer(assembled);
            } else if (parsed.error) {
              if (!isRetry) {
                return fetchStreamWithRetry(payloadMessages, true);
              }
              return false;
            }
          } catch {}
        }
      }

      if (assembled.trim()) {
        setMessages((m) => [
          ...m,
          {
            id: `msg_${Date.now()}`,
            role: "assistant",
            content: assembled,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
        setStreamBuffer("");
        return true;
      }

      if (!isRetry) {
        return fetchStreamWithRetry(payloadMessages, true);
      }
      return false;
    } catch {
      if (!ac.signal.aborted && !isRetry) {
        await new Promise((r) => setTimeout(r, 1000));
        return fetchStreamWithRetry(payloadMessages, true);
      }
      return false;
    }
  }

  async function send(textOverride?: string) {
    const textToSend = textOverride || input;
    const text = textToSend.trim();
    if ((!text && !attachedFile) || streaming) return;

    const fullContent = attachedFile ? `[Attached File: ${attachedFile}]\n${text}` : text;
    const next: Msg[] = [
      ...messages,
      {
        id: `msg_${Date.now()}`,
        role: "user",
        content: fullContent,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        attachedFile: attachedFile || undefined,
      },
    ];

    setMessages(next);
    setInput("");
    setAttachedFile(null);
    setStreaming(true);
    setStreamBuffer("");

    const success = await fetchStreamWithRetry(next);

    if (!success) {
      setMessages((m) => [
        ...m,
        {
          id: `msg_err_${Date.now()}`,
          role: "assistant",
          content: "Unable to connect to the AI service. Please try again in a moment.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isError: true,
        },
      ]);
      setStreamBuffer("");
    }

    setStreaming(false);
    abortRef.current = null;
  }

  // Pages can open the chat with a question: window.dispatchEvent(new CustomEvent("vsi:ask", { detail: { question } }))
  const sendRef = useRef(send);
  // Keep the latest send() for the event listener; updated after render, not during it.
  useEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    const onAsk = (e: Event) => {
      const question = (e as CustomEvent<{ question?: string }>).detail?.question;
      setOpen(true);
      setIsMinimized(false);
      setHasUnread(false);
      if (question) setTimeout(() => sendRef.current(question), 0);
    };
    window.addEventListener("vsi:ask", onAsk);
    return () => window.removeEventListener("vsi:ask", onAsk);
  }, []);

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
    if (streamBuffer) {
      setMessages((m) => [...m, { role: "assistant", content: streamBuffer + " …(stopped)" }]);
      setStreamBuffer("");
    }
  }

  function retryLast() {
    if (streaming) return;
    // Remove last error message if present
    setMessages((m) => (m[m.length - 1]?.isError ? m.slice(0, -1) : m));
    const lastUserMsg = [...messages].reverse().find((msg) => msg.role === "user");
    if (lastUserMsg) {
      send(lastUserMsg.content);
    }
  }

  function exportChat() {
    if (messages.length === 0) return;
    const exportText = messages.map((m) => `[${m.role.toUpperCase()} ${m.timestamp || ""}]: ${m.content}`).join("\n\n");
    const blob = new Blob([exportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vsi-ai-assistant-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Chat answers from a project's data, so it isn't offered until a project exists.
  if (!project || pathname.startsWith("/login") || pathname === "/qa" || pathname.startsWith("/r/")) return null;

  return (
    <>
      {/* Launcher: sits below drawers and dialogs (z-40) so it never covers their actions. */}
      {!open && (
        <button
          type="button"
          onClick={handleOpen}
          aria-label="Ask VSI about this project"
          className="fixed bottom-5 right-5 z-40 inline-flex h-9 items-center gap-1.5 rounded-control bg-ink px-3.5 text-caption font-medium text-white shadow-overlay transition-colors duration-150 hover:bg-ink-2"
        >
          <MessageSquareText size={15} strokeWidth={1.75} aria-hidden />
          Ask VSI
          {hasUnread && <span className="h-2 w-2 rounded-full bg-brand-light" aria-label="New reply" />}
        </button>
      )}

      {/* Floating Chat Panel (350px x 490px, Slide Up + Fade) */}
      {open && (
        <div
          className={`fixed bottom-5 right-5 z-40 w-[350px] max-w-[calc(100vw-32px)] transition-all duration-300 ${
            isMinimized ? "h-[54px]" : "h-[490px] max-h-[calc(100vh-64px)]"
          } flex flex-col rounded-panel shadow-overlay overflow-hidden border border-line bg-surface animate-in fade-in slide-in-from-bottom-5`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-line/80 text-white bg-ink select-none">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-full bg-surface/20 flex items-center justify-center text-white shrink-0 shadow-inner">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v4" />
                  <line x1="8" y1="15" x2="8" y2="15.01" strokeWidth="3" />
                  <line x1="16" y1="15" x2="16" y2="15.01" strokeWidth="3" />
                  <path d="M9 18h6" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-body font-semibold leading-tight tracking-wide text-white text-sm">Ask VSI</h3>
                  <span className="inline-flex items-center text-[11px] font-medium bg-ink/20 text-white/95 px-1.5 py-0.5 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-positive animate-pulse mr-1" />
                    Online
                  </span>
                </div>
                <p className="text-caption text-white/85 truncate font-medium text-[11px]">Scope: {label}</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {messages.length > 0 && !isMinimized && (
                <>
                  <button
                    onClick={exportChat}
                    className="text-[11px] px-1.5 py-0.5 rounded hover:bg-surface/20 transition-colors text-white/90 font-medium"
                    title="Export conversation history"
                  >
                    Export
                  </button>
                  <button
                    onClick={clearChat}
                    className="text-[11px] px-1.5 py-0.5 rounded hover:bg-surface/20 transition-colors text-white/90 font-medium"
                    title="Clear conversation"
                  >
                    Clear
                  </button>
                </>
              )}
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                aria-label={isMinimized ? "Expand" : "Minimize"}
                className="h-6 w-6 rounded hover:bg-surface/20 transition-colors flex items-center justify-center text-white/90 font-semibold"
                title={isMinimized ? "Expand" : "Minimize"}
              >
                {isMinimized ? <Maximize2 size={13} strokeWidth={1.75} aria-hidden className="inline-block shrink-0 align-[-2px]" /> : <Minus size={13} strokeWidth={1.75} aria-hidden className="inline-block shrink-0 align-[-2px]" />}
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="h-6 w-6 rounded hover:bg-surface/20 transition-colors flex items-center justify-center text-white text-base font-semibold"
                title="Close"
              >
                <X size={13} strokeWidth={1.75} aria-hidden className="inline-block shrink-0 align-[-2px]" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Messages Body */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2.5 space-y-3 bg-canvas">
                {messages.length === 0 && !streaming && (
                  <div className="space-y-3">
                    <div className="p-2.5 rounded-panel bg-brand-soft border border-line text-caption text-ink">
                      <p className="font-semibold text-ink mb-0.5 flex items-center gap-1.5 text-xs">
                        Ready to assist
                      </p>
                      <p className="text-ink-3 leading-relaxed text-[12px]">
                        I analyze live SERP data, AI Overview citations, keyword opportunities, and dashboard metrics for{" "}
                        <strong className="text-ink">{label}</strong>.
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-ink-3 mb-1.5 px-0.5">
                        Suggested AI Queries
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {FEATURE_CHIPS.map((chip) => (
                          <button
                            key={chip.label}
                            onClick={() => send(chip.prompt)}
                            className="text-left text-caption font-medium text-ink-3 hover:text-ink transition-all rounded-panel p-2 border border-line hover:border-line-strong bg-surface hover:bg-surface-2 group flex flex-col justify-between"
                          >
                            <span className="font-semibold text-ink group-hover:text-ink text-[11px] line-clamp-1">{chip.label}</span>
                            <span className="text-[10px] text-ink-3/80 line-clamp-1 mt-0.5">{chip.prompt}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Conversation Messages */}
                {messages.map((m, i) => (
                  <div key={m.id || i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} group/msg`}>
                    <div className="max-w-[90%] space-y-1">
                      {m.attachedFile && (
                        <div className="text-[11px] text-ink-3 bg-surface-2 px-2 py-0.5 rounded border border-line inline-flex items-center gap-1 mb-1">
                          <Paperclip size={12} strokeWidth={1.75} aria-hidden className="inline-block shrink-0 align-[-2px]" /> {m.attachedFile}
                        </div>
                      )}
                      <div
                        className={`rounded-panel px-3 py-2 text-xs leading-relaxed ${
                          m.role === "user"
                            ? "bg-ink text-white rounded-br-xs"
                            : m.isError
                            ? "bg-critical/10 text-critical dark:text-critical rounded-bl-xs border border-critical/30 "
                            : "bg-surface text-ink rounded-bl-xs border border-line "
                        }`}
                      >
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />

                        {/* User-friendly Retry Button for error state */}
                        {m.isError && (
                          <button
                            onClick={retryLast}
                            className="mt-2 px-2.5 py-0.5 bg-critical text-white hover:bg-critical text-[11px] font-semibold rounded-control transition-colors inline-flex items-center gap-1"
                          >
                            <RefreshCw size={12} strokeWidth={1.75} aria-hidden className="inline-block shrink-0 align-[-2px]" /> Retry connection
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between px-1">
                        {m.timestamp && <span className="text-[10px] text-ink-3/60">{m.timestamp}</span>}
                        {m.role === "assistant" && !m.isError && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => copyToClipboard(m.content, i)}
                              className="text-[10px] text-ink-3 hover:text-ink transition-colors"
                              title="Copy response"
                            >
                              {copiedIndex === i ? <><Check size={11} strokeWidth={1.75} aria-hidden className="inline-block shrink-0 align-[-2px]" /> Copied</> : <><Copy size={11} strokeWidth={1.75} aria-hidden className="inline-block shrink-0 align-[-2px]" /> Copy</>}
                            </button>
                            {i === messages.length - 1 && (
                              <button
                                onClick={retryLast}
                                className="text-[10px] text-ink-3 hover:text-ink transition-colors"
                                title="Regenerate response"
                              >
                                <RefreshCw size={11} strokeWidth={1.75} aria-hidden className="inline-block shrink-0 align-[-2px]" /> Regenerate
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {m.role === "assistant" && !m.isError && i > 0 && <ChatThumbs scopeKind={scope.kind} messageIndex={i} />}
                    </div>
                  </div>
                ))}

                {/* Typing Indicator & Streaming Buffer */}
                {streaming && (
                  <div className="flex justify-start">
                    <div className="max-w-[90%] rounded-panel rounded-bl-xs px-3 py-2 text-xs text-ink bg-surface border border-line">
                      {streamBuffer ? (
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(streamBuffer) }} />
                      ) : (
                        <div className="flex items-center gap-1.5 text-caption text-ink-3 py-0.5">
                          <span className="flex h-2 w-2 relative">
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-ink-3" />
                          </span>
                          <span className="italic font-medium text-ink text-xs">VSI AI Assistant is typing...</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Attached File Preview */}
              {attachedFile && (
                <div className="px-3 py-1 bg-surface-2/60 border-t border-line flex items-center justify-between text-[11px]">
                  <span className="text-ink-3 truncate max-w-[250px]">
                    <Paperclip size={12} strokeWidth={1.75} aria-hidden className="inline-block shrink-0 align-[-2px]" /> Attached: <strong className="text-ink">{attachedFile}</strong>
                  </span>
                  <button onClick={() => setAttachedFile(null)} className="text-ink-3 hover:text-ink font-semibold ml-2">
                    <X size={12} strokeWidth={1.75} aria-hidden className="inline-block shrink-0 align-[-2px]" />
                  </button>
                </div>
              )}

              {/* Input Footer */}
              <div className="border-t border-line px-2.5 py-2.5 bg-surface">
                <div className="flex items-end gap-1.5">
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                    title="Attach file"
                    className="h-8 w-8 rounded-panel border border-line bg-canvas hover:bg-surface-2 text-ink-3 hover:text-ink flex items-center justify-center transition-colors shrink-0"
                  >
                    <Paperclip size={14} strokeWidth={1.75} aria-hidden />
                  </button>

                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder={streaming ? "Streaming response…" : "Ask VSI Assistant..."}
                    disabled={streaming}
                    rows={1}
                    className="flex-1 resize-none rounded-panel border border-line bg-canvas px-3 py-1.5 text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:border-line-strong focus:ring-2 focus:ring-ink/10 disabled:opacity-50 max-h-24"
                  />

                  {streaming ? (
                    <button
                      onClick={stop}
                      className="h-8 px-2.5 rounded-panel bg-ink text-white text-[11px] font-semibold hover:bg-ink transition-colors shrink-0"
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={() => send()}
                      disabled={!input.trim() && !attachedFile}
                      className="h-8 px-3 rounded-panel bg-ink text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors hover:bg-ink-2 shrink-0 flex items-center gap-1"
                    >
                      Send
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-ink-3 mt-1 px-0.5">
                  Powered by VSI Search Engine · Context: {label}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
