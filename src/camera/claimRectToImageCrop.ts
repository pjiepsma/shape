import type { GridRect } from '@/shapeEngine';

export type ViewSize = { width: number; height: number };
export type ViewWindow = { x: number; y: number; size: number };

/** Inclusive claim grid rect → integer crop box in photo pixels. */
export function claimRectToImageCrop(args: {
  imageWidth: number;
  imageHeight: number;
  viewSize: ViewSize;
  viewWindow: ViewWindow;
  claimRect: GridRect;
  gridSize: number;
}): { originX: number; originY: number; width: number; height: number } {
  const { imageWidth, imageHeight, viewSize, viewWindow, claimRect, gridSize } = args;
  const minX = Math.min(claimRect.minX, claimRect.maxX) / gridSize;
  const maxX = (Math.max(claimRect.minX, claimRect.maxX) + 1) / gridSize;
  const minY = Math.min(claimRect.minY, claimRect.maxY) / gridSize;
  const maxY = (Math.max(claimRect.minY, claimRect.maxY) + 1) / gridSize;

  const corners = [
    projectNormalizedToImage(minX, minY, imageWidth, imageHeight, viewSize, viewWindow),
    projectNormalizedToImage(maxX, minY, imageWidth, imageHeight, viewSize, viewWindow),
    projectNormalizedToImage(minX, maxY, imageWidth, imageHeight, viewSize, viewWindow),
    projectNormalizedToImage(maxX, maxY, imageWidth, imageHeight, viewSize, viewWindow),
  ];

  let left = Math.min(...corners.map((p) => p.x));
  let right = Math.max(...corners.map((p) => p.x));
  let top = Math.min(...corners.map((p) => p.y));
  let bottom = Math.max(...corners.map((p) => p.y));

  left = Math.max(0, Math.min(imageWidth - 1, left));
  top = Math.max(0, Math.min(imageHeight - 1, top));
  right = Math.max(left + 1, Math.min(imageWidth, right));
  bottom = Math.max(top + 1, Math.min(imageHeight, bottom));

  const originX = Math.floor(left);
  const originY = Math.floor(top);
  const width = Math.max(1, Math.ceil(right) - originX);
  const height = Math.max(1, Math.ceil(bottom) - originY);

  return {
    originX,
    originY,
    width: Math.min(width, imageWidth - originX),
    height: Math.min(height, imageHeight - originY),
  };
}

function projectNormalizedToImage(
  nx: number,
  ny: number,
  imageWidth: number,
  imageHeight: number,
  viewSize: ViewSize,
  viewWindow: ViewWindow,
): { x: number; y: number } {
  const u = (nx - viewWindow.x) / viewWindow.size;
  const v = (ny - viewWindow.y) / viewWindow.size;

  const scale = Math.max(viewSize.width / imageWidth, viewSize.height / imageHeight);
  const sideView = Math.min(viewSize.width, viewSize.height);
  const sqX = (viewSize.width - sideView) / 2;
  const sqY = (viewSize.height - sideView) / 2;
  const originX = (viewSize.width - imageWidth * scale) / 2;
  const originY = (viewSize.height - imageHeight * scale) / 2;
  const vx = sqX + u * sideView;
  const vy = sqY + v * sideView;
  return {
    x: (vx - originX) / scale,
    y: (vy - originY) / scale,
  };
}
