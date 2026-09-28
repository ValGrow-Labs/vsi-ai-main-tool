"use client";

import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, MailCheck, ShieldCheck, User } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { LoginBenefits, LoginShowcase } from "@/components/auth/LoginShowcase";
import { currentCookieSessionAllowed } from "@/lib/auth-rules";
import { MIN_PASSWORD_LENGTH, validateSignup, type SignupFieldErrors, type SignupInput } from "@/lib/signup";

export type AuthMode = "signin" | "signup";

interface FullScreenSignupProps {
  onLoginSubmit?: (email: string, password: string) => Promise<void> | void;
  onSignupSubmit?: (input: SignupInput) => Promise<void> | void;
  /** Set once an account was created but must be confirmed from the email first. */
  confirmationEmail?: string | null;
  initialMode?: AuthMode;
  isLoading?: boolean;
  authError?: string;
  clearAuthError?: () => void;
  /** Opens the password-reset request (Supabase emails a link to /auth/reset-password). */
  onForgotPassword?: () => void;
}

const field = (invalid: boolean) =>
  `h-12 w-full rounded-control border bg-surface pl-11 pr-3.5 text-[0.9375rem] text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-150 focus:outline-none focus:ring-[3px] ${
    invalid ? "border-critical focus:border-critical focus:ring-critical/15" : "border-line-strong hover:border-ink-3 focus:border-brand focus:ring-brand/20"
  }`;
const fieldIcon = "pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-3";
const primaryButton =
  "group mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-control bg-brand-strong text-[0.9375rem] font-semibold text-white transition-colors duration-150 hover:bg-brand-strong/90 active:translate-y-px disabled:pointer-events-none disabled:opacity-60 dark:text-canvas";
const linkButton = "font-semibold text-brand-strong underline-offset-4 transition-colors hover:underline focus:outline-none focus-visible:underline";

interface TextFieldProps {
  id: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  trailing?: React.ReactNode;
}

const TextField = ({ id, label, icon, value, onChange, error, type = "text", autoComplete, placeholder, hint, trailing }: TextFieldProps) => (
  <div>
    <label htmlFor={id} className="mb-1.5 block text-support font-medium text-ink">
      {label}
    </label>
    <div className="relative flex items-center">
      {icon}
      <input
        type={type}
        id={id}
        className={`${field(!!error)}${trailing ? " pr-12" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
      {trailing}
    </div>
    {error ? (
      <p id={`${id}-error`} className="mt-1.5 text-caption text-critical">
        {error}
      </p>
    ) : (
      hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-caption text-ink-3">
          {hint}
        </p>
      )
    )}
  </div>
);

const PasswordToggle = ({ shown, onToggle }: { shown: boolean; onToggle: () => void }) => (
  <button
    type="button"
    onClick={onToggle}
    className="absolute right-2 rounded-control p-2 text-ink-3 transition-colors hover:text-ink"
    aria-label={shown ? "Hide password" : "Show password"}
  >
    {shown ? <EyeOff className="h-[18px] w-[18px]" aria-hidden /> : <Eye className="h-[18px] w-[18px]" aria-hidden />}
  </button>
);

const SubmitLabel = ({ loading, busy, idle }: { loading: boolean; busy: string; idle: string }) =>
  loading ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span>{busy}</span>
    </>
  ) : (
    <>
      <span>{idle}</span>
      <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={2} aria-hidden />
    </>
  );

export const FullScreenSignup = ({
  onLoginSubmit,
  onSignupSubmit,
  confirmationEmail = null,
  initialMode = "signin",
  isLoading = false,
  authError = "",
  clearAuthError,
  onForgotPassword,
}: FullScreenSignupProps = {}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  // A confirmation notice belongs to sign-up; "use a different email" lets the person leave it.
  const [dismissedConfirmation, setDismissedConfirmation] = useState(false);

  // Sign in
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Create account
  const [fullName, setFullName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [signupErrors, setSignupErrors] = useState<SignupFieldErrors>({});

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setDismissedConfirmation(false);
    setEmailError("");
    setPasswordError("");
    setSignupErrors({});
    clearAuthError?.();
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    let valid = true;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address.");
      valid = false;
    } else {
      setEmailError("");
    }

    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      valid = false;
    } else {
      setPasswordError("");
    }

    if (valid) await onLoginSubmit?.(email, password);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: SignupInput = { fullName, email: signupEmail, password: newPassword, confirmPassword };
    const errors = validateSignup(input);
    setSignupErrors(errors);
    if (Object.keys(errors).length === 0) {
      setDismissedConfirmation(false);
      await onSignupSubmit?.(input);
    }
  };

  const editSignup = <K extends keyof SignupFieldErrors>(key: K, set: (v: string) => void) => (value: string) => {
    set(value);
    if (signupErrors[key]) setSignupErrors((prev) => ({ ...prev, [key]: undefined }));
    clearAuthError?.();
  };

  // Google sign-in only creates a local development session, so it is offered only where it can work.
  const googleAvailable = currentCookieSessionAllowed();
  const showConfirmation = mode === "signup" && !!confirmationEmail && !dismissedConfirmation;

  const errorBanner = authError && (
    <div role="alert" className="mt-6 flex items-start gap-2.5 rounded-control border border-critical/20 bg-critical-soft px-3.5 py-3 text-support text-critical">
      <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden />
      <span>{authError}</span>
    </div>
  );

  const googleButton = (label: string) =>
    googleAvailable && (
      <>
        <div className="mt-7 flex items-center gap-4" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-3">Or continue with</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <a
          href="/api/auth/google"
          className="mt-5 flex h-12 w-full items-center justify-center gap-3 rounded-control border border-line-strong bg-surface text-[0.9375rem] font-medium text-ink transition-colors duration-150 hover:border-ink-3 hover:bg-surface-2 active:translate-y-px"
        >
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          {label}
        </a>
      </>
    );

  return (
    <div className="grid min-h-screen w-full bg-surface font-sans text-ink lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)]">
      <div className="flex flex-col px-5 py-8 sm:px-10 lg:py-10">
        <div className="mx-auto flex w-full max-w-[440px] items-center gap-3">
          <Image src="/vg-logo.png" alt="" width={40} height={40} className="rounded-control ring-1 ring-line" priority />
          <span>
            <span className="block text-section font-semibold leading-5 tracking-[-0.01em] text-ink">VSI</span>
            <span className="block text-[0.6875rem] font-medium uppercase leading-4 tracking-[0.12em] text-ink-3">Search Intelligence</span>
          </span>
        </div>

        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
          {/* Re-keyed on every switch so the panel eases in again and focus starts at the top. */}
          <div key={showConfirmation ? "confirm" : mode} className="animate-rise-in">
            {showConfirmation ? (
              <div role="status">
                <span className="flex h-12 w-12 items-center justify-center rounded-panel bg-positive-soft text-positive">
                  <MailCheck className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                </span>
                <p className="mt-6 text-caption font-semibold uppercase tracking-[0.14em] text-brand-strong">One more step</p>
                <h1 className="mt-3 text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-ink">Check your email</h1>
                <p className="mt-2.5 text-[0.9375rem] leading-6 text-ink-2">
                  We sent a confirmation link to <span className="font-semibold text-ink">{confirmationEmail}</span>. Open it to finish creating your account, then you&apos;ll set up your workspace.
                </p>
                <p className="mt-4 text-support text-ink-3">Nothing there after a minute? Check your spam folder.</p>
                <button type="button" onClick={() => switchMode("signin")} className={`${primaryButton} mt-8`}>
                  <span>Back to sign in</span>
                </button>
                <p className="mt-6 text-center text-support text-ink-2">
                  Wrong address?{" "}
                  <button type="button" onClick={() => setDismissedConfirmation(true)} className={linkButton}>
                    Use a different email
                  </button>
                </p>
              </div>
            ) : mode === "signin" ? (
              <>
                <p className="text-caption font-semibold uppercase tracking-[0.14em] text-brand-strong">Welcome back</p>
                <h1 className="mt-3 text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-ink">Sign in to your account</h1>
                <p className="mt-2.5 text-[0.9375rem] leading-6 text-ink-2">
                  Continue to track your search visibility, website performance and AI presence — all in one place.
                </p>

                {errorBanner}

                <form className="mt-7 flex flex-col gap-5" onSubmit={handleSignIn} noValidate>
                  <TextField
                    id="email"
                    label="Email"
                    type="email"
                    icon={<Mail className={fieldIcon} strokeWidth={1.75} aria-hidden />}
                    value={email}
                    onChange={(v) => {
                      setEmail(v);
                      if (emailError) setEmailError("");
                      clearAuthError?.();
                    }}
                    error={emailError}
                    autoComplete="email"
                    placeholder="you@company.com"
                  />
                  <TextField
                    id="password"
                    label="Password"
                    type={showPassword ? "text" : "password"}
                    icon={<Lock className={fieldIcon} strokeWidth={1.75} aria-hidden />}
                    value={password}
                    onChange={(v) => {
                      setPassword(v);
                      if (passwordError) setPasswordError("");
                      clearAuthError?.();
                    }}
                    error={passwordError}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    trailing={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword((p) => !p)} />}
                  />
                  {onForgotPassword && (
                    <div className="-mt-2 flex justify-end">
                      <button type="button" onClick={onForgotPassword} className={`${linkButton} text-support`}>
                        Forgot password?
                      </button>
                    </div>
                  )}
                  <button type="submit" disabled={isLoading} className={primaryButton}>
                    <SubmitLabel loading={isLoading} busy="Signing in" idle="Sign in" />
                  </button>
                </form>

                {googleButton("Sign in with Google")}

                <p className="mt-7 text-center text-support text-ink-2">
                  Don&apos;t have an account?{" "}
                  <button type="button" onClick={() => switchMode("signup")} className={linkButton}>
                    Create account
                  </button>
                </p>
              </>
            ) : (
              <>
                <p className="text-caption font-semibold uppercase tracking-[0.14em] text-brand-strong">Get started</p>
                <h1 className="mt-3 text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-ink">Create your account</h1>
                <p className="mt-2.5 text-[0.9375rem] leading-6 text-ink-2">
                  Create your account, then set up your workspace and see how your website appears across search and AI.
                </p>

                {errorBanner}

                <form className="mt-7 flex flex-col gap-5" onSubmit={handleSignUp} noValidate>
                  <TextField
                    id="signup-name"
                    label="Full name"
                    icon={<User className={fieldIcon} strokeWidth={1.75} aria-hidden />}
                    value={fullName}
                    onChange={editSignup("fullName", setFullName)}
                    error={signupErrors.fullName}
                    autoComplete="name"
                    placeholder="Your full name"
                  />
                  <TextField
                    id="signup-email"
                    label="Email"
                    type="email"
                    icon={<Mail className={fieldIcon} strokeWidth={1.75} aria-hidden />}
                    value={signupEmail}
                    onChange={editSignup("email", setSignupEmail)}
                    error={signupErrors.email}
                    autoComplete="email"
                    placeholder="you@company.com"
                  />
                  <TextField
                    id="signup-password"
                    label="Password"
                    type={showNewPassword ? "text" : "password"}
                    icon={<Lock className={fieldIcon} strokeWidth={1.75} aria-hidden />}
                    value={newPassword}
                    onChange={editSignup("password", setNewPassword)}
                    error={signupErrors.password}
                    autoComplete="new-password"
                    placeholder="Create a password"
                    hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                    trailing={<PasswordToggle shown={showNewPassword} onToggle={() => setShowNewPassword((p) => !p)} />}
                  />
                  <TextField
                    id="signup-confirm"
                    label="Confirm password"
                    type={showNewPassword ? "text" : "password"}
                    icon={<Lock className={fieldIcon} strokeWidth={1.75} aria-hidden />}
                    value={confirmPassword}
                    onChange={editSignup("confirmPassword", setConfirmPassword)}
                    error={signupErrors.confirmPassword}
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                  />
                  <button type="submit" disabled={isLoading} className={primaryButton}>
                    <SubmitLabel loading={isLoading} busy="Creating account" idle="Create account" />
                  </button>
                </form>

                {googleButton("Sign up with Google")}

                <p className="mt-7 text-center text-support text-ink-2">
                  Already have an account?{" "}
                  <button type="button" onClick={() => switchMode("signin")} className={linkButton}>
                    Sign in
                  </button>
                </p>
              </>
            )}

            <p className="mt-7 flex items-center justify-center gap-2 text-caption text-ink-3">
              <ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              Your account is protected by secure authentication.
            </p>
          </div>

          {/* Small screens: the form comes first, then what VSI does in three short lines. */}
          <LoginBenefits className="mt-10 border-t border-line pt-8 lg:hidden" />
        </div>
      </div>

      <LoginShowcase />
    </div>
  );
};
