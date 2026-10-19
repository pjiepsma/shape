import { ImageFormat, Skia } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';

import {
  claimRectToImageCrop,
  type ViewSize,
  type ViewWindow,
} from '@/camera/claimRectToImageCrop';
import type { GridRect } from '@/shapeEngine';

export type { ViewSize, ViewWindow };

/**
 * Crop the camera JPEG to the claim-rect snippet the player aligned in the
 * viewfinder (same cover + fit-window geometry as scoreMatch).
 */
export async function cropClaimSnippet(args: {
  uri: string;
  viewSize: ViewSize;
  viewWindow: ViewWindow;
  claimRect: GridRect;
  gridSize: number;
}): Promise<string> {
  const data = await Skia.Data.fromURI(args.uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) {
    throw new Error('Could not decode photo for claim crop');
  }

  const imageWidth = image.width();
  const imageHeight = image.height();
  if (imageWidth <= 0 || imageHeight <= 0) {
    throw new Error('Photo has invalid dimensions for claim crop');
  }

  const crop = claimRectToImageCrop({
    imageWidth,
    imageHeight,
    viewSize: args.viewSize,
    viewWindow: args.viewWindow,
    claimRect: args.claimRect,
    gridSize: args.gridSize,
  });

  const surface = Skia.Surface.MakeOffscreen(crop.width, crop.height);
  if (!surface) {
    throw new Error('Could not create crop surface');
  }
  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  const src = Skia.XYWHRect(crop.originX, crop.originY, crop.width, crop.height);
  const dst = Skia.XYWHRect(0, 0, crop.width, crop.height);
  canvas.drawImageRect(image, src, dst, paint);
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  const base64 = snapshot.encodeToBase64(ImageFormat.JPEG, 85);
  if (!base64) {
    throw new Error('Could not encode claim snippet');
  }

  const dir = FileSystem.cacheDirectory;
  if (!dir) {
    throw new Error('No cache directory for claim snippet');
  }
  const outUri = `${dir}claim-snippet-${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(outUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return outUri;
}
