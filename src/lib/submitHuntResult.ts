import { composeHuntMosaic } from '@/camera/composeHuntMosaic';
import { ensureAnonymousSession, getSupabase } from '@/lib/supabase';
import type { HuntPhoto } from '@/store/huntStore';

export type HuntResultRow = {
  id: string;
  user_id: string;
  display_name: string;
  end_score: number;
  result_image_path: string;
  hunt_date: string;
  created_at: string;
};

export type SubmitHuntResultArgs = {
  displayName: string;
  endScore: number;
  photos: readonly HuntPhoto[];
};

export type SubmitHuntResultOk = {
  id: string;
  resultImageUrl: string;
};

const BUCKET = 'hunt-results';

export async function submitHuntResult(args: SubmitHuntResultArgs): Promise<SubmitHuntResultOk> {
  const name = args.displayName.trim();
  if (name.length < 1 || name.length > 24) {
    throw new Error('Display name must be 1–24 characters');
  }
  if (args.endScore < 0 || args.endScore > 1) {
    throw new Error('Invalid end score');
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase is not configured — add keys to .env');
  }

  const userId = await ensureAnonymousSession();
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
      display_name: name,
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
