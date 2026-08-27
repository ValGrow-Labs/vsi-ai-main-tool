"use client";

import React, { useState, useEffect } from 'react';
import { FullScreenSignup } from '@/components/ui/full-screen-signup';
import { Toast } from '../common/Toast';
import type { ToastMessage, UserProfile } from '@/types/login';
import { setClientSession, isAuthenticatedClient } from '@/lib/auth-client';
import { isAuthorizedEmail } from '@/lib/auth-config';
import { createClient } from '@/lib/supabase/client';

export const LoginPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [authError, setAuthError] = useState<string>('');

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToast({
      id: Date.now().toString(),
      type,
      text,
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isAuthenticatedClient()) {
      window.location.href = "/dashboard";
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam === "unauthorized_account") {
      setAuthError("Invalid email or password.");
      showToast("error", "Access denied. Only authorized ValGrow Labs accounts can access this platform.");
    } else if (errorParam === "auth_callback_error") {
      setAuthError("Authentication failed. Please try again.");
    }
  }, []);

  const completeAuthentication = (user: UserProfile) => {
    setClientSession(user);
    showToast('success', `Welcome back to VSI AI Suite!`);
    setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const redirectPath = params.get("redirect") || "/dashboard";
      window.location.href = redirectPath;
    }, 700);
  };

  const handleLoginSubmit = async (email: string, password: string) => {
    if (isLoading) return;

    setIsLoading(true);
    setAuthError('');

    const cleanEmail = email.trim().toLowerCase();

    // Security Check: Restrict to authorized ValGrow Labs email only
    if (!isAuthorizedEmail(cleanEmail)) {
      setAuthError('Invalid email or password.');
      setIsLoading(false);
      return;
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const isPlaceholderSupabase = !url || url.includes("dummy") || url.includes("your-project.supabase.co");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (!error && data?.session && data?.user) {
        if (!isAuthorizedEmail(data.user.email)) {
          await supabase.auth.signOut();
          setAuthError('Invalid email or password.');
          setIsLoading(false);
          return;
        }

        const userProfile: UserProfile = {
          name: data.user.user_metadata?.full_name || 'VALGROW LABS',
          email: data.user.email!,
          role: 'Administrator',
          company: 'Valgrow Enterprise',
          plan: 'VSI GEO Platform Pro',
        };

        completeAuthentication(userProfile);
        return;
      }
    } catch {
      // Fall through if Supabase request fails or offline
    }

    // Local / Dev Fallback: If running in local dev without real Supabase connection,
    // allow authorized ValGrow email session creation once authenticated
    if (isPlaceholderSupabase) {
      const userProfile: UserProfile = {
        name: "VALGROW LABS",
        email: cleanEmail,
        role: "Administrator",
        company: "Valgrow Enterprise",
        plan: "VSI GEO Platform Pro",
      };
      completeAuthentication(userProfile);
      return;
    }

    setAuthError('Invalid email or password.');
    setIsLoading(false);
  };

  return (
    <div className="relative min-h-screen w-full bg-white text-slate-900 overflow-hidden">
      {/* Toast Feedback */}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Full Screen Signup/Login Component */}
      <div className="relative z-10 min-h-screen flex items-center justify-center">
        <FullScreenSignup
          onLoginSubmit={handleLoginSubmit}
          isLoading={isLoading}
          authError={authError}
          clearAuthError={() => setAuthError('')}
        />
      </div>
    </div>
  );
};
