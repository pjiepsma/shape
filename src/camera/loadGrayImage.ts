import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';

import type { GrayImage } from '@/shapeEngine';

export type LoadedGrayImage = GrayImage & {
  /** Encoded JPEG pixel size as Skia decoded it (EXIF not applied). */
  sourceWidth: number;
  sourceHeight: number;
};

/**
 * Decode a local photo URI, downscale to `targetWidth`, and return grayscale pixels.
 */
export async function loadGrayImage(uri: string, targetWidth: number): Promise<LoadedGrayImage> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) {
    throw new Error('Could not decode photo');
  }

  const srcW = image.width();
  const srcH = image.height();
  if (srcW <= 0 || srcH <= 0) {
    throw new Error('Photo has invalid dimensions');
  }

  const width = Math.max(1, Math.round(targetWidth));
  const height = Math.max(1, Math.round((targetWidth / srcW) * srcH));
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) {
    throw new Error('Could not create offscreen surface');
  }

  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  const src = Skia.XYWHRect(0, 0, srcW, srcH);
  const dst = Skia.XYWHRect(0, 0, width, height);
  canvas.drawImageRect(image, src, dst, paint);
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  const rgba = snapshot.readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!rgba) {
    throw new Error('Could not read photo pixels');
  }

  const pixels = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    const r = rgba[o] ?? 0;
    const g = rgba[o + 1] ?? 0;
    const b = rgba[o + 2] ?? 0;
    pixels[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  return { width, height, pixels, sourceWidth: srcW, sourceHeight: srcH };
}
