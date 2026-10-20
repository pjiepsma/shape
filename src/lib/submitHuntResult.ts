import { composeHuntMosaic } from '@/camera/composeHuntMosaic';
import { getCachedDisplayName, loadProfile, saveUsername } from '@/lib/profile';
import { getSupabase } from '@/lib/supabase';
import type { HuntPhoto } from '@/store/huntStore';

export type HuntResultRow = {
  id: string;
  user_id: string;
  display_name: string;
  end_score: number;
  result_image_path: string;
  hunt_date: string;
  created_at: string;
  /** Present on average board rows. */
  hunt_count?: number;
};

export type SubmitHuntResultArgs = {
  /** Required on first submit when no profile exists yet. */
  displayName?: string;
  endScore: number;
  photos: readonly HuntPhoto[];
};

export type SubmitHuntResultOk = {
  id: string;
  resultImageUrl: string;
};

const BUCKET = 'hunt-results';

export async function submitHuntResult(args: SubmitHuntResultArgs): Promise<SubmitHuntResultOk> {
  if (args.endScore < 0 || args.endScore > 1) {
    throw new Error('Invalid end score');
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase is not configured — add keys to .env');
  }

  const existing = await loadProfile();
  const cachedName = existing?.displayName ?? (await getCachedDisplayName());
  const displayName = (cachedName ?? args.displayName ?? '').trim();
  if (displayName.length < 1) {
    throw new Error('Choose a username before submitting');
  }

  const { userId } = await saveUsername(displayName);

  const mosaicUri = await composeHuntMosaic(args.photos);
  const resultId = globalThis.crypto?.randomUUID?.() ?? fallbackUuid();
  const objectPath = `${userId}/${resultId}.jpg`;

  const fileResponse = await fetch(mosaicUri);
  const bytes = await fileResponse.arrayBuffer();

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, bytes, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const huntDate = new Date().toISOString().slice(0, 10);

  const { data, error: insertError } = await supabase
    .from('hunt_results')
    .insert({
      id: resultId,
      user_id: userId,
      display_name: displayName,
      end_score: args.endScore,
      result_image_path: objectPath,
      hunt_date: huntDate,
    })
    .select('id')
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);

  return {
    id: data.id,
    resultImageUrl: publicUrlData.publicUrl,
  };
}

export function huntResultPublicUrl(resultImagePath: string): string | null {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }
  return supabase.storage.from(BUCKET).getPublicUrl(resultImagePath).data.publicUrl;
}

export async function fetchTodayLeaderboard(limit: number = 50): Promise<HuntResultRow[]> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase is not configured — add keys to .env');
  }

  const huntDate = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('hunt_results')
    .select('id, user_id, display_name, end_score, result_image_path, hunt_date, created_at')
    .eq('hunt_date', huntDate)
    .order('end_score', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchOverallLeaderboard(limit: number = 50): Promise<HuntResultRow[]> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase is not configured — add keys to .env');
  }

  const { data, error } = await supabase.rpc('fetch_leaderboard_all_time', {
    result_limit: limit,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.filter(isHuntResultRow);
}

export async function fetchAverageLeaderboard(limit: number = 50): Promise<HuntResultRow[]> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase is not configured — add keys to .env');
  }

  const { data, error } = await supabase.rpc('fetch_leaderboard_avg_all_time', {
    result_limit: limit,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.filter(isHuntResultRow);
}

function isHuntResultRow(value: unknown): value is HuntResultRow {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('id' in value) || typeof value.id !== 'string') {
    return false;
  }
  if (!('user_id' in value) || typeof value.user_id !== 'string') {
    return false;
  }
  if (!('display_name' in value) || typeof value.display_name !== 'string') {
    return false;
  }
  if (!('end_score' in value) || typeof value.end_score !== 'number') {
    return false;
  }
  if (!('result_image_path' in value) || typeof value.result_image_path !== 'string') {
    return false;
  }
  if (!('hunt_date' in value) || typeof value.hunt_date !== 'string') {
    return false;
  }
  if (!('created_at' in value) || typeof value.created_at !== 'string') {
    return false;
  }
  if (
    'hunt_count' in value &&
    value.hunt_count !== undefined &&
    typeof value.hunt_count !== 'number'
  ) {
    return false;
  }
  return true;
}

function fallbackUuid(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
