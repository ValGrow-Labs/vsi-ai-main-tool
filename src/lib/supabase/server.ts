import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  // if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("https://")) {
  //   throw new Error("Invalid Supabase URL");
  // }
  // if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  //   throw new Error("Supabase environment variables are missing.");
  // }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://dummy.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_key_for_local_development";

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — cookie mutations are ignored
          }
        },
      },
    }
  );
}
