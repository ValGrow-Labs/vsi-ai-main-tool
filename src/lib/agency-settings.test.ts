import { describe, expect, it } from "vitest";
import { buildAgencySettingsUpdate, changedAgencySettings } from "./agency-settings";

describe("buildAgencySettingsUpdate", () => {
  it("keeps only editable fields and clears empty ones", () => {
    const { update, errors } = buildAgencySettingsUpdate({
      display_name: "  Acme  ",
      support_email: "",
      name: "not editable",
      is_pilot: false,
    });
    expect(errors).toEqual([]);
    expect(update).toEqual({ display_name: "Acme", support_email: null });
  });

  it("does not touch logo_url unless it was sent", () => {
    const { update } = buildAgencySettingsUpdate({ display_name: "Acme" });
    expect("logo_url" in update).toBe(false);
  });

  it("refuses bad values instead of silently dropping them", () => {
    expect(buildAgencySettingsUpdate({ primary_color: "red" }).errors.length).toBe(1);
    expect(buildAgencySettingsUpdate({ support_email: "nope" }).errors.length).toBe(1);
    expect(buildAgencySettingsUpdate({ logo_url: "data:image/png;base64,AAAA" }).errors.length).toBe(1);
    expect(buildAgencySettingsUpdate({ report_footer: "x".repeat(5001) }).errors.length).toBe(1);
  });

  it("accepts a hosted logo URL and an explicit removal", () => {
    expect(buildAgencySettingsUpdate({ logo_url: "https://x.supabase.co/storage/v1/object/public/agency-logos/a/logo.png" }).update.logo_url).toMatch(/^https:/);
    expect(buildAgencySettingsUpdate({ logo_url: null }).update).toEqual({ logo_url: null });
  });
});

describe("changedAgencySettings", () => {
  const loaded = { display_name: "Acme", support_email: "hi@acme.test", logo_url: "https://cdn.test/logo.png" };

  it("sends nothing when nothing changed", () => {
    expect(changedAgencySettings(loaded, { ...loaded, display_name: " Acme " })).toEqual({});
  });

  it("never sends logo_url when the logo was left alone", () => {
    const out = changedAgencySettings(loaded, { ...loaded, display_name: "Acme Ltd" });
    expect(out).toEqual({ display_name: "Acme Ltd" });
    expect("logo_url" in out).toBe(false);
  });

  it("sends logo_url: null only when the logo was removed", () => {
    expect(changedAgencySettings(loaded, { ...loaded, logo_url: null })).toEqual({ logo_url: null });
  });

  it("treats unset and empty as the same", () => {
    expect(changedAgencySettings({ display_name: null }, { display_name: "" })).toEqual({});
  });
});
