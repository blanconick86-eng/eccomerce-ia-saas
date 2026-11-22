import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseAdminEnv,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/env";

export { isSupabaseAdminConfigured };

export function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseAdminEnv();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
