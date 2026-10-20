import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { gameRules } from '@/config/gameRules';

export type NormalizedCapture = {
  uri: string;
  width: number;
  height: number;
};

/**
 * Re-encode a capture so EXIF orientation is baked into pixels.
 * Skia ignores EXIF; scoring and claim crop need upright buffers.
 * Downsamples at load to uploadMaxWidth to keep shutter latency low.
 */
export async function normalizeCaptureUri(uri: string): Promise<NormalizedCapture> {
  const context = ImageManipulator.manipulate(uri, {
    maxWidth: gameRules.storage.uploadMaxWidth,
  });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: gameRules.storage.jpegQuality,
    format: SaveFormat.JPEG,
  });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
