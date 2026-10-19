import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { NativeModules, Platform } from 'react-native';

import type { GrayImage } from '@/shapeEngine';

const INGEST_PATH = '/ingest/607d09ba-1f8f-4fdb-91b5-28274c52e0a7';
/** Cursor binds 7482 on localhost only; 17482 is a LAN proxy on the Mac. */
const INGEST_PORTS = [17482, 7482] as const;
const SESSION = '4b16c8';
/** Base64 JPEG above this is dropped from the HTTP body (gray is enough to replay). */
const MAX_PHOTO_BASE64 = 1_500_000;

type ExtraConfig = {
  debugIngestHost?: string;
};

/**
 * Mac host the device can reach for Cursor debug ingest.
 * Prefer baked LAN IP from app.config (set when Metro evaluates config).
 */
export function metroDebugHost(): string | null {
  const candidates: string[] = [];

  const envHost = process.env.EXPO_PUBLIC_DEBUG_INGEST_HOST?.trim();
  if (envHost) {
    candidates.push(envHost);
  }

  const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;
  if (extra.debugIngestHost) {
    candidates.push(extra.debugIngestHost);
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    candidates.push(hostUri);
  }

  const expoGoDebugger = Constants.expoGoConfig?.debuggerHost;
  if (expoGoDebugger) {
    candidates.push(expoGoDebugger);
  }

  const legacyManifest = Constants.manifest as { debuggerHost?: string } | null;
  if (legacyManifest?.debuggerHost) {
    candidates.push(legacyManifest.debuggerHost);
  }

  const manifest2Host = readManifest2DebuggerHost();
  if (manifest2Host) {
    candidates.push(manifest2Host);
  }

  const linkingUri = Constants.linkingUri;
  if (linkingUri) {
    candidates.push(linkingUri);
  }

  const scriptURL = NativeModules.SourceCode?.scriptURL as string | undefined;
  if (scriptURL) {
    candidates.push(scriptURL);
  }

  for (const candidate of candidates) {
    const host = extractHost(candidate);
    if (host) {
      return host;
    }
  }
  return null;
}

/** Full scoring gray as base64 (same pixels scoreMatch used). */
export function grayImageBase64(gray: GrayImage): {
  width: number;
  height: number;
  pixelsBase64: string;
} {
  return {
    width: gray.width,
    height: gray.height,
    pixelsBase64: uint8ToBase64(gray.pixels),
  };
}

/**
 * POST metrics + scoring gray (+ JPEG when small enough) to Cursor ingest.
 * Always mirrors a compact gray into Metro; never swallows ingest failures silently.
 */
export async function postScoreDebugCapture(args: {
  runId: string;
  hypothesisId: string;
  message: string;
  data: Record<string, unknown>;
  gray: GrayImage;
  photoUri: string;
}): Promise<void> {
  const host = metroDebugHost();
  const grayFull = grayImageBase64(args.gray);
  const grayMetro = grayPreviewBase64(args.gray, 96);

  let photoBase64: string | null = null;
  try {
    photoBase64 = await FileSystem.readAsStringAsync(args.photoUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (error) {
    console.log(
      `SCORE_MATCH_PHOTO_READ_FAIL=${JSON.stringify({
        uri: args.photoUri,
        error: error instanceof Error ? error.message : String(error),
      })}`,
    );
    photoBase64 = null;
  }

  const photoForHttp =
    photoBase64 && photoBase64.length <= MAX_PHOTO_BASE64 ? photoBase64 : null;

  console.log(
    `SCORE_MATCH_CAPTURE_SAVED=${JSON.stringify({
      host,
      platform: Platform.OS,
      grayFull: {
        width: grayFull.width,
        height: grayFull.height,
        bytes: grayFull.pixelsBase64.length,
      },
      photoBytes: photoBase64?.length ?? 0,
      photoInHttp: photoForHttp !== null,
      score: args.data.score,
      viewWindow: args.data.hypD_viewWindow ?? null,
      note: 'grayFull = exact scoreMatch pixels; viewWindow is overlay/score mapping only',
    })}`,
  );

  console.log(
    `SCORE_MATCH_GRAY_META=${JSON.stringify({
      width: grayMetro.width,
      height: grayMetro.height,
      fullWidth: grayFull.width,
      fullHeight: grayFull.height,
    })}`,
  );
  const chunkSize = 1800;
  for (let i = 0; i < grayMetro.pixelsBase64.length; i += chunkSize) {
    console.log(`SCORE_MATCH_GRAY_CHUNK=${grayMetro.pixelsBase64.slice(i, i + chunkSize)}`);
  }
  console.log('SCORE_MATCH_GRAY_END');

  const payload = {
    sessionId: SESSION,
    runId: args.runId,
    hypothesisId: args.hypothesisId,
    location: 'camera.tsx:onShutter',
    message: args.message,
    data: {
      ...args.data,
      note: 'grayFull is exact scoreMatch luminance; photo may be omitted if too large',
      grayPreview: grayMetro,
      grayFull,
      photoJpegBase64: photoForHttp,
      photoJpegBytes: photoBase64?.length ?? 0,
      photoUri: args.photoUri,
      metroHost: host,
    },
    timestamp: Date.now(),
  };

  const endpoints = ingestEndpoints(host);
  if (endpoints.length === 0) {
    console.log(
      `SCORE_MATCH_INGEST_FAIL=${JSON.stringify({
        reason: 'no_host',
        hint: 'Set EXPO_PUBLIC_DEBUG_INGEST_HOST to your Mac LAN IP and reload',
      })}`,
    );
    return;
  }

  const body = JSON.stringify(payload);
  // USB reverse first; parallel LAN was canceling / racing the only working path.
  const ordered = [
    ...endpoints.filter((url) => url.includes('127.0.0.1:7482')),
    ...endpoints.filter((url) => !url.includes('127.0.0.1:7482')),
  ];
  const results: {
    url: string;
    ok: boolean;
    status: number;
    error?: string;
  }[] = [];
  let anyOk = false;
  for (const url of ordered) {
    if (anyOk) {
      results.push({ url, ok: false, status: 0, error: 'skipped_after_ok' });
      continue;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': SESSION,
        },
        body,
        signal: controller.signal,
      });
      const entry = { url, ok: response.ok, status: response.status };
      results.push(entry);
      if (entry.ok) {
        anyOk = true;
      }
    } catch (error) {
      results.push({
        url,
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  console.log(
    anyOk
      ? `SCORE_MATCH_INGEST_OK=${JSON.stringify({ host, results })}`
      : `SCORE_MATCH_INGEST_FAIL=${JSON.stringify({
          host,
          results,
          hint:
            Platform.OS === 'android'
              ? 'Same WiFi as Mac, or: adb reverse tcp:7482 tcp:7482'
              : 'Same WiFi as Mac; ATS local networking must be enabled',
        })}`,
  );
}

function ingestEndpoints(host: string | null): string[] {
  const urls = new Set<string>();
  for (const port of INGEST_PORTS) {
    if (host) {
      urls.add(`http://${host}:${port}${INGEST_PATH}`);
    }
    // USB: adb reverse tcp:7482 tcp:7482 → phone localhost reaches Mac ingest.
    urls.add(`http://127.0.0.1:${port}${INGEST_PATH}`);
    // Android emulator → host loopback.
    if (Platform.OS === 'android') {
      urls.add(`http://10.0.2.2:${port}${INGEST_PATH}`);
    }
  }
  return [...urls];
}

function grayPreviewBase64(
  gray: GrayImage,
  maxSide: number,
): { width: number; height: number; pixelsBase64: string } {
  const scale = Math.min(1, maxSide / Math.max(gray.width, gray.height));
  const width = Math.max(1, Math.round(gray.width * scale));
  const height = Math.max(1, Math.round(gray.height * scale));
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(gray.width - 1, Math.floor((x / width) * gray.width));
      const sy = Math.min(gray.height - 1, Math.floor((y / height) * gray.height));
      pixels[y * width + x] = gray.pixels[sy * gray.width + sx] ?? 0;
    }
  }
  return { width, height, pixelsBase64: uint8ToBase64(pixels) };
}

function readManifest2DebuggerHost(): string | null {
  const manifest2 = Constants.manifest2 as
    | {
        extra?: {
          expoClient?: { hostUri?: string };
          expoGo?: { debuggerHost?: string };
        };
      }
    | null
    | undefined;
  return (
    manifest2?.extra?.expoGo?.debuggerHost ??
    manifest2?.extra?.expoClient?.hostUri ??
    null
  );
}

function extractHost(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    if (trimmed.includes('://')) {
      const hostname = new URL(trimmed).hostname;
      return isUsableHost(hostname) ? hostname : null;
    }
    // host:port or bare IP / hostname
    const host = trimmed.split('/')[0]?.split(':')[0]?.trim() ?? '';
    return isUsableHost(host) ? host : null;
  } catch {
    return null;
  }
}

function isUsableHost(host: string): boolean {
  if (!host) {
    return false;
  }
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1') {
    return false;
  }
  return true;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    out += chars[(triple >> 18) & 63];
    out += chars[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? chars[(triple >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? chars[triple & 63] : '=';
  }
  return out;
}
