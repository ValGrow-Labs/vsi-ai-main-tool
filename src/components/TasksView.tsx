"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { 
  Clock, CheckCircle, Circle, AlertCircle, Plus, ListChecks, X, Tag, User, AlertTriangle 
} from "lucide-react";

export interface TaskItem {
  id: string;
  client_id: string;
  client_name: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: number;
  group: string;
  owner: string;
  keyword: string | null;
  stale: boolean;
}

const INITIAL_TASKS: TaskItem[] = [
  { id: "t1", client_id: "1", client_name: "VG Digital", title: "Optimize meta descriptions for top 10 pages", status: "in_progress", priority: 1, group: "Content", owner: "Writer", keyword: "vg digital seo services", stale: false },
  { id: "t2", client_id: "1", client_name: "VG Digital", title: "Fix Core Web Vitals — LCP > 2.5s on homepage", status: "todo", priority: 2, group: "Technical", owner: "Developer", keyword: null, stale: false },
  { id: "t3", client_id: "1", client_name: "VG Digital", title: "Build 5 authoritative backlinks (DA 40+)", status: "todo", priority: 3, group: "Off-page", owner: "Outreach", keyword: "digital marketing agency uae", stale: true },
  { id: "t4", client_id: "2", client_name: "Athariw", title: "Create GEO-optimized FAQ page for AI results", status: "todo", priority: 1, group: "Content", owner: "Writer", keyword: "athariw ecommerce ksa", stale: false },
  { id: "t5", client_id: "2", client_name: "Athariw", title: "Schema markup implementation on product pages", status: "in_progress", priority: 2, group: "Technical", owner: "Developer", keyword: null, stale: false },
  { id: "t6", client_id: "3", client_name: "ValGrow Labs", title: "Publish 3 thought-leadership articles", status: "done", priority: 1, group: "Content", owner: "Writer", keyword: "valgrow saas tools", stale: false },
  { id: "t7", client_id: "3", client_name: "ValGrow Labs", title: "Set up ChatGPT entity citation tracking", status: "in_progress", priority: 2, group: "Technical", owner: "SEO", keyword: "ai visibility tools", stale: false },
  { id: "t8", client_id: "4", client_name: "Tap Payments", title: "Competitor gap analysis for fintech keywords", status: "todo", priority: 1, group: "Content", owner: "SEO", keyword: "tap payments saudi arabia", stale: false },
  { id: "t9", client_id: "7", client_name: "MENA Cyber Wire", title: "Refresh AI mention strategy for cybersecurity", status: "todo", priority: 1, group: "Content", owner: "Writer", keyword: "mena cybersecurity news", stale: true },
  { id: "t10", client_id: "9", client_name: "Chris McElroy", title: "Personal brand entity optimization", status: "done", priority: 1, group: "Content", owner: "SEO", keyword: "chris mcelroy seo expert", stale: false },
];

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Circle; color: string; bg: string; border: string }> = {
  todo: { label: "To Do", icon: Circle, color: "text-muted-foreground", bg: "bg-gray-400/10", border: "border-gray-400/20" },
  in_progress: { label: "In Progress", icon: Clock, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  done: { label: "Done", icon: CheckCircle, color: "text-[#22C55E]", bg: "bg-[#22C55E]/10", border: "border-[#22C55E]/20" },
};

const PRIORITY_BAR: Record<number, string> = {
  1: "bg-amber-500",
  2: "bg-blue-500",
  3: "bg-slate-500",
};

const GROUP_COLOR: Record<string, string> = {
  Content: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  Technical: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  "Off-page": "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
};

const OWNER_COLOR: Record<string, string> = {
  Writer: "bg-pink-500/10 text-pink-400 border border-pink-500/20",
  Developer: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  SEO: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  Outreach: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
};

type FilterType = "open" | "todo" | "in_progress" | "done";

export default function TasksView() {
  const [tasks, setTasks] = useState<TaskItem[]>(INITIAL_TASKS);
  const [activeTab, setActiveTab] = useState<FilterType>("open");
  const [showModal, setShowModal] = useState(false);

  // New task form state
  const [newTitle, setNewTitle] = useState("");
  const [newClient, setNewClient] = useState("VG Digital");
  const [newGroup, setNewGroup] = useState("Content");
  const [newOwner, setNewOwner] = useState("SEO");

  useEffect(() => {
    async function loadTasksFromSupabase() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
        if (!error && data && data.length > 0) {
          const mapped: TaskItem[] = data.map((t: any) => ({
            id: t.id,
            client_id: t.client_id || "1",
            client_name: t.client_name || "Enterprise Client",
            title: t.title,
            status: t.status === "completed" || t.status === "done" ? "done" : t.status === "in_progress" ? "in_progress" : "todo",
            priority: t.priority === "high" ? 1 : t.priority === "low" ? 3 : 2,
            group: t.group || "Content",
            owner: t.owner || "SEO",
            keyword: t.keyword || null,
            stale: Boolean(t.stale),
          }));
          setTasks(mapped);
        }
      } catch (err) {
        console.error("Error loading tasks from Supabase:", err);
      }
    }
    loadTasksFromSupabase();
  }, []);

  const counts = {
    all: tasks.length,
    open: tasks.filter(t => t.status !== "done").length,
    todo: tasks.filter(t => t.status === "todo").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    done: tasks.filter(t => t.status === "done").length,
  };

  const filteredTasks = tasks.filter(t => {
    if (activeTab === "open") return t.status !== "done";
    return t.status === activeTab;
  });

  const openTasks = tasks.filter(t => t.status !== "done");
  const doneTasks = tasks.filter(t => t.status === "done");

  // Group displayed tasks by client
  const byClient = new Map<string, { name: string; rows: TaskItem[] }>();
  for (const t of filteredTasks) {
    const entry = byClient.get(t.client_id) ?? { name: t.client_name, rows: [] };
    entry.rows.push(t);
    byClient.set(t.client_id, entry);
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newTaskItem: TaskItem = {
      id: `t-${Date.now()}`,
      client_id: "1",
      client_name: newClient,
      title: newTitle.trim(),
      status: "todo",
      priority: 1,
      group: newGroup,
      owner: newOwner,
      keyword: null,
      stale: false,
    };

    setTasks([newTaskItem, ...tasks]);
    setNewTitle("");
    setShowModal(false);

    try {
      const supabase = createClient();
      await supabase.from("tasks").insert({
        title: newTaskItem.title,
        status: "todo",
        priority: "medium",
      });
    } catch {}
  };

  const toggleTaskStatus = async (id: string) => {
    const currentTask = tasks.find(t => t.id === id);
    if (!currentTask) return;

    let nextStatus: TaskItem["status"] = "todo";
    if (currentTask.status === "todo") nextStatus = "in_progress";
    else if (currentTask.status === "in_progress") nextStatus = "done";
    else nextStatus = "todo";

    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: nextStatus } : t));

    try {
      const supabase = createClient();
      await supabase.from("tasks").update({
        status: nextStatus === "done" ? "completed" : nextStatus
      }).eq("id", id);
    } catch {}
  };

  return (
    <div className="min-h-[calc(100vh-60px)] bg-background p-3 sm:p-6 font-sans text-foreground">
      <div className="max-w-[1400px] mx-auto bg-card rounded-[20px] p-6 lg:p-8 shadow-2xl border border-border min-h-[calc(100vh-108px)]">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Tasks & Audits</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Execution tickets across your agency. Click any tab to filter or add new task tickets.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2.5 rounded-full shadow-sm transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { id: "open", label: "Open Tasks", value: counts.open, Icon: ListChecks, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
            { id: "todo", label: "To Do", value: counts.todo, Icon: Circle, color: "text-muted-foreground", bg: "bg-gray-400/10", border: "border-gray-400/20" },
            { id: "in_progress", label: "In Progress", value: counts.in_progress, Icon: Clock, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
            { id: "done", label: "Completed", value: counts.done, Icon: CheckCircle, color: "text-[#22C55E]", bg: "bg-[#22C55E]/10", border: "border-[#22C55E]/20" },
          ].map(({ id, label, value, Icon, color, bg, border }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as FilterType)}
              className={`bg-card border ${border} rounded-[20px] p-5 flex items-center gap-4 text-left transition-all hover:scale-[1.01] cursor-pointer ${
                activeTab === id ? "ring-2 ring-amber-500/40 shadow-md" : ""
              }`}
            >
              <div className={`w-10 h-10 rounded-[20px] ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
                <p className="text-2xl font-bold text-foreground leading-none mt-0.5">{value}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-2 bg-card border border-border rounded-[20px] p-1.5 w-fit mb-6 overflow-x-auto">
          {[
            { id: "open", label: `Open (${counts.open})` },
            { id: "todo", label: `To Do (${counts.todo})` },
            { id: "in_progress", label: `In Progress (${counts.in_progress})` },
            { id: "done", label: `Done (${counts.done})` },
          ].map(({ id, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id as FilterType)}
                className={`px-4 py-2 text-[13px] font-medium rounded-[20px] transition-all whitespace-nowrap cursor-pointer ${
                  active 
                    ? "bg-amber-500 text-white font-bold shadow-sm" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted-bg"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Main Tasks List */}
          <div className="xl:col-span-2 space-y-6">
            {byClient.size === 0 ? (
              <div className="p-12 text-center bg-card border border-border rounded-[20px] text-muted-foreground">
                <p className="text-sm font-medium">No tasks found for "{activeTab.replace("_", " ")}" filter.</p>
              </div>
            ) : (
              Array.from(byClient.entries()).map(([clientId, group]) => (
                <div key={clientId}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-amber-500">{group.name.charAt(0)}</span>
                      </div>
                      <h2 className="text-sm font-bold text-foreground">
                        {group.name}
                        <span className="ml-2 text-muted-foreground font-normal text-xs">· {group.rows.length} tasks</span>
                      </h2>
                    </div>
                    <Link
                      href={`/dashboard/clients/${clientId}`}
                      className="text-xs text-amber-500 hover:underline transition-colors font-medium"
                    >
                      Open client →
                    </Link>
                  </div>

                  <div className="space-y-2.5">
                    {group.rows.map((task) => {
                      const sc = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.todo;
                      const StatusIcon = sc.icon;
                      return (
                        <div
                          key={task.id}
                          onClick={() => toggleTaskStatus(task.id)}
                          className="bg-card border border-border hover:border-amber-500/40 rounded-[20px] p-4 flex items-start gap-3 transition-all duration-200 group cursor-pointer shadow-2xs"
                          title="Click to cycle status (To Do -> In Progress -> Done)"
                        >
                          <div className={`w-1 self-stretch rounded-full shrink-0 ${PRIORITY_BAR[task.priority] ?? "bg-slate-500"}`} />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <p className={`text-[13px] font-medium leading-snug ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                {task.title}
                              </p>
                              <div className={`flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full border text-[11px] font-medium ${sc.bg} ${sc.color} ${sc.border}`}>
                                <StatusIcon className="w-3 h-3" />
                                {sc.label}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {task.stale && (
                                <span className="flex items-center gap-1 text-[11px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                                  <AlertCircle className="w-3 h-3" />
                                  Context changed
                                </span>
                              )}
                              <span className={`text-[11px] px-2 py-0.5 rounded-full ${GROUP_COLOR[task.group] ?? "bg-muted-bg text-muted-foreground"}`}>
                                {task.group}
                              </span>
                              <span className={`text-[11px] px-2 py-0.5 rounded-full ${OWNER_COLOR[task.owner] ?? "bg-muted-bg text-muted-foreground"}`}>
                                {task.owner}
                              </span>
                              {task.keyword && (
                                <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                                  🔑 {task.keyword}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Right Sidebar Progress & Analytics */}
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-[20px] p-5">
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-4">Overall Progress</h3>
              
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Completion</span>
                  <span className="font-bold text-[#22C55E]">{Math.round((counts.done / counts.all) * 100)}%</span>
                </div>
                <div className="h-2 bg-muted-bg rounded-full overflow-hidden">
                  <div className="h-full bg-[#22C55E] rounded-full transition-all duration-500" style={{ width: `${Math.round((counts.done / counts.all) * 100)}%` }} />
                </div>
              </div>

              {[
                { label: "To Do", count: counts.todo, color: "bg-slate-400" },
                { label: "In Progress", count: counts.in_progress, color: "bg-blue-500" },
                { label: "Done", count: counts.done, color: "bg-[#22C55E]" },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center justify-between py-2 border-t border-border">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${color}`} />
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                  <span className="text-xs font-semibold text-foreground">{count}</span>
                </div>
              ))}
            </div>

            {/* By Owner */}
            <div className="bg-card border border-border rounded-[20px] p-5">
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-4">By Owner</h3>
              {["Writer", "Developer", "SEO", "Outreach"].map(owner => {
                const n = openTasks.filter(t => t.owner === owner).length;
                return (
                  <div key={owner} className="flex items-center justify-between py-2 border-t border-border first:border-0">
                    <span className="text-xs text-muted-foreground">{owner}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-muted-bg rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min((n / Math.max(openTasks.length, 1)) * 100, 100)}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-foreground w-4 text-right">{n}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* New Task Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-[24px] max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-base font-bold text-foreground">Create New Task Ticket</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Optimize H2 headers for keyword..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-[16px] border border-border bg-background px-3.5 py-2 text-xs text-foreground focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Client</label>
                  <select
                    value={newClient}
                    onChange={(e) => setNewClient(e.target.value)}
                    className="w-full rounded-[16px] border border-border bg-background px-3.5 py-2 text-xs text-foreground focus:outline-none focus:border-amber-500"
                  >
                    <option value="VG Digital">VG Digital</option>
                    <option value="Athariw">Athariw</option>
                    <option value="ValGrow Labs">ValGrow Labs</option>
                    <option value="Tap Payments">Tap Payments</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Group</label>
                  <select
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                    className="w-full rounded-[16px] border border-border bg-background px-3.5 py-2 text-xs text-foreground focus:outline-none focus:border-amber-500"
                  >
                    <option value="Content">Content</option>
                    <option value="Technical">Technical</option>
                    <option value="Off-page">Off-page</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Owner Role</label>
                <select
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  className="w-full rounded-[16px] border border-border bg-background px-3.5 py-2 text-xs text-foreground focus:outline-none focus:border-amber-500"
                >
                  <option value="SEO">SEO</option>
                  <option value="Writer">Writer</option>
                  <option value="Developer">Developer</option>
                  <option value="Outreach">Outreach</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-full text-xs font-medium text-muted-foreground hover:bg-muted-bg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm"
                >
                  Create Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
