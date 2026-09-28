"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from "react";
import { Message, MessageFolder, ComposeDraft, ToastPayload } from "@/lib/types/messages";
import { coalesce } from "@/lib/coalesce";

interface MessagesContextProps {
  messages: Message[];
  isLoading: boolean;
  activeFolder: MessageFolder;
  setActiveFolder: (folder: MessageFolder) => void;
  unreadCount: number;
  draftsCount: number;
  archivedCount: number;
  toastMessage: ToastPayload;
  setToastMessage: (msg: ToastPayload) => void;
  refreshMessages: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAsUnread: (id: string) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  moveToFolder: (id: string, folder: MessageFolder) => Promise<void>;
  archiveMessage: (id: string) => Promise<void>;
  moveToInbox: (id: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  deleteDraft: (id: string) => Promise<void>;
  deletePermanently: (id: string) => Promise<void>;
  restoreMessage: (id: string, folder?: MessageFolder) => Promise<void>;
  updateMessageLabels: (id: string, labels: string[]) => Promise<void>;
  updateMessage: (id: string, updates: Partial<Message>) => Promise<void>;
  /** Stores the message in Sent (no email is delivered). Resolves false if it wasn't stored. */
  sendMessage: (draft: ComposeDraft) => Promise<boolean>;
  /** Why the last load failed, or null. */
  loadError: string | null;
  saveDraft: (draft: ComposeDraft) => Promise<string | undefined>;
  editingDraft: Message | null;
  setEditingDraft: (msg: Message | null) => void;
}

const MessagesContext = createContext<MessagesContextProps | undefined>(undefined);

export function MessagesProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeFolder, setActiveFolder] = useState<MessageFolder>("inbox");
  const [toastMessage, setToastMessage] = useState<ToastPayload>(null);
  const [editingDraft, setEditingDraft] = useState<Message | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  const flash = useCallback((msg: ToastPayload, ms = 3000) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), ms);
  }, []);

  // Fetch the signed-in user's messages. A failure is reported, never replaced with other data.
  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/messages", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && Array.isArray(json.messages)) {
        setMessages(json.messages);
        setLoadError(null);
      } else {
        if (res.status === 401) setMessages([]);
        setLoadError(json.error || "Messages couldn't be loaded.");
      }
    } catch (e) {
      console.error("Failed to fetch messages from API", e);
      setLoadError("Messages couldn't be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Overlapping refreshes (the timer, focus, a save) share one request.
  const refreshMessages = useMemo(() => coalesce(loadMessages), [loadMessages]);

  useEffect(() => {
    refreshMessages();
    // Auto sync every 15 seconds for realtime multi-device sync, while the tab is visible.
    // A hidden tab stops polling and catches up as soon as it's shown again.
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!interval) interval = setInterval(refreshMessages, 15000);
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        refreshMessages();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshMessages]);

  const unreadCount = messages.filter(m => m.status === "unread" && m.folder === "inbox").length;
  const draftsCount = messages.filter(m => m.folder === "drafts").length;
  const archivedCount = messages.filter(m => m.folder === "archived").length;

  /** PATCH one message. Returns the stored message, or null (with an error toast) if it wasn't saved. */
  const patchMessage = async (id: string, updates: Record<string, unknown>): Promise<Message | null> => {
    try {
      const res = await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && json.message) return json.message as Message;
      flash(`That change wasn't saved: ${json.error || "please try again."}`, 4000);
    } catch {
      flash("That change wasn't saved: please try again.", 4000);
    }
    // Undo the optimistic change by reloading what is really stored.
    void refreshMessages();
    return null;
  };

  const removeMessage = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/messages?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) return true;
      flash(`That message wasn't deleted: ${json.error || "please try again."}`, 4000);
    } catch {
      flash("That message wasn't deleted: please try again.", 4000);
    }
    void refreshMessages();
    return false;
  };

  const markAsRead = async (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status: "read", updatedAt: new Date().toISOString() } : m));
    await patchMessage(id, { status: "read" });
  };

  const markAsUnread = async (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status: "unread", updatedAt: new Date().toISOString() } : m));
    await patchMessage(id, { status: "unread" });
  };

  const toggleStar = async (id: string) => {
    const target = messages.find(m => m.id === id);
    if (!target) return;
    const newStar = !target.isStarred;
    setMessages(prev => prev.map(m => m.id === id ? { ...m, isStarred: newStar, updatedAt: new Date().toISOString() } : m));
    await patchMessage(id, { isStarred: newStar });
  };

  const moveToFolderSaved = async (id: string, folder: MessageFolder): Promise<boolean> => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, folder, updatedAt: new Date().toISOString() } : m));
    return (await patchMessage(id, { folder })) !== null;
  };

  const moveToFolder = async (id: string, folder: MessageFolder) => {
    await moveToFolderSaved(id, folder);
  };

  const archiveMessage = async (id: string) => {
    if (await moveToFolderSaved(id, "archived")) flash("Message moved to Archive");
  };

  const moveToInbox = async (id: string) => {
    if (await moveToFolderSaved(id, "inbox")) flash("Message moved to Inbox");
  };

  const deleteMessage = async (id: string) => {
    await moveToFolderSaved(id, "trash");
  };

  const deleteDraft = async (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
    if (await removeMessage(id)) flash("Draft discarded.");
  };

  const deletePermanently = async (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
    await removeMessage(id);
  };

  const restoreMessage = async (id: string, folder: MessageFolder = "inbox") => {
    await moveToFolder(id, folder);
  };

  const updateMessageLabels = async (id: string, labels: string[]) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, labels, updatedAt: new Date().toISOString() } : m));
    await patchMessage(id, { labels });
  };

  const updateMessage = async (id: string, updates: Partial<Message>) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates, updatedAt: new Date().toISOString() } : m));
    await patchMessage(id, updates as Record<string, unknown>);
  };

  /**
   * Stores the message in Sent. VSI has no email delivery, so nothing reaches the recipient;
   * the toast says so. Returns false (and keeps any draft) if it couldn't be stored.
   */
  const sendMessage = async (draft: ComposeDraft): Promise<boolean> => {
    const keptDraft = draft.id ? " Your draft is still in Drafts." : "";
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: draft.to,
          cc: draft.cc,
          bcc: draft.bcc,
          subject: draft.subject || "(No Subject)",
          body: draft.body,
          priority: draft.priority || "normal",
          attachments: draft.attachments || [],
          folder: "sent",
          status: "read",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success || !json.message) {
        flash(`Your message wasn't saved: ${json.error || "please try again."}${keptDraft}`, 5000);
        return false;
      }
      const stored = json.message as Message;
      setMessages(prev => [stored, ...prev.filter(m => m.id !== stored.id && (!draft.id || m.id !== draft.id))]);
      // Only once the message is stored is the draft removed.
      if (draft.id) await removeMessage(draft.id);
      setActiveFolder("sent");
      flash("Saved to Sent. VSI doesn't send email yet, so it was not delivered to the recipient.", 5000);
      return true;
    } catch {
      flash(`Your message wasn't saved: please try again.${keptDraft}`, 5000);
      return false;
    }
  };

  /** Saves a draft. Throws if it wasn't stored, so the composer never shows "Saved" for it. */
  const saveDraft = async (draft: ComposeDraft): Promise<string | undefined> => {
    if (!draft.to && !draft.subject && !draft.body) return undefined;

    // The server assigns ids: a new draft is POSTed without one and adopts the id that comes back.
    // PATCH carries the existing id so the server can find the user's own row.
    const fields = {
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      body: draft.body,
      priority: draft.priority || "normal",
      attachments: draft.attachments || [],
      folder: "drafts",
      status: "draft",
    };
    const send = (method: "POST" | "PATCH") =>
      fetch("/api/messages", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "PATCH" ? { id: draft.id, ...fields } : fields),
      });

    let res = await send(draft.id ? "PATCH" : "POST");
    // Not stored yet (an earlier save failed): create it.
    if (draft.id && res.status === 404) res = await send("POST");
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success || !json.message) {
      throw new Error(json.error || "Draft wasn't saved.");
    }
    const stored = json.message as Message;
    // If the draft was re-created it has a new server id: drop any copy under the old one.
    setMessages(prev => [stored, ...prev.filter(m => m.id !== stored.id && (!draft.id || m.id !== draft.id))]);
    return stored.id;
  };

  return (
    <MessagesContext.Provider value={{
      messages,
      isLoading,
      activeFolder,
      setActiveFolder,
      unreadCount,
      draftsCount,
      archivedCount,
      toastMessage,
      setToastMessage,
      refreshMessages,
      markAsRead,
      markAsUnread,
      toggleStar,
      moveToFolder,
      archiveMessage,
      moveToInbox,
      deleteMessage,
      deleteDraft,
      deletePermanently,
      restoreMessage,
      updateMessageLabels,
      updateMessage,
      sendMessage,
      saveDraft,
      loadError,
      editingDraft,
      setEditingDraft,
    }}>
      {children}
    </MessagesContext.Provider>
  );
}

export function useMessages() {
  const context = useContext(MessagesContext);
  if (context === undefined) {
    throw new Error("useMessages must be used within a MessagesProvider");
  }
  return context;
}
