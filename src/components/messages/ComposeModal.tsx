"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Paperclip, Send, Maximize2, Minimize2, Trash2, Link as LinkIcon, Bold, Italic, Underline, List, Check, Loader2 } from "lucide-react";
import { useMessages } from "@/contexts/MessagesContext";
import { MessagePriority, MessageAttachment, Message } from "@/lib/types/messages";

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  replyTo?: any;
  draftData?: Message | null;
}

export default function ComposeModal({ isOpen, onClose, replyTo, draftData }: ComposeModalProps) {
  const { sendMessage, saveDraft, deleteDraft } = useMessages();
  const [isMinimized, setIsMinimized] = useState(false);

  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<MessagePriority>("normal");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<MessageAttachment[]>([]);

  // Auto-save status state ("idle" | "saving" | "saved")
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [lastSavedTimeStr, setLastSavedTimeStr] = useState<string>("");

  // Validation state
  const [errors, setErrors] = useState<{ to?: string; subject?: string; body?: string }>({});

  const isInitialMount = useRef(true);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sync loaded draft or replyTo when modal opens
  useEffect(() => {
    if (!isOpen) return;

    isInitialMount.current = true;
    setSaveStatus("idle");

    if (draftData) {
      setDraftId(draftData.id);
      setTo(typeof draftData.recipient === "string" ? draftData.recipient : (draftData.recipient?.email || ""));
      setCc(draftData.cc || "");
      setBcc(draftData.bcc || "");
      setSubject(draftData.subject || "");
      setBody(draftData.body || "");
      setPriority(draftData.priority || "normal");
      setAttachedFiles(draftData.attachments || []);
      if (draftData.cc || draftData.bcc) setShowCcBcc(true);
      if (draftData.lastSaved) {
        setLastSavedTimeStr(new Date(draftData.lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        setSaveStatus("saved");
      }
    } else if (replyTo) {
      setDraftId(undefined);
      setTo(replyTo.sender?.email || "");
      setSubject(replyTo.subject ? (replyTo.subject.startsWith("Re:") ? replyTo.subject : `Re: ${replyTo.subject}`) : "");
      setBody("");
      setCc("");
      setBcc("");
      setPriority("normal");
      setAttachedFiles([]);
    } else {
      setDraftId(undefined);
      setTo("");
      setCc("");
      setBcc("");
      setSubject("");
      setBody("");
      setPriority("normal");
      setAttachedFiles([]);
      setShowCcBcc(false);
    }
    setErrors({});

    // Allow auto-save after initial setup
    setTimeout(() => {
      isInitialMount.current = false;
    }, 300);
  }, [isOpen, replyTo, draftData]);

  // Execute Auto Save
  const triggerAutoSave = useCallback(async () => {
    if (!to.trim() && !subject.trim() && !body.trim()) return;

    setSaveStatus("saving");
    try {
      const savedId = await saveDraft({
        id: draftId,
        to: to.trim(),
        cc: cc.trim(),
        bcc: bcc.trim(),
        subject: subject.trim(),
        body: body.trim(),
        priority,
        attachments: attachedFiles,
      });

      // Adopt the server's id (a new draft, or one re-created after it went missing).
      if (savedId && savedId !== draftId) {
        setDraftId(savedId);
      }
      setLastSavedTimeStr(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setSaveStatus("saved");
    } catch {
      setSaveStatus("idle");
    }
  }, [draftId, to, cc, bcc, subject, body, priority, attachedFiles, saveDraft]);

  // Auto-Save Strategy 1: Every 5 seconds interval
  useEffect(() => {
    if (!isOpen) return;

    autoSaveIntervalRef.current = setInterval(() => {
      if (!isInitialMount.current && (to.trim() || subject.trim() || body.trim())) {
        triggerAutoSave();
      }
    }, 5000);

    return () => {
      if (autoSaveIntervalRef.current) clearInterval(autoSaveIntervalRef.current);
    };
  }, [isOpen, to, subject, body, triggerAutoSave]);

  // Auto-Save Strategy 2: 2 seconds after typing stops (debounced)
  const handleContentChange = (field: "to" | "subject" | "body" | "cc" | "bcc", val: string) => {
    if (field === "to") setTo(val);
    if (field === "cc") setCc(val);
    if (field === "bcc") setBcc(val);
    if (field === "subject") setSubject(val);
    if (field === "body") setBody(val);

    if (errors[field as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }

    if (!isInitialMount.current) {
      setSaveStatus("saving");
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        triggerAutoSave();
      }, 2000);
    }
  };

  if (!isOpen) return null;

  const validate = () => {
    const newErrors: { to?: string; subject?: string; body?: string } = {};
    if (!to.trim()) {
      newErrors.to = "Recipient email is required.";
    } else if (!/\S+@\S+\.\S+/.test(to.trim()) && !to.includes("@")) {
      newErrors.to = "Please enter a valid recipient email address.";
    }

    if (!subject.trim()) {
      newErrors.subject = "Subject is required.";
    }

    if (!body.trim()) {
      newErrors.body = "Message body cannot be empty.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSend = async () => {
    if (!validate()) return;

    await sendMessage({
      id: draftId,
      to: to.trim(),
      cc: cc.trim(),
      bcc: bcc.trim(),
      subject: subject.trim(),
      body: body.trim(),
      priority,
      attachments: attachedFiles,
    });

    onClose();
  };

  const handleDiscard = async () => {
    if (draftId) {
      await deleteDraft(draftId);
    }
    onClose();
  };

  const handleCloseSave = async () => {
    if (to.trim() || subject.trim() || body.trim()) {
      await triggerAutoSave();
    }
    onClose();
  };

  const applyFormat = (formatType: string) => {
    if (formatType === "bold") setBody((b) => b + " **bold text** ");
    if (formatType === "italic") setBody((b) => b + " *italic text* ");
    if (formatType === "underline") setBody((b) => b + " <u>underlined text</u> ");
    if (formatType === "list") setBody((b) => b + "\n- Item 1\n- Item 2\n");
    if (formatType === "link") setBody((b) => b + " [Link Title](https://example.com) ");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const newAtt: MessageAttachment = {
        id: `att_${Date.now()}`,
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        type: file.type || "file",
        url: "#",
      };
      setAttachedFiles((prev) => [...prev, newAtt]);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
          height: isMinimized ? "52px" : "auto",
        }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        className="fixed bottom-0 right-4 sm:right-12 z-50 w-full max-w-[680px] bg-surface border border-line rounded-t-[20px] shadow-overlay flex flex-col overflow-hidden text-ink"
        style={{ maxHeight: isMinimized ? "52px" : "85vh" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-surface-2 border-b border-line cursor-pointer select-none"
          onClick={() => setIsMinimized(!isMinimized)}
        >
          <div className="flex items-center gap-3 font-semibold text-body text-ink">
            <span className="h-2.5 w-2.5 rounded-full bg-ink" />
            <span>{draftId ? "Edit Draft" : "New Message"}</span>

            {/* Auto Save Status Indicator */}
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1 text-caption text-brand-strong font-medium px-2 py-0.5 rounded-full bg-brand-soft border border-line">
                <Loader2 size={12} className="animate-spin" /> Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-caption text-positive font-medium px-2 py-0.5 rounded-full bg-positive/10 border border-positive/30">
                <Check size={12} /> Saved {lastSavedTimeStr ? `at ${lastSavedTimeStr}` : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(!isMinimized);
              }}
              className="p-1.5 hover:bg-surface rounded-control transition-colors text-ink-3 hover:text-ink"
              title={isMinimized ? "Expand" : "Minimize"}
            >
              {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCloseSave();
              }}
              className="p-1.5 hover:bg-critical/10 rounded-control hover:text-critical transition-colors text-ink-3"
              title="Close & Save Draft"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Form Body */}
        {!isMinimized && (
          <div className="flex flex-col flex-1 overflow-y-auto bg-surface">
            {/* Priority & Recipient To Field */}
            <div className="border-b border-line px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-3 text-body font-semibold w-16">To</span>
                <input
                  type="text"
                  value={to}
                  onChange={(e) => handleContentChange("to", e.target.value)}
                  className="flex-1 bg-transparent outline-none text-body text-ink placeholder:text-ink-3/60 font-medium"
                  placeholder="recipient@example.com"
                />

                {/* Priority Selector */}
                <select
                  value={priority}
                  onChange={(e) => {
                    setPriority(e.target.value as MessagePriority);
                    triggerAutoSave();
                  }}
                  className="text-caption bg-surface-2 border border-line rounded-control px-2 py-1 outline-none text-ink font-semibold cursor-pointer"
                >
                  <option value="normal">Normal Priority</option>
                  <option value="high">High Priority</option>
                  <option value="low">Low Priority</option>
                </select>

                <button
                  type="button"
                  onClick={() => setShowCcBcc(!showCcBcc)}
                  className="text-caption font-semibold text-brand-strong hover:underline ml-1"
                >
                  {showCcBcc ? "Hide Cc/Bcc" : "Cc/Bcc"}
                </button>
              </div>
              {errors.to && <p className="text-caption text-critical font-semibold mt-1 pl-16">{errors.to}</p>}
            </div>

            {/* Optional Cc / Bcc */}
            {showCcBcc && (
              <>
                <div className="flex items-center border-b border-line px-4 py-2.5">
                  <span className="text-ink-3 text-body font-semibold w-16">Cc</span>
                  <input
                    type="text"
                    value={cc}
                    onChange={(e) => handleContentChange("cc", e.target.value)}
                    className="flex-1 bg-transparent outline-none text-body text-ink placeholder:text-ink-3/60"
                    placeholder="cc@example.com"
                  />
                </div>
                <div className="flex items-center border-b border-line px-4 py-2.5">
                  <span className="text-ink-3 text-body font-semibold w-16">Bcc</span>
                  <input
                    type="text"
                    value={bcc}
                    onChange={(e) => handleContentChange("bcc", e.target.value)}
                    className="flex-1 bg-transparent outline-none text-body text-ink placeholder:text-ink-3/60"
                    placeholder="bcc@example.com"
                  />
                </div>
              </>
            )}

            {/* Subject Field */}
            <div className="border-b border-line px-4 py-3">
              <div className="flex items-center">
                <span className="text-ink-3 text-body font-semibold w-16">Subject</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => handleContentChange("subject", e.target.value)}
                  className="flex-1 bg-transparent outline-none text-body font-semibold text-ink placeholder:text-ink-3/60"
                  placeholder="Subject"
                />
              </div>
              {errors.subject && <p className="text-caption text-critical font-semibold mt-1 pl-16">{errors.subject}</p>}
            </div>

            {/* Message Body Textarea */}
            <div className="flex-1 flex flex-col p-4 min-h-[260px]">
              <textarea
                value={body}
                onChange={(e) => handleContentChange("body", e.target.value)}
                className="flex-1 min-h-[240px] bg-transparent outline-none text-body text-ink placeholder:text-ink-3/60 resize-none leading-relaxed"
                placeholder="Write your message..."
              />
              {errors.body && <p className="text-caption text-critical font-semibold mt-1">{errors.body}</p>}
            </div>

            {/* Attached Files List */}
            {attachedFiles.length > 0 && (
              <div className="px-4 py-2 bg-surface-2/50 border-t border-line flex flex-wrap gap-2">
                {attachedFiles.map((att) => (
                  <span
                    key={att.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-surface border border-line text-caption text-ink font-medium"
                  >
                    📎 {att.name} ({att.size})
                    <button
                      onClick={() => {
                        setAttachedFiles((prev) => prev.filter((a) => a.id !== att.id));
                        triggerAutoSave();
                      }}
                      className="ml-1 text-ink-3 hover:text-critical font-semibold"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Formatting Toolbar & Action Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface-2 border-t border-line">
              <div className="flex items-center gap-1 text-ink-3">
                <button
                  type="button"
                  onClick={() => applyFormat("bold")}
                  className="p-2 hover:bg-surface hover:text-ink rounded-control transition-colors"
                  title="Bold"
                >
                  <Bold size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat("italic")}
                  className="p-2 hover:bg-surface hover:text-ink rounded-control transition-colors"
                  title="Italic"
                >
                  <Italic size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat("underline")}
                  className="p-2 hover:bg-surface hover:text-ink rounded-control transition-colors"
                  title="Underline"
                >
                  <Underline size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat("list")}
                  className="p-2 hover:bg-surface hover:text-ink rounded-control transition-colors"
                  title="Bullet List"
                >
                  <List size={16} />
                </button>

                <div className="w-px h-4 bg-border mx-1" />

                <label className="p-2 hover:bg-surface hover:text-ink rounded-control transition-colors cursor-pointer" title="Attach File">
                  <Paperclip size={16} />
                  <input type="file" onChange={handleFileUpload} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={() => applyFormat("link")}
                  className="p-2 hover:bg-surface hover:text-ink rounded-control transition-colors"
                  title="Insert Link"
                >
                  <LinkIcon size={16} />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="px-4 py-2 text-caption font-semibold text-ink-3 hover:text-critical hover:bg-critical/10 rounded-control transition-colors flex items-center gap-1.5"
                  title="Discard draft"
                >
                  <Trash2 size={15} /> Discard
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  className="flex items-center gap-2 px-6 py-2.5 bg-ink hover:bg-ink-2 text-white font-semibold text-body rounded-control transition-all"
                >
                  <Send size={15} />
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
