"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Users, Plus, X } from "lucide-react";

interface TargetCustomersProps {
  initialCustomers: string[];
  onChange: (customers: string[]) => void;
  isAiGenerated?: boolean;
}

export function TargetCustomers({
  initialCustomers,
  onChange,
  isAiGenerated = false,
}: TargetCustomersProps) {
  const [customers, setCustomers] = useState<string[]>(initialCustomers);
  const [newInput, setNewInput] = useState("");

  useEffect(() => {
    setCustomers(initialCustomers);
  }, [initialCustomers]);

  function notify(list: string[]) {
    setCustomers(list);
    onChange(list);
  }

  function handleRemove(item: string) {
    const next = customers.filter((c) => c !== item);
    notify(next);
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = newInput.trim();
    if (!trimmed) return;
    if (!customers.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      const next = [...customers, trimmed];
      notify(next);
    }
    setNewInput("");
  }

  return (
    <div className="rounded-panel border border-line bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2 text-support font-medium text-ink">
          <Users className="h-4 w-4 text-brand-strong" />
          <h3 className="font-semibold text-ink">Target Customers</h3>
        </div>
      </div>

      <p className="text-support text-ink-2">
        Key audience groups your business targets. Used to fine-tune AI visibility and search intent.
      </p>

      <div className="flex flex-wrap gap-2 pt-1">
        {customers.map((cust) => (
          <span
            key={cust}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-support font-medium text-ink"
          >
            {cust}
            <button
              type="button"
              onClick={() => handleRemove(cust)}
              className="rounded p-0.5 text-ink-3 hover:text-critical cursor-pointer"
              aria-label={`Remove customer group ${cust}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}

        {customers.length === 0 && (
          <p className="text-support italic text-ink-3">No target customers added.</p>
        )}
      </div>

      <form onSubmit={handleAdd} className="flex items-center gap-2 pt-2">
        <input
          type="text"
          placeholder="Add audience group (e.g. Enterprise customers)"
          value={newInput}
          onChange={(e) => setNewInput(e.target.value)}
          className="h-9 w-full max-w-xs rounded-control border border-line-strong bg-surface px-3 text-support text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          disabled={!newInput.trim()}
          className="flex h-9 items-center gap-1.5 rounded-control bg-surface-2 px-3 text-support font-medium text-ink border border-line hover:bg-brand-soft hover:text-brand-strong disabled:opacity-40 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Add group</span>
        </button>
      </form>
    </div>
  );
}
