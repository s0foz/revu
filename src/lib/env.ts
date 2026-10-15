/**
 * Server-side environment access.
 *
 * Values are read lazily so a missing variable fails at request time with a
 * readable message instead of crashing module evaluation during `next build`.
 *
 * `NEXT_PUBLIC_*` variables that the browser needs are read as literals inside
 * src/lib/supabase/client.ts, because Next inlines them at build time and a
 * dynamic lookup would not be replaced.
 *
 * See .env.example for the full list.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export function optionalEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : null;
}

/** Supabase project URL. Safe to expose to the browser. */
export function supabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

/**
 * Service role key. Server only — never import this into a Client Component and
 * never prefix it with NEXT_PUBLIC_.
 */
export function supabaseServiceRoleKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

/** Absolute origin of the app, used to build redirect URLs. */
export function appUrl(): string {
  return optionalEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
}
