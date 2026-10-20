import AsyncStorage from '@react-native-async-storage/async-storage';

import { ensureAnonymousSession, getSupabase } from '@/lib/supabase';

const PROFILE_NAME_KEY = 'outsee.profile.displayName';

export type Profile = {
  userId: string;
  displayName: string;
};

function normalizeDisplayName(raw: string): string {
  return raw.trim();
}

function assertValidDisplayName(name: string): void {
  if (name.length < 1 || name.length > 24) {
    throw new Error('Username must be 1–24 characters');
  }
}

/** Cached name for UI before/without network. */
export async function getCachedDisplayName(): Promise<string | null> {
  const value = await AsyncStorage.getItem(PROFILE_NAME_KEY);
  if (!value) {
    return null;
  }
  const name = normalizeDisplayName(value);
  return name.length > 0 ? name : null;
}

async function setCachedDisplayName(name: string): Promise<void> {
  await AsyncStorage.setItem(PROFILE_NAME_KEY, name);
}

/** Load profile from Supabase (and refresh local cache). Returns null if none. */
export async function loadProfile(): Promise<Profile | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return null;
  }

  const userId = session.user.id;
  const row = await supabase
    .from('profiles')
    .select('user_id, display_name')
    .eq('user_id', userId)
    .maybeSingle()
    .then((res) => {
      if (res.error) {
        throw new Error(res.error.message);
      }
      return res.data;
    });

  if (!row) {
    return null;
  }

  const displayName = normalizeDisplayName(row.display_name);
  await setCachedDisplayName(displayName);
  return { userId: row.user_id, displayName };
}

/** Ensure anon session and upsert username on profiles. */
export async function saveUsername(rawName: string): Promise<Profile> {
  const displayName = normalizeDisplayName(rawName);
  assertValidDisplayName(displayName);

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase is not configured — add keys to .env');
  }

  const userId = await ensureAnonymousSession();
  const now = new Date().toISOString();

  const { error } = await supabase.from('profiles').upsert(
    {
      user_id: userId,
      display_name: displayName,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    if (error.code === '23505') {
      throw new Error('That username is already taken');
    }
    throw new Error(error.message);
  }

  await setCachedDisplayName(displayName);
  return { userId, displayName };
}
