"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { InputField } from "@/components/auth/InputField";
import { createClient } from "@/lib/supabase/client";
import {
  completePasswordReset,
  readRecoveryParams,
  startRecoverySession,
  type NewPasswordErrors,
  type RecoveryClient,
} from "@/lib/password-reset";

type Stage = "checking" | "ready" | "invalid" | "saving";

/**
 * Where the password-reset email lands (ForgotPasswordModal → resetPasswordForEmail,
 * redirectTo /auth/reset-password). Supabase's recovery link becomes a recovery
 * session; the user then chooses a new password. The link's tokens are removed
 * from the address bar as soon as they have been read.
 */
export default function ResetPasswordPage() {
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<NewPasswordErrors>({});
  const [message, setMessage] = useState("");
  const clientRef = useRef<RecoveryClient | null>(null);
  const nextRef = useRef<string | null>(null);

  useEffect(() => {
    const client = createClient() as unknown as RecoveryClient;
    clientRef.current = client;
    const { search, hash, pathname } = window.location;
    nextRef.current = new URLSearchParams(search).get("next");
    const params = readRecoveryParams(search, hash);
    // Don't leave recovery codes or tokens in the address bar or browser history.
    window.history.replaceState(null, "", pathname);
    startRecoverySession(client, params).then((res) => setStage(res.ok ? "ready" : "invalid"));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientRef.current) return;
    setMessage("");
    setStage("saving");
    const res = await completePasswordReset(clientRef.current, { password, confirmPassword, next: nextRef.current });
    if (res.ok) {
      window.location.assign(res.destination);
      return;
    }
    setFieldErrors(res.fieldErrors ?? {});
    setMessage(res.message ?? "");
    setStage(res.sessionExpired ? "invalid" : "ready");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#07090D]">
      <div className="w-full max-w-md bg-[#0B0E14] border border-[#FF5500]/30 rounded-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(255,85,0,0.25)]">
        <h1 className="text-2xl font-bold text-white tracking-tight">Choose a new password</h1>

        {stage === "checking" && (
          <p className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking your reset link…
          </p>
        )}

        {stage === "invalid" && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-zinc-300" role="alert">
              {message || "This reset link is invalid or has expired. Links can be used once, and only in the browser where you asked for them."}
            </p>
            <a href="/login" className="inline-block text-sm font-semibold text-[#FF5500] hover:underline">
              Back to sign in to request a new link
            </a>
          </div>
        )}

        {(stage === "ready" || stage === "saving") && (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5" noValidate>
            <InputField
              label="New password"
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: undefined });
              }}
              error={fieldErrors.password}
              icon={<Lock className="w-5 h-5 text-[#FF5500]" />}
            />
            <InputField
              label="Confirm new password"
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (fieldErrors.confirmPassword) setFieldErrors({ ...fieldErrors, confirmPassword: undefined });
              }}
              error={fieldErrors.confirmPassword}
              icon={<Lock className="w-5 h-5 text-[#FF5500]" />}
            />
            {message && (
              <p className="text-sm text-red-400" role="alert">
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={stage === "saving"}
              className="w-full bg-gradient-to-r from-[#FF5500] to-[#FF3300] hover:from-[#FF6600] hover:to-[#FF4400] font-bold text-white rounded-xl py-3.5 text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-[0_4px_25px_rgba(255,85,0,0.45)]"
            >
              {stage === "saving" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <span>Save new password</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
