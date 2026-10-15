import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";

/**
 * Privileged Supabase client used by every server action and route handler in
 * Revu. The service role bypasses RLS, which is exactly why all authorization
 * decisions live in src/lib/authz.ts and must be resolved before querying.
 *
 * Never import this from a Client Component. `server-only` enforces that.
 */
let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  cached = createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cached;
}
