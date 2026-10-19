import { ImageFormat, Skia } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';

import { gameRules } from '@/config/gameRules';

/**
 * The camera sensor is landscape. The live preview is upright portrait.
 * Expo usually bakes a 90° rotation into the JPEG; sometimes it does not
 * (live: good shots 3060×4080, bad shot 4080×3060). When the saved aspect
 * disagrees with the preview aspect, bake the missing 90° so display + score
 * match what the player saw — no flip/mirror guessing.
 */
export async function alignCaptureToPreviewAspect(args: {
  uri: string;
  photoWidth: number;
  photoHeight: number;
  viewWidth: number;
  viewHeight: number;
}): Promise<{ uri: string; rotatedDegrees: 0 | 90; photoBefore: { w: number; h: number } }> {
  const photoBefore = { w: args.photoWidth, h: args.photoHeight };
  const viewPortrait = args.viewHeight >= args.viewWidth;
  const photoPortrait = args.photoHeight >= args.photoWidth;

  if (viewPortrait === photoPortrait || args.photoWidth <= 0 || args.photoHeight <= 0) {
    return { uri: args.uri, rotatedDegrees: 0, photoBefore };
  }

  // Portrait app + landscape JPEG → same bake Expo applies for ORIENTATION_ROTATE_90.
  const uri = await rotateJpeg90Cw(args.uri);
  return { uri, rotatedDegrees: 90, photoBefore };
}

async function rotateJpeg90Cw(uri: string): Promise<string> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) {
    throw new Error('Could not decode photo for aspect align');
  }
  const srcW = image.width();
  const srcH = image.height();
  if (srcW <= 0 || srcH <= 0) {
    throw new Error('Photo has invalid dimensions for aspect align');
  }

  const outW = srcH;
  const outH = srcW;
  const surface = Skia.Surface.MakeOffscreen(outW, outH);
  if (!surface) {
    throw new Error('Could not create aspect-align surface');
  }
  const canvas = surface.getCanvas();
  canvas.translate(outW, 0);
  canvas.rotate(90, 0, 0);
  canvas.drawImage(image, 0, 0);
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  const quality = Math.round(gameRules.storage.jpegQuality * 100);
  const base64 = snapshot.encodeToBase64(ImageFormat.JPEG, quality);
  if (!base64) {
    throw new Error('Could not encode aspect-aligned photo');
  }

  const dir = FileSystem.cacheDirectory;
  if (!dir) {
    throw new Error('No cache directory for aspect-aligned photo');
  }
  const outUri = `${dir}capture-aspect-${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(outUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return outUri;
}
