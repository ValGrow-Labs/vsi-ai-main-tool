"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from "react";
import { coalesce } from "@/lib/coalesce";
import { isDummySupabaseUrl } from "@/lib/auth-rules";

export type NotificationType = 'alert' | 'system' | 'report' | 'user';
export type NotificationSeverity = 'high' | 'medium' | 'low' | 'info';

export interface Notification {
  id: string;
  slug: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  fullDetails: string;
  timestamp: string;
  isRead: boolean;
  relatedClient?: string;
  aiEngine?: string;
  recommendedActions: string[];
  createdAt?: string;
}

interface NotificationsContextType {
  notifications: Notification[];
  isLoading: boolean;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  /** Resolves true only when the server confirmed the delete. */
  clearAllNotifications: () => Promise<boolean>;
  createNotification: (data: Partial<Notification>) => Promise<void>;
  refreshNotifications: () => Promise<void>;
  getNotificationBySlug: (slug: string) => Notification | undefined;
  unreadCount: number;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const STORAGE_KEY = "enterprise_user_notifications";
const CLEARED_KEY = "enterprise_notifications_cleared";

export function NotificationsProvider({ children, userId }: { children: ReactNode; userId?: string | null }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Sync state with localStorage & DB
  const syncState = useCallback((newList: Notification[], clearedFlag?: boolean) => {
    setNotifications(newList);
    if (typeof window !== "undefined") {
      if (clearedFlag === true) {
        localStorage.setItem(CLEARED_KEY, "true");
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      } else {
        if (newList.length > 0) {
          localStorage.removeItem(CLEARED_KEY);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
      }
    }
  }, []);

  // Fetch notifications from database API
  const loadNotifications = useCallback(async () => {
    try {
      const isClearedLocally = typeof window !== "undefined" && localStorage.getItem(CLEARED_KEY) === "true";
      
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.notifications)) {
          if (data.notifications.length === 0 && isClearedLocally) {
            syncState([], true);
          } else {
            // Map server model to client notification interface
            const mapped: Notification[] = data.notifications.map((n: any) => ({
              id: n.id,
              slug: n.slug || `notif-${n.id}`,
              type: n.type || 'system',
              severity: n.severity || n.priority || 'info',
              title: n.title,
              message: n.message || n.description || '',
              fullDetails: n.fullDetails || n.message || '',
              timestamp: n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
              isRead: Boolean(n.isRead),
              relatedClient: n.relatedClient || '',
              aiEngine: n.aiEngine || '',
              recommendedActions: n.recommendedActions || [],
              createdAt: n.createdAt || new Date().toISOString(),
            }));
            
            if (isClearedLocally && mapped.length === 0) {
              syncState([], true);
            } else {
              syncState(mapped);
            }
          }
        }
      } else if (typeof window !== "undefined") {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
          try {
            setNotifications(JSON.parse(local));
          } catch {}
        }
      }
    } catch {
      if (typeof window !== "undefined") {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
          try {
            setNotifications(JSON.parse(local));
          } catch {}
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [syncState]);

  // One change can arrive as many Realtime events (mark all read updates every row). Overlapping
  // refreshes share one request plus one follow-up, so the list still ends up current.
  const fetchNotifications = useMemo(() => coalesce(loadNotifications), [loadNotifications]);

  // Initial Load & Realtime setup
  useEffect(() => {
    fetchNotifications();

    // A placeholder project has no Realtime server to connect to.
    if (isDummySupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)) return;

    // Set up Realtime listener using Supabase JS client. The client is loaded after the page is
    // up, so it stays out of the JavaScript every page loads first.
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    import("@/lib/supabase/client")
      .then(({ createClient }) => {
        if (cancelled) return;
        try {
          const supabase = createClient();
          const channel = supabase.channel("realtime:notifications");
          if (userId) {
            // The list only shows this user's rows, so only their inserts and updates need a refresh.
            // Postgres can't filter DELETE events, so deletes stay unfiltered as before.
            const own = `user_id=eq.${userId}`;
            channel
              .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: own }, () => { fetchNotifications(); })
              .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: own }, () => { fetchNotifications(); })
              .on("postgres_changes", { event: "DELETE", schema: "public", table: "notifications" }, () => { fetchNotifications(); });
          } else {
            channel.on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => { fetchNotifications(); });
          }
          channel.subscribe();
          unsubscribe = () => { supabase.removeChannel(channel); };
        } catch {}
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [fetchNotifications, userId]);

  // Custom event listener for instant local cross-component dispatch
  useEffect(() => {
    const handleNewNotifEvent = () => {
      fetchNotifications();
    };
    window.addEventListener("new-notification-created", handleNewNotifEvent);
    return () => window.removeEventListener("new-notification-created", handleNewNotifEvent);
  }, [fetchNotifications]);

  // Permanent Clear All from DB and state
  const clearAllNotifications = async () => {
    // 1. Optimistically clear local state and set cleared flag
    syncState([], true);

    // 2. Call DELETE /api/notifications API to purge DB rows permanently.
    // On failure, reload what the server still has instead of pretending.
    try {
      const res = await fetch("/api/notifications", { method: "DELETE" });
      if (res.ok) return true;
    } catch (e) {
      console.error("Failed to delete notifications on server:", e);
    }
    await fetchNotifications();
    return false;
  };

  // Delete single notification
  const deleteNotification = async (id: string) => {
    const updated = notifications.filter(n => n.id !== id);
    syncState(updated, updated.length === 0);

    try {
      await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    } catch {}
  };

  // Mark single as read
  const markAsRead = async (id: string) => {
    const updated = notifications.map(n => n.id === id ? { ...n, isRead: true } : n);
    syncState(updated);

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isRead: true })
      });
    } catch {}
  };

  // Mark all as read
  const markAllAsRead = async () => {
    const updated = notifications.map(n => ({ ...n, isRead: true }));
    syncState(updated);

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-all-read" })
      });
    } catch {}
  };

  // Create a new notification dynamically
  const createNotification = async (data: Partial<Notification>) => {
    const now = new Date();
    const newNotif: Notification = {
      id: data.id || `notif_${Date.now()}`,
      slug: data.slug || `notif-${Date.now()}`,
      type: data.type || 'system',
      severity: data.severity || 'info',
      title: data.title || "New Notification",
      message: data.message || "",
      fullDetails: data.fullDetails || data.message || "",
      timestamp: "Just now",
      isRead: false,
      relatedClient: data.relatedClient || "",
      aiEngine: data.aiEngine || "",
      recommendedActions: data.recommendedActions || [],
      createdAt: now.toISOString(),
    };

    if (typeof window !== "undefined") {
      localStorage.removeItem(CLEARED_KEY);
    }
    const updated = [newNotif, ...notifications];
    syncState(updated);

    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newNotif),
      });
    } catch {}
  };

  const getNotificationBySlug = (slug: string) => {
    return notifications.find(n => n.slug === slug);
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <NotificationsContext.Provider value={{
      notifications,
      isLoading,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      clearAllNotifications,
      createNotification,
      refreshNotifications: fetchNotifications,
      getNotificationBySlug,
      unreadCount
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}
