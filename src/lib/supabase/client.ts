import { createClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client.
 *
 * Uses the anon key ONLY. Every table has RLS enabled, so this client can only
 * read what the Clerk session JWT allows and can only write comments and
 * deliverable status. All privileged writes happen on the server with the
 * service role (src/lib/supabase/admin.ts).
 */
export function supabaseBrowser() {
  // Read as literals so Next can inline them into the client bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. See .env.example.",
    );
  }

  return createClient(url, anonKey, {
    auth: {
      // Auth is handled by Clerk; Supabase Auth is not used.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
