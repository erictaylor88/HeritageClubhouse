import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. SERVER ONLY — never import into a Client
 * Component or anything that ships to the browser. Bypasses RLS, so it is used
 * exclusively for trusted server work: the `course_cache` write-through and the
 * SSR public share route. The session is not persisted (no cookies, no refresh).
 *
 * Per the project hard rules: `SUPABASE_SERVICE_ROLE_KEY` lives only in server
 * env (Vercel) and is never exposed with `NEXT_PUBLIC_`.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
