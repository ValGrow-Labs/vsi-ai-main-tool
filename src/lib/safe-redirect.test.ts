import { describe, expect, it } from "vitest";
import { postLoginPath, safeInternalPath } from "./safe-redirect";

describe("safeInternalPath", () => {
  const rejected: Array<[string, string | null | undefined]> = [
    ["javascript scheme", "javascript:alert(1)"],
    ["javascript scheme mixed case", "JaVaScRiPt:alert(1)"],
    ["data url", "data:text/html,<script>alert(1)</script>"],
    ["vbscript", "vbscript:msgbox(1)"],
    ["http absolute", "http://evil.com"],
    ["https absolute", "https://evil.com/dashboard"],
    ["protocol-relative", "//evil.com"],
    ["protocol-relative with path", "//evil.com/dashboard"],
    ["slash backslash", "/\evil.com"],
    ["backslash slash", "\/evil.com"],
    ["double backslash", "\\evil.com"],
    ["encoded double slash", "%2F%2Fevil.com"],
    ["double-encoded double slash", "%252F%252Fevil.com"],
    ["triple-encoded double slash", "%25252F%25252Fevil.com"],
    ["encoded backslash", "/%5Cevil.com"],
    ["tab trick", "/%09/evil.com"],
    ["raw tab trick", "/\t/evil.com"],
    ["newline trick", "/%0a/evil.com"],
    ["https with encoded slashes", "https:%2F%2Fevil.com"],
    ["malformed encoding", "/dashboard%E0%A4%A"],
    ["leading space", " /dashboard"],
    ["not an app section", "/api/auth/google"],
    ["login loop", "/login"],
    ["dot-dot escape to api", "/dashboard/../api/cron"],
    ["empty", ""],
    ["null", null],
    ["undefined", undefined],
    ["relative without slash", "dashboard"],
  ];

  it.each(rejected)("rejects %s", (_label, input) => {
    expect(safeInternalPath(input)).toBe("/dashboard");
  });

  it("uses the given fallback", () => {
    expect(safeInternalPath("//evil.com", "/onboarding")).toBe("/onboarding");
  });

  const accepted: Array<[string, string]> = [
    ["/dashboard", "/dashboard"],
    ["/dashboard/projects?x=1#y", "/dashboard/projects?x=1#y"],
    ["/dashboard/check?q=a%20b", "/dashboard/check?q=a%20b"],
    ["/onboarding", "/onboarding"],
    ["/admin/users", "/admin/users"],
    ["/r/abc123", "/r/abc123"],
  ];

  it.each(accepted)("keeps internal path %s", (input, expected) => {
    expect(safeInternalPath(input)).toBe(expected);
  });

  it("never returns anything that leaves the origin", () => {
    const attacks = ["//evil.com", "/\evil.com", "%2F%2Fevil.com", "https:%2F%2Fevil.com", "/%09/evil.com"];
    for (const a of attacks) {
      const out = safeInternalPath(a);
      expect(new URL(out, "https://app.example").origin).toBe("https://app.example");
    }
  });
});

describe("postLoginPath (used by LoginPage)", () => {
  it("follows a safe ?redirect=", () => {
    expect(postLoginPath(undefined, "?redirect=%2Fdashboard%2Freports")).toBe("/dashboard/reports");
  });
  it("ignores an off-site ?redirect=", () => {
    expect(postLoginPath(undefined, "?redirect=https://evil.com")).toBe("/dashboard");
    expect(postLoginPath(undefined, "?redirect=//evil.com")).toBe("/dashboard");
    expect(postLoginPath(undefined, "?redirect=javascript:alert(1)")).toBe("/dashboard");
  });
  it("prefers the page's explicit target", () => {
    expect(postLoginPath("/onboarding", "?redirect=/dashboard/x")).toBe("/onboarding");
  });
  it("falls back to the dashboard with no redirect", () => {
    expect(postLoginPath(undefined, "")).toBe("/dashboard");
  });
});
