"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Shield, Plus, Trash2, Check, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { validateCompetitorDomain } from "@/lib/project-competitors";

export interface CompetitorItem {
  domain: string;
  name: string;
  market: string;
  selected: boolean;
}

/** Market shown for a competitor: its country-code TLD, else the project's market, else empty (unknown). */
export function detectMarketFromDomain(domain: string, fallbackMarket: string = ""): string {
  const d = domain.toLowerCase().trim();
  if (d.endsWith(".in") || d.endsWith(".co.in")) return "India";
  if (d.endsWith(".uk") || d.endsWith(".co.uk")) return "United Kingdom";
  if (d.endsWith(".ca")) return "Canada";
  if (d.endsWith(".au") || d.endsWith(".com.au")) return "Australia";
  if (d.endsWith(".de")) return "Germany";
  if (d.endsWith(".fr")) return "France";
  if (d.endsWith(".sg") || d.endsWith(".com.sg")) return "Singapore";
  if (d.endsWith(".lk")) return "Sri Lanka";
  if (d.endsWith(".ae") || d.endsWith(".co.ae")) return "UAE";
  if (d.endsWith(".us")) return "United States";
  return fallbackMarket || "";
}

interface CompetitorSelectionProps {
  initialCompetitors: CompetitorItem[];
  userDomain: string;
  defaultMarket?: string;
  maxPlanCompetitors?: number;
  onChange: (competitors: CompetitorItem[]) => void;
}

export function CompetitorSelection({
  initialCompetitors,
  userDomain,
  defaultMarket = "",
  maxPlanCompetitors = 10,
  onChange,
}: CompetitorSelectionProps) {
  const [items, setItems] = useState<CompetitorItem[]>(() =>
    initialCompetitors.map((c) => ({
      ...c,
      market: detectMarketFromDomain(c.domain, defaultMarket),
    }))
  );
  const [manualInput, setManualInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Sync market of competitors whenever defaultMarket or initialCompetitors change
  useEffect(() => {
    setItems((prevItems) => {
      const source = prevItems.length > 0 ? prevItems : initialCompetitors;
      return source.map((item) => ({
        ...item,
        market: detectMarketFromDomain(item.domain, defaultMarket),
      }));
    });
  }, [defaultMarket, initialCompetitors]);

  const selectedCount = items.filter((i) => i.selected).length;

  function notify(newList: CompetitorItem[]) {
    setItems(newList);
    onChange(newList);
  }

  function toggleCompetitor(domain: string) {
    const next = items.map((item) => {
      if (item.domain === domain) {
        if (!item.selected && selectedCount >= maxPlanCompetitors) {
          setError(`Your current plan allows ${maxPlanCompetitors} competitors.`);
          return item;
        }
        setError(null);
        return { ...item, selected: !item.selected };
      }
      return item;
    });
    notify(next);
  }

  function handleAddManual(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const check = validateCompetitorDomain(
      manualInput,
      userDomain,
      items.map((i) => i.domain)
    );

    if (!check.ok) {
      setError(check.message);
      return;
    }

    if (selectedCount >= maxPlanCompetitors) {
      setError(`Your current plan allows ${maxPlanCompetitors} competitors.`);
      return;
    }

    const market = detectMarketFromDomain(check.domain, defaultMarket);

    const newItem: CompetitorItem = {
      domain: check.domain,
      name: check.domain,
      market: market,
      selected: true,
    };

    const next = [...items, newItem];
    setManualInput("");
    notify(next);
  }

  function handleRemove(domain: string) {
    const next = items.filter((i) => i.domain !== domain);
    notify(next);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 py-2"
    >
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Competitor websites
        </h1>
        <p className="max-w-[70ch] text-base leading-relaxed text-ink-2">
          Review suggested competitors and choose the websites you want to track in search results and AI overviews.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-brand-light bg-brand-soft/60 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-brand-strong shrink-0" />
          <span className="text-body font-semibold text-brand-strong">
            {selectedCount} competitor{selectedCount === 1 ? "" : "s"} selected
          </span>
        </div>
        <span className="text-caption font-medium text-ink-2">
          Your current plan allows {maxPlanCompetitors} competitors.
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-critical-soft bg-critical-soft/60 px-4 py-3 text-support text-critical">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Manual Input */}
      <form onSubmit={handleAddManual} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            inputMode="url"
            placeholder="Type a competitor URL and press Enter (e.g. adidas.com)"
            value={manualInput}
            onChange={(e) => {
              setManualInput(e.target.value);
              if (error) setError(null);
            }}
            className="h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-body text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={!manualInput.trim()}
          className="flex h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-4 text-body font-medium text-ink hover:bg-brand-soft hover:text-brand-strong disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          <span>Add Competitor</span>
        </button>
      </form>

      {/* Competitor Table / List */}
      <div className="rounded-panel border border-line bg-surface overflow-hidden shadow-2xs">
        <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 border-b border-line bg-surface-2 px-5 py-3 text-caption font-semibold uppercase tracking-wider text-ink-3">
          <span className="w-6 text-center">Track</span>
          <span>Competitor</span>
          <span className="text-right">Market</span>
          <span className="w-8 text-right">Actions</span>
        </div>

        <div className="divide-y divide-line">
          {items.map((comp) => (
            <div
              key={comp.domain}
              className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-3.5 transition-colors ${
                comp.selected ? "bg-surface" : "bg-surface/50 opacity-75"
              }`}
            >
              {/* Checkbox */}
              <button
                type="button"
                onClick={() => toggleCompetitor(comp.domain)}
                className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                  comp.selected
                    ? "border-brand-strong bg-brand-strong text-white"
                    : "border-line-strong bg-surface hover:border-ink"
                }`}
                aria-label={`Toggle tracking for ${comp.domain}`}
              >
                {comp.selected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
              </button>

              {/* Competitor Domain & Name */}
              <div className="min-w-0 cursor-pointer" onClick={() => toggleCompetitor(comp.domain)}>
                <p className="text-body font-medium text-ink truncate">{comp.domain}</p>
                {comp.name && comp.name !== comp.domain && (
                  <p className="text-caption text-ink-3 truncate">{comp.name}</p>
                )}
              </div>

              {/* Market */}
              <span className="rounded-control bg-surface-2 px-2.5 py-1 text-caption font-medium text-ink-2 text-right">
                {comp.market || "Not set"}
              </span>

              {/* Remove */}
              <button
                type="button"
                onClick={() => handleRemove(comp.domain)}
                className="flex h-8 w-8 items-center justify-center rounded-control text-ink-3 hover:bg-critical-soft hover:text-critical transition-colors"
                aria-label={`Remove competitor ${comp.domain}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          {items.length === 0 && (
            <div className="p-8 text-center text-support text-ink-3">
              Couldn&apos;t find competitor suggestions automatically. Type a competitor URL above to add manually.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
