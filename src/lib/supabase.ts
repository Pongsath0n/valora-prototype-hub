import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ─── Lazy Singleton ───────────────────────────────────────────────────────────
// We defer the error to call-time rather than module-load so the app can boot
// without env vars in development (e.g. when using the mock payment gateway).
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "[Supabase] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env. " +
      "Copy .env.example to .env and fill in your project credentials."
    );
  }

  _client = createClient(url, key);
  return _client;
}

/** Convenient alias for direct usage */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
