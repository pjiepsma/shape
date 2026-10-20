import { ImageFormat, PaintStyle, Skia, type SkCanvas } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';

import {
  computeOverlayLayout,
  gridRectToScreen,
  toScreen,
  type OverlayLayout,
} from '@/camera/overlayLayout';
import { gameRules } from '@/config/gameRules';
import { buildShape, pawnShape, type PathSample } from '@/shapeEngine';
import type { HuntPhoto } from '@/store/huntStore';
import { colors } from '@/theme/colors';

const MOSAIC_BG = colors.background;
const OUTLINE_COLOR = colors.accent;

/**
 * Compose the finished hunt collage (claim tiles + outline) into one JPEG
 * for leaderboard upload — same geometry as the complete screen mosaic.
 */
export async function composeHuntMosaic(photos: readonly HuntPhoto[]): Promise<string> {
  if (photos.length === 0) {
    throw new Error('No photos to compose');
  }

  const size = gameRules.storage.uploadMaxWidth;
  const layout = computeOverlayLayout(size, size, 0);
  const shape = buildShape(pawnShape);
  const gridSize = shape.definition.gridSize;

  const surface = Skia.Surface.MakeOffscreen(size, size);
  if (!surface) {
    throw new Error('Could not create mosaic surface');
  }
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color(MOSAIC_BG));

  const paint = Skia.Paint();
  paint.setAntiAlias(true);

  for (const photo of photos) {
    const frame = gridRectToScreen(photo.rect, layout, gridSize);
    if (frame.width <= 0 || frame.height <= 0) {
      continue;
    }

    if (photo.uri) {
      const data = await Skia.Data.fromURI(photo.uri);
      const image = Skia.Image.MakeImageFromEncoded(data);
      if (image) {
        const src = Skia.XYWHRect(0, 0, image.width(), image.height());
        const dst = Skia.XYWHRect(frame.x, frame.y, frame.width, frame.height);
        canvas.drawImageRect(image, src, dst, paint);
        continue;
      }
    }

    const fill = Skia.Paint();
    fill.setColor(Skia.Color(photo.color));
    canvas.drawRect(Skia.XYWHRect(frame.x, frame.y, frame.width, frame.height), fill);
  }

  drawOutline(canvas, shape.samples, layout);

  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const quality = Math.round(gameRules.storage.jpegQuality * 100);
  const base64 = snapshot.encodeToBase64(ImageFormat.JPEG, quality);
  if (!base64) {
    throw new Error('Could not encode mosaic JPEG');
  }

  const dir = FileSystem.cacheDirectory;
  if (!dir) {
    throw new Error('No cache directory for mosaic');
  }
  const outUri = `${dir}hunt-mosaic-${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(outUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return outUri;
}

function drawOutline(canvas: SkCanvas, samples: readonly PathSample[], layout: OverlayLayout) {
  if (samples.length < 2) {
    return;
  }

  const firstSample = samples[0];
  if (!firstSample) {
    return;
  }

  const builder = Skia.PathBuilder.Make();
  const first = toScreen(firstSample.x, firstSample.y, layout);
  builder.moveTo(first.x, first.y);
  for (let i = 1; i < samples.length; i += 1) {
    const sample = samples[i];
    if (!sample) {
      continue;
    }
    const point = toScreen(sample.x, sample.y, layout);
    builder.lineTo(point.x, point.y);
  }
  builder.close();
  const path = builder.detach();

  const stroke = Skia.Paint();
  stroke.setAntiAlias(true);
  stroke.setColor(Skia.Color(OUTLINE_COLOR));
  stroke.setStyle(PaintStyle.Stroke);
  stroke.setStrokeWidth(3);
  canvas.drawPath(path, stroke);
}
