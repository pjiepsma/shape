import type { GridRect } from '@/shapeEngine';

export type OverlayLayout = {
  width: number;
  height: number;
  /** Side length of the square shape area in px. */
  size: number;
  offsetX: number;
  offsetY: number;
};

/** Zoom window in normalized project coords (0..1). */
export type FitWindow = { x: number; y: number; size: number };

/**
 * Full-project square centered in the view (select screen / default).
 * `edgeInsetPx` pulls the grid away from screen edges (system back gesture).
 */
export function computeOverlayLayout(
  width: number,
  height: number,
  edgeInsetPx: number = 0,
): OverlayLayout {
  const inset = Math.max(0, edgeInsetPx);
  const size = Math.max(0, Math.min(width - inset * 2, height - inset * 2));
  return {
    width,
    height,
    size,
    offsetX: (width - size) / 2,
    offsetY: (height - size) / 2,
  };
}

/**
 * Fit a project-grid rectangle into the viewfinder so the selected aura is large.
 * Maps normalized project coords through a zoomed window covering `rect` (+ padding).
 */
export function computeFitOverlayLayout(
  width: number,
  height: number,
  rect: GridRect,
  gridSize: number,
): OverlayLayout & { window: FitWindow } {
  const minX = Math.min(rect.minX, rect.maxX) / gridSize;
  const maxX = (Math.max(rect.minX, rect.maxX) + 1) / gridSize;
  const minY = Math.min(rect.minY, rect.maxY) / gridSize;
  const maxY = (Math.max(rect.minY, rect.maxY) + 1) / gridSize;
  const pad = 0.06;
  const contentMinX = Math.max(0, minX - pad);
  const contentMinY = Math.max(0, minY - pad);
  const contentMaxX = Math.min(1, maxX + pad);
  const contentMaxY = Math.min(1, maxY + pad);
  const contentW = Math.max(contentMaxX - contentMinX, 0.05);
  const contentH = Math.max(contentMaxY - contentMinY, 0.05);
  // Square window centered on the selection (not top-left anchored),
  // so a short wide band does not pull in outline below/above it.
  const windowSize = Math.min(1, Math.max(contentW, contentH));
  const centerX = (contentMinX + contentMaxX) / 2;
  const centerY = (contentMinY + contentMaxY) / 2;
  const windowX = Math.max(0, Math.min(1 - windowSize, centerX - windowSize / 2));
  const windowY = Math.max(0, Math.min(1 - windowSize, centerY - windowSize / 2));
  const size = Math.min(width, height);

  return {
    width,
    height,
    size,
    offsetX: (width - size) / 2,
    offsetY: (height - size) / 2,
    window: {
      x: windowX,
      y: windowY,
      size: windowSize,
    },
  };
}

export function toScreen(
  normalizedX: number,
  normalizedY: number,
  layout: OverlayLayout,
  window?: FitWindow,
) {
  if (!window) {
    return {
      x: layout.offsetX + normalizedX * layout.size,
      y: layout.offsetY + normalizedY * layout.size,
    };
  }
  return {
    x: layout.offsetX + ((normalizedX - window.x) / window.size) * layout.size,
    y: layout.offsetY + ((normalizedY - window.y) / window.size) * layout.size,
  };
}

/** Screen pixel box for an inclusive grid rect (full-project or zoomed window). */
export function gridRectToScreen(
  rect: GridRect,
  layout: OverlayLayout,
  gridSize: number,
  window?: FitWindow,
): { x: number; y: number; width: number; height: number } {
  const minX = Math.min(rect.minX, rect.maxX);
  const maxX = Math.max(rect.minX, rect.maxX);
  const minY = Math.min(rect.minY, rect.maxY);
  const maxY = Math.max(rect.minY, rect.maxY);
  const topLeft = toScreen(minX / gridSize, minY / gridSize, layout, window);
  const bottomRight = toScreen((maxX + 1) / gridSize, (maxY + 1) / gridSize, layout, window);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

export function hitTestGridCell(
  touchX: number,
  touchY: number,
  layout: OverlayLayout,
  gridSize: number,
): { x: number; y: number; index: number } | null {
  const localX = touchX - layout.offsetX;
  const localY = touchY - layout.offsetY;
  if (localX < 0 || localY < 0 || localX >= layout.size || localY >= layout.size) {
    return null;
  }
  const x = Math.min(gridSize - 1, Math.floor((localX / layout.size) * gridSize));
  const y = Math.min(gridSize - 1, Math.floor((localY / layout.size) * gridSize));
  return { x, y, index: y * gridSize + x };
}
