import "server-only";
import { createClient } from "@supabase/supabase-js";
/** service_role client — bypasses RLS. ONLY for account deletion, notifications, and integration secrets. Never pass user ids from clients. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}
