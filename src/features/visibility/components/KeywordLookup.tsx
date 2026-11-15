"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { markResearchIntent, sessionIntentStorage } from "@/lib/research-request";
import { useActiveProject } from "@/components/layout/ProjectProvider";
import { LOCATIONS, type Location } from "@/types/search";

export const LOOKUP_LOCATIONS = ["India", "United States", "United Kingdom", "Sri Lanka", "Singapore", "United Arab Emirates", "Canada", "Australia", "Germany"];

export default function KeywordLookup({
  initial = "",
  initialLocation,
  onSameLookup,
}: {
  initial?: string;
  initialLocation?: string;
  /** Called instead of navigating when the search and country are the ones already shown. */
  onSameLookup?: () => void;
}) {
  const router = useRouter();
  const project = useActiveProject();
  const defaultCountry =
    initialLocation ||
    project?.country ||
    (project?.defaultLocation && LOCATIONS[project.defaultLocation as Location]?.label) ||
    "India";

  const [q, setQ] = useState(initial);
  const [loc, setLoc] = useState(defaultCountry);

  useEffect(() => {
    if (initialLocation) {
      setLoc(initialLocation);
    } else if (project?.country) {
      setLoc(project.country);
    } else if (project?.defaultLocation && LOCATIONS[project.defaultLocation as Location]?.label) {
      setLoc(LOCATIONS[project.defaultLocation as Location].label);
    }
  }, [initialLocation, project]);

  const locationList = LOOKUP_LOCATIONS.includes(loc) ? LOOKUP_LOCATIONS : [loc, ...LOOKUP_LOCATIONS];

  const placeholderText = loc === "India"
    ? "For example: best software development company in Mumbai"
    : loc === "United States"
    ? "For example: best digital marketing agency in New York"
    : loc === "Singapore"
    ? "For example: top SEO services in Singapore"
    : loc === "Sri Lanka"
    ? "For example: top web agency in Colombo"
    : `For example: best services in ${loc}`;

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!q.trim()) return;
        if (onSameLookup && q.trim() === initial && loc === initialLocation) {
          onSameLookup();
          return;
        }
        // Submitting is the deliberate action that lets the results page run the (paid) lookup once.
        markResearchIntent(sessionIntentStorage(), q.trim(), loc);
        router.push(`/dashboard?q=${encodeURIComponent(q.trim())}&loc=${encodeURIComponent(loc)}`);
      }}
    >
      <label className="sr-only" htmlFor="lookup-q">
        Search to look up
      </label>
      <div className="relative flex-1">
        <Search size={15} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          id="lookup-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholderText}
          className="h-9 w-full rounded-control border border-line bg-surface pl-9 pr-3 text-body text-ink placeholder:text-ink-3 focus:border-line-strong focus:outline-none"
        />
      </div>
      <label className="sr-only" htmlFor="lookup-loc">
        Country
      </label>
      <select
        id="lookup-loc"
        value={loc}
        onChange={(e) => setLoc(e.target.value)}
        className="h-9 rounded-control border border-line bg-surface px-2.5 text-body text-ink focus:border-line-strong focus:outline-none"
      >
        {locationList.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <Button type="submit" variant="secondary" disabled={!q.trim()}>
        Look up
      </Button>
    </form>
  );
}
