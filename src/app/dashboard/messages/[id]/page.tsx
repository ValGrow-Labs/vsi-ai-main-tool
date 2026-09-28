"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Reply, Forward, Archive, Trash2, Mail, MailOpen, Star, CornerUpLeft, CornerUpRight, Paperclip, CheckCircle2, Tag, Inbox, Download, Info } from "lucide-react";
import { useMessages } from "@/contexts/MessagesContext";
import ComposeModal from "@/components/messages/ComposeModal";
import MessageActionMenu from "@/components/messages/MessageActionMenu";

export default function MessageDetailsPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { messages, markAsRead, markAsUnread, toggleStar, moveToFolder, moveToInbox, archiveMessage, deleteMessage, setToastMessage, toastMessage } = useMessages();
  
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  const message = messages.find(m => m.id === id);

  if (!message) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] bg-canvas text-ink">
        <Mail className="w-16 h-16 text-ink-3 opacity-50 mb-4" />
        <h1 className="text-display font-semibold mb-2">Message Not Found</h1>
        <p className="text-ink-3 mb-6">This message may have been deleted or moved.</p>
        <button 
          onClick={() => router.push("/dashboard/messages")}
          className="px-6 py-2 bg-ink text-white font-semibold rounded-control hover:bg-ink-2 transition-colors"
        >
          Return to Inbox
        </button>
      </div>
    );
  }

  const handleAction = async (action: string) => {
    switch(action) {
      case 'reply':
        setIsComposeOpen(true);
        break;
      case 'archive':
        await archiveMessage(message.id);
        router.push("/dashboard/messages");
        break;
      case 'moveToInbox':
        await moveToInbox(message.id);
        router.push("/dashboard/messages");
        break;
      case 'delete':
        await deleteMessage(message.id);
        router.push("/dashboard/messages");
        break;
      case 'markUnread':
        await markAsUnread(message.id);
        router.push("/dashboard/messages");
        break;
      case 'markRead':
        await markAsRead(message.id);
        break;
      case 'download':
        handleDownloadPDF();
        break;
    }
  };

  const handleDownloadPDF = () => {
    // The file is built in memory, so there is nothing to wait for.
    const element = document.createElement("a");
    const plainBody = message.body.replace(/<[^>]+>/g, '\n');
    const content = `========================================================\nMESSAGE DETAILS\n========================================================\n\nSubject: ${message.subject}\nFrom: ${message.sender.name} (${message.sender.email})\nTo: ${message.recipient.name} (${message.recipient.email})\nDate: ${new Date(message.timestamp).toLocaleString()}\nFolder: ${message.folder.toUpperCase()}\nStatus: ${message.status.toUpperCase()}\n\n--------------------------------------------------------\nCONTENT:\n--------------------------------------------------------\n\n${plainBody}\n`;
    const file = new Blob([content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${message.subject.replace(/[^a-zA-Z0-9]/gi, '_')}_message.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    setToastMessage("Message file downloaded successfully.");
    setTimeout(() => setToastMessage(null), 3000);
  };

  const formattedDate = new Date(message.timestamp).toLocaleString(undefined, {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-canvas text-ink overflow-hidden relative">
      {/* Toast Notification Banner */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-control bg-positive text-white font-semibold text-body shadow-overlay flex items-center gap-3"
          >
            <CheckCircle2 size={18} />
            <span>{typeof toastMessage === "string" ? toastMessage : toastMessage.text}</span>
            {typeof toastMessage === "object" && toastMessage.actionText && (
              <button
                onClick={toastMessage.onAction}
                className="ml-2 px-2.5 py-0.5 rounded-control bg-surface/20 hover:bg-surface/30 text-white font-semibold text-caption transition-colors underline cursor-pointer"
              >
                {toastMessage.actionText}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Toolbar */}
      <div className="h-16 border-b border-line flex items-center px-4 sm:px-6 justify-between bg-surface/80 ">
        <div className="flex items-center gap-2 sm:gap-3">
          <button 
            onClick={() => router.push("/dashboard/messages")}
            className="p-2 rounded-full hover:bg-surface-2 text-ink-3 hover:text-ink transition-colors"
            title="Back to Messages"
          >
            <ArrowLeft size={18} />
          </button>
          
          <div className="w-px h-6 bg-border mx-1" />
          
          {/* Dynamic Archive / Move to Inbox Button */}
          {message.folder === "archived" ? (
            <button 
              onClick={() => handleAction('moveToInbox')} 
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-positive/10 hover:bg-positive/20 text-positive border border-positive/30 text-caption font-semibold transition-all" 
              title="Move to Inbox"
            >
              <Inbox size={15} /> Move to Inbox
            </button>
          ) : (
            <button 
              onClick={() => handleAction('archive')} 
              className="p-2 rounded-full hover:bg-surface-2 text-ink-3 hover:text-ink transition-colors" 
              title="Archive"
            >
              <Archive size={18} />
            </button>
          )}

          <button 
            onClick={() => handleAction('delete')} 
            className="p-2 rounded-full hover:bg-critical/10 text-ink-3 hover:text-critical transition-colors" 
            title="Delete"
          >
            <Trash2 size={18} />
          </button>

          <button 
            onClick={handleDownloadPDF} 
            className="p-2 rounded-full hover:bg-surface-2 text-ink-3 hover:text-ink transition-colors" 
            title="Download PDF"
          >
            <Download size={18} />
          </button>
          
          <div className="w-px h-6 bg-border mx-1" />

          <button 
            onClick={() => handleAction(message.status === "read" ? "markUnread" : "markRead")} 
            className="p-2 rounded-full hover:bg-surface-2 text-ink-3 hover:text-ink transition-colors" 
            title={message.status === "read" ? "Mark Unread" : "Mark Read"}
          >
            {message.status === "read" ? <Mail size={18} /> : <MailOpen size={18} />}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-caption text-ink-3 mr-3 hidden sm:inline font-semibold">Message Actions</span>
          <MessageActionMenu message={message} />
        </div>
      </div>

      {/* Message Body Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto bg-surface rounded-panel border border-line p-6 sm:p-8 overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-soft rounded-full blur-[80px]" />

          {/* Subject & Tags */}
          <div className="flex items-start justify-between gap-4 mb-8 relative z-10">
            <div className="flex-1">
              <h1 className="text-display font-semibold text-ink mb-3">{message.subject}</h1>
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-0.5 rounded-control bg-brand-soft text-brand-strong text-caption font-semibold border border-line-strong">
                  {message.folder}
                </span>
                {message.relatedClient && (
                  <span className="px-2.5 py-0.5 rounded-control bg-positive/10 text-positive text-caption font-semibold border border-positive/30">
                    Client: {message.relatedClient}
                  </span>
                )}
                {message.priority === "high" && (
                  <span className="px-2.5 py-0.5 rounded-control bg-critical/10 text-critical text-caption font-semibold border border-critical/30">
                    High Priority
                  </span>
                )}
                {message.labels && message.labels.map(l => (
                  <span key={l} className="px-2.5 py-0.5 rounded-control bg-info/10 text-info text-caption font-semibold border border-info/30 flex items-center gap-1">
                    <Tag size={10} /> {l}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Sender Info Area */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-line pb-6 mb-6 gap-4 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-surface-2 border border-line flex items-center justify-center overflow-hidden shrink-0">
                {message.sender.avatar ? (
                  <img src={message.sender.avatar} alt={message.sender.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold text-ink-3">{(message.sender.name || "M").charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-ink">{message.sender.name}</span>
                  <span className="text-caption text-ink-3">&lt;{message.sender.email}&gt;</span>
                </div>
                <div className="text-caption text-ink-3 mt-0.5">
                  to {message.recipient.name} &lt;{message.recipient.email}&gt;
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:items-end gap-2">
              <div className="flex items-center gap-2 text-caption text-ink-3 font-medium">
                {formattedDate}
                <button 
                  onClick={() => toggleStar(message.id)}
                  className={`ml-2 p-1 rounded-full transition-colors ${message.isStarred ? 'text-brand-strong hover:text-ink' : 'text-ink-3 hover:text-ink'}`}
                >
                  <Star size={16} fill={message.isStarred ? "currentColor" : "none"} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleAction('reply')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-control border border-line hover:bg-surface-2 text-caption font-semibold text-ink transition-colors">
                  <CornerUpLeft size={14} /> Reply
                </button>
                <button onClick={() => handleAction('reply')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-control border border-line hover:bg-surface-2 text-caption font-semibold text-ink transition-colors">
                  <CornerUpRight size={14} /> Forward
                </button>
              </div>
            </div>
          </div>

          {/* AI Summary */}
          {message.aiSummary && (
            <div className="mb-8 p-4 rounded-panel bg-brand-soft border border-line-strong flex gap-3 relative z-10">
              <Info className="w-5 h-5 text-brand-strong shrink-0 mt-0.5" />
              <div>
                <h4 className="text-caption font-semibold text-brand-strong mb-1">AI Summary</h4>
                <p className="text-body text-ink/90 leading-relaxed">{message.aiSummary}</p>
              </div>
            </div>
          )}

          {/* Message Body */}
          {/* Plain text from the compose textarea: rendered as text, never as HTML. */}
          <div className="prose prose-neutral dark:prose-invert max-w-none mb-10 text-ink/90 leading-relaxed relative z-10 whitespace-pre-wrap break-words">{message.body}</div>

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="border-t border-line pt-6 relative z-10">
              <h4 className="text-caption font-semibold text-ink-3 mb-3">
                {message.attachments.length} Attachments
              </h4>
              <div className="flex flex-wrap gap-3">
                {message.attachments.map(att => (
                  <a key={att.id} href={att.url} onClick={(e) => { e.preventDefault(); handleDownloadPDF(); }} className="flex items-center gap-3 p-3 pr-4 rounded-panel border border-line bg-surface-2/60 hover:bg-surface-2 transition-colors group">
                    <div className="w-10 h-10 rounded-control bg-brand-soft text-brand-strong flex items-center justify-center">
                      <Paperclip size={18} />
                    </div>
                    <div>
                      <p className="text-body font-semibold text-ink group-hover:text-brand-strong transition-colors line-clamp-1">{att.name}</p>
                      <p className="text-caption text-ink-3">{att.size}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

        </motion.div>
      </div>

      <ComposeModal isOpen={isComposeOpen} onClose={() => setIsComposeOpen(false)} replyTo={message} />
    </div>
  );
}
