"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useNotifications } from "@/contexts/NotificationsContext";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, AlertCircle, FileText, UserPlus, Check, Trash2, Archive, Download, ExternalLink, ChevronRight, Info } from "lucide-react";
import Link from "next/link";

export default function NotificationDetailsPage() {
  const { slug } = useParams() as { slug: string };
  const router = useRouter();
  const { getNotificationBySlug, markAsRead, deleteNotification } = useNotifications();
  
  const notification = getNotificationBySlug(slug);
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    if (notification && !notification.isRead) {
      markAsRead(notification.id);
    }
  }, [notification, markAsRead]);

  if (!notification) {
    return (
      <div className="p-4 sm:p-8 max-w-[1200px] mx-auto min-h-[calc(100vh-64px)] flex flex-col items-center justify-center animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-surface-2 rounded-full flex items-center justify-center mb-6">
          <Bell className="text-ink-3 w-10 h-10" />
        </div>
        <h1 className="text-display font-semibold text-ink mb-2">Notification Not Found</h1>
        <p className="text-ink-3 mb-6 text-center max-w-md">
          The notification you're looking for might have been deleted or never existed.
        </p>
        <button 
          onClick={() => router.push("/dashboard/notifications")}
          className="px-6 py-2 bg-ink hover:bg-ink-2 text-white font-semibold rounded-control transition-all"
        >
          Return to Notifications
        </button>
      </div>
    );
  }

  const handleNavigateBack = () => {
    setIsNavigating(true);
    router.push("/dashboard/notifications");
  };

  const handleDelete = () => {
    setIsNavigating(true);
    deleteNotification(notification.id);
    router.push("/dashboard/notifications");
  };

  const handleResolve = async () => {
    setIsNavigating(true);
    
    try {
      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notificationId: notification.id,
          title: notification.title,
          message: notification.message,
          details: notification.fullDetails,
        }),
      });
      
      const data = await response.json().catch(() => ({}));
      
      // Keep the notification unless a real suggestion came back: nothing was resolved otherwise.
      if (response.ok && data.resolution) {
        alert("AI suggestion: " + data.resolution);
        deleteNotification(notification.id);
        router.push("/dashboard/notifications");
        return;
      }
      alert("Couldn't get an AI suggestion: " + (data.error || "the AI service didn't answer."));
    } catch (error) {
      console.error("Failed to resolve:", error);
      alert("Couldn't get an AI suggestion. Please try again.");
    }
    setIsNavigating(false);
  };

  const handleActionClick = (action: string) => {
    setIsNavigating(true);
    switch (action) {
      case "Open Visibility Analytics":
        router.push("/dashboard/analytics");
        break;
      case "Review Keyword Gap Analysis":
        router.push("/dashboard/analytics?tab=keyword-gap");
        break;
      case "Open Reports Module":
        router.push("/dashboard/reports");
        break;
      case "Download PDF Summary":
        // Simulate a download action, could point to an API endpoint later
        router.push("/dashboard/reports");
        break;
      case "Open System Status":
        router.push("/dashboard/system-status");
        break;
      case "Open Client Profile":
        const clientSlug = notification.relatedClient?.toLowerCase().replace(/\s+/g, '-') || '';
        router.push(`/dashboard/clients/${clientSlug}`);
        break;
      case "Open API Settings":
        router.push("/dashboard/settings");
        break;
      case "Open Competitor Benchmark":
        router.push("/dashboard/competitors");
        break;
      default:
        setIsNavigating(false);
        break;
    }
  };

  
  // Icon and Color mappings
  const getTypeConfig = (type: string) => {
    switch(type) {
      case 'alert': return { icon: AlertCircle, color: 'text-critical', bg: 'bg-critical/10 border-critical/30' };
      case 'system': return { icon: Info, color: 'text-brand-strong', bg: 'bg-brand-soft border-line' };
      case 'report': return { icon: FileText, color: 'text-primary', bg: 'bg-primary/10 border-primary/20' };
      case 'user': return { icon: UserPlus, color: 'text-positive', bg: 'bg-positive/10 border-positive/30' };
      default: return { icon: Bell, color: 'text-info', bg: 'bg-info/10 border-info/30' };
    }
  };
  
  const getSeverityBadge = (severity: string) => {
    switch(severity) {
      case 'high': return <span className="px-2 py-0.5 text-caption font-semibold rounded-full bg-critical/10 text-critical border border-critical/30">High</span>;
      case 'medium': return <span className="px-2 py-0.5 text-caption font-semibold rounded-full bg-brand-soft text-brand-strong border border-line">Medium</span>;
      case 'low': return <span className="px-2 py-0.5 text-caption font-semibold rounded-full bg-info/10 text-info border border-info/30">Low</span>;
      case 'info': return <span className="px-2 py-0.5 text-caption font-semibold rounded-full bg-positive/10 text-positive border border-positive/30">Info</span>;
      default: return null;
    }
  };

  const typeConfig = getTypeConfig(notification.type);
  const Icon = typeConfig.icon;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1, duration: 0.3 } }
  };
  
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
  };

  const scaleVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } }
  };

  return (
    <div className="p-4 sm:p-8 max-w-[1000px] mx-auto font-sans transition-colors bg-canvas min-h-[calc(100vh-64px)]">
      
      {/* Loading Overlay */}
      {isNavigating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/50 ">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <p className="text-body font-semibold text-ink">Navigating...</p>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-2 text-caption font-semibold text-ink-3 mb-6"
      >
        <Link href="/dashboard" className="hover:text-ink transition-colors">Dashboard</Link>
        <ChevronRight size={14} />
        <Link href="/dashboard/notifications" className="hover:text-ink transition-colors">Notifications</Link>
        <ChevronRight size={14} />
        <span className="text-ink">Notification Details</span>
      </motion.div>

      {/* Main Content */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-6"
      >
        {/* Header Actions */}
        <motion.div variants={itemVariants} className="flex items-center justify-between">
          <button 
            onClick={handleNavigateBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-control hover:bg-surface-2 text-ink-3 hover:text-ink transition-colors text-body font-semibold"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <div className="flex items-center gap-2">
            <button 
              className="p-2 rounded-full hover:bg-surface-2 text-ink-3 hover:text-ink transition-colors border border-transparent hover:border-line"
              title="Archive Notification"
            >
              <Archive size={16} />
            </button>
            <button 
              onClick={handleDelete}
              className="p-2 rounded-full hover:bg-critical/10 text-ink-3 hover:text-critical transition-colors border border-transparent hover:border-critical/30"
              title="Delete Notification"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </motion.div>

        {/* Hero Card */}
        <motion.div 
          variants={scaleVariants}
          className="relative bg-surface border border-line/80 rounded-panel p-6 sm:p-8 overflow-hidden"
        >
          {/* Background Gradient Effect */}
          <div className={`absolute top-0 right-0 w-64 h-64 opacity-5 blur-[100px] rounded-full ${typeConfig.bg.split(' ')[0]}`} />
          
          <div className="relative z-10 flex flex-col md:flex-row gap-6">
            <div className={`shrink-0 w-16 h-16 rounded-panel border flex items-center justify-center shadow-inner ${typeConfig.bg}`}>
              <Icon size={28} className={typeConfig.color} />
            </div>
            
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                {getSeverityBadge(notification.severity)}
                <span className="px-2 py-0.5 text-caption font-semibold rounded-full bg-surface-2 text-ink-3 border border-line">
                  {notification.type}
                </span>
                <span className="text-caption font-semibold text-ink-3 ml-auto">
                  {notification.timestamp}
                </span>
              </div>
              
              <h1 className="text-display font-semibold text-ink mb-3 leading-tight">
                {notification.title}
              </h1>
              
              <p className="text-base sm:text-lg text-ink/80 font-medium mb-6 leading-relaxed">
                {notification.message}
              </p>
              
              <div className="p-4 rounded-panel bg-surface-2 border border-line/60 text-body text-ink/90 leading-relaxed shadow-inner">
                {notification.fullDetails}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Details & Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Metadata Sidebar */}
          <motion.div variants={itemVariants} className="col-span-1 flex flex-col gap-4">
            <div className="bg-surface border border-line/80 rounded-panel p-5">
              <h3 className="text-caption font-semibold text-ink-3 mb-4">Metadata</h3>
              <div className="space-y-4">
                {notification.relatedClient && (
                  <div>
                    <p className="text-caption text-ink-3 font-semibold mb-1">Related Client</p>
                    <p className="text-body font-semibold text-ink">{notification.relatedClient}</p>
                  </div>
                )}
                {notification.aiEngine && (
                  <div>
                    <p className="text-caption text-ink-3 font-semibold mb-1">AI Engine</p>
                    <p className="text-body font-semibold text-ink">{notification.aiEngine}</p>
                  </div>
                )}
                <div>
                  <p className="text-caption text-ink-3 font-semibold mb-1">Status</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className={`w-2 h-2 rounded-full ${notification.isRead ? "bg-ink-3" : "bg-positive"}`} />
                    <p className={`text-body font-semibold ${notification.isRead ? "text-ink-2" : "text-positive"}`}>{notification.isRead ? "Read" : "Unread"}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Recommended Actions */}
          <motion.div variants={itemVariants} className="col-span-1 md:col-span-2 flex flex-col gap-4">
            <div className="bg-surface border border-line/80 rounded-panel p-5 h-full flex flex-col">
              <h3 className="text-caption font-semibold text-ink-3 mb-4">Recommended Actions</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-auto mb-auto">
                {notification.recommendedActions.map((action, index) => {
                  // Determine icon and color based on action text (simulated logic)
                  const isPrimary = index === 0;
                  return (
                    <button
                      key={index}
                      onClick={() => handleActionClick(action)}
                      className={`flex items-center justify-between p-3 rounded-panel border transition-all duration-200 group ${
                        isPrimary 
                          ? 'bg-ink hover:bg-ink-2 border-line text-white '
                          : 'bg-surface-2 hover:bg-surface border-line hover:border-line text-ink '
                      }`}
                    >
                      <span className="text-body font-semibold">{action}</span>
                      <ExternalLink size={16} className={`transition-transform group-hover:translate-x-1 group- ${isPrimary ? 'text-white' : 'text-ink-3'}`} />
                    </button>
                  );
                })}

                {/* Always provide a download report if it's a report */}
                {notification.type === 'report' && (
                  <button className="flex items-center justify-between p-3 rounded-panel border bg-surface-2 hover:bg-surface border-line hover:border-primary/50 text-ink transition-all duration-200 group">
                    <span className="text-body font-semibold">Download Report</span>
                    <Download size={16} className="text-ink-3 transition-transform group-hover:translate-y-0.5" />
                  </button>
                )}

                {/* Always provide a resolve option if it's an alert */}
                {notification.type === 'alert' && (
                  <button 
                    onClick={handleResolve}
                    className="flex items-center justify-between p-3 rounded-panel border bg-positive/10 hover:bg-positive/20 border-positive/30 hover:border-positive/30 text-positive transition-all duration-200 group"
                  >
                    <span className="text-body font-semibold">Resolve Notification</span>
                    <Check size={16} className="transition-transform group-" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
