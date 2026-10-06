import { createClient } from '../../assets/supabase.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config/supabase.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: (url, options) => fetch(url, { ...options, signal: options?.signal ?? AbortSignal.timeout(15000) }) },
});
