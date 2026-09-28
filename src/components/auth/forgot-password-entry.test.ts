import fs from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { resetPasswordForEmail: vi.fn() } }) }));

import { FullScreenSignup as FullScreenSignupComponent } from "@/components/ui/full-screen-signup";
import { ForgotPasswordModal } from "./ForgotPasswordModal";

// The component takes one optional props object; createElement needs a plain props signature.
const FullScreenSignup = FullScreenSignupComponent as (props: { onForgotPassword?: () => void }) => ReturnType<typeof FullScreenSignupComponent>;

// /auth/reset-password only works if people can ask for a reset link: the sign-in form must offer it.
describe("password reset entry point", () => {
  it("the sign-in form shows \"Forgot password?\" when the page supports it", () => {
    const html = renderToStaticMarkup(createElement(FullScreenSignup, { onForgotPassword: () => {} }));
    expect(html).toContain("Forgot password?");
  });

  it("no link is rendered without a handler (nothing that does nothing)", () => {
    expect(renderToStaticMarkup(createElement(FullScreenSignup, {}))).not.toContain("Forgot password?");
  });

  it("the reset request modal asks for the email, and renders nothing while closed", () => {
    const open = renderToStaticMarkup(createElement(ForgotPasswordModal, { isOpen: true, onClose: () => {}, onSuccessToast: () => {} }));
    expect(open).toMatch(/type="email"|email/i);
    expect(renderToStaticMarkup(createElement(ForgotPasswordModal, { isOpen: false, onClose: () => {}, onSuccessToast: () => {} }))).toBe("");
  });

  it("the login page wires the link to the modal, and the modal sends people to /auth/reset-password", () => {
    const login = fs.readFileSync(path.join(process.cwd(), "src/components/auth/LoginPage.tsx"), "utf8");
    expect(login).toMatch(/onForgotPassword=\{\(\) => setForgotOpen\(true\)\}/);
    expect(login).toMatch(/<ForgotPasswordModal[\s\S]*isOpen=\{forgotOpen\}/);
    const modal = fs.readFileSync(path.join(process.cwd(), "src/components/auth/ForgotPasswordModal.tsx"), "utf8");
    expect(modal).toContain("/auth/reset-password");
    expect(modal).toContain("resetPasswordForEmail");
  });
});
