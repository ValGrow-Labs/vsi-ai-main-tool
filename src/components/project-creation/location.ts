import { LOCATIONS, type Location } from "@/types/search";

export interface LocationOption {
  code: string;
  label: string;
  country: string;
}

export const LOCATION_OPTIONS: LocationOption[] = Object.entries(LOCATIONS).map(([code, val]) => ({
  code,
  label: val.label,
  country: val.label.split("(")[0].trim(),
}));

export function isSupportedLocationCode(code: unknown): code is Location {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(LOCATIONS, code);
}

/** The supported market a piece of text names (country, label, code or a common alias), or undefined. */
export function matchLocationOption(text: string | undefined | null): LocationOption | undefined {
  const target = (text || "").trim().toLowerCase();
  if (!target) return undefined;
  return LOCATION_OPTIONS.find(
    (l) =>
      l.country.toLowerCase() === target ||
      l.label.toLowerCase() === target ||
      l.code.toLowerCase() === target ||
      (target.includes("emirates") && l.code === "ae") ||
      (target.includes("dubai") && l.code === "ae") ||
      (target.includes("singapore") && l.code === "sg") ||
      (target.includes("india") && l.code === "in") ||
      (target.includes("united states") && l.code === "us") ||
      (target.includes("kingdom") && l.code === "uk") ||
      (target.includes("lanka") && l.code === "lk")
  );
}

/**
 * Resolves a location the user entered. A recognised market sets both name and code; unrecognised text
 * keeps the current code (possibly empty — the user still has to pick a market); empty input keeps the
 * current values. Never substitutes a default market.
 */
export function resolveLocation(newLoc: string | undefined, currentLocation: string, currentCode: string) {
  const trimmedLoc = (newLoc || "").trim();
  const locMatch = matchLocationOption(trimmedLoc);
  return {
    location: locMatch ? locMatch.country : trimmedLoc || currentLocation,
    locationCode: locMatch ? locMatch.code : currentCode,
  };
}
