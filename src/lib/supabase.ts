import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

function getSupabaseConfig(): { url: string; anonKey: string } {
  const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? '';
  return { url, anonKey };
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) {
    return client;
  }

  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return null;
  }

  client = createClient(url, anonKey);
  return client;
}
